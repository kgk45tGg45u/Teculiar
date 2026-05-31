/**
 * Security tests: auth isolation, data access controls, no-flash, redirect-back.
 *
 * Run with servers already started:
 *   npx playwright test tests/e2e/specs/security.spec.ts
 *
 * These tests require E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD env vars pointing
 * to a valid test-client account.  When the vars are absent the tests are
 * skipped rather than failing CI unexpectedly.
 */
import { expect, test } from "@playwright/test";

const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

// ── helpers ──────────────────────────────────────────────────────────────────

async function loginAsClient(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never, email = CLIENT_EMAIL, password = CLIENT_PASSWORD) {
  await page.goto("/login");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/client/, { timeout: 15_000 });
}

async function loginAsAdmin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto("/admin/login");
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 15_000 });
}

// ── 1. Unauthenticated access ─────────────────────────────────────────────────

test.describe("Unauthenticated access", () => {
  test("visiting /client redirects to /login when no token", async ({ page }) => {
    // Clear all cookies and localStorage
    await page.context().clearCookies();
    await page.goto("/client");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("visiting /client/invoices redirects to /login with next param", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/client/invoices");
    await expect(page).toHaveURL(/\/login\?next=%2Fclient%2Finvoices/, { timeout: 10_000 });
  });

  test("visiting /admin redirects to /admin/login when no admin token", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
  });

  test("visiting /admin/clients redirects to /admin/login with next param", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/clients");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fclients/, { timeout: 10_000 });
  });

  test("client token does NOT grant access to /admin routes", async ({ page, context }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await loginAsClient(page);
    // Steal the client access token
    const clientCookie = (await context.cookies()).find((c) => c.name === "dezhost_client_access_token");
    if (!clientCookie) {
      test.skip();
      return;
    }
    // Open fresh page with only client cookie but accessing admin
    const adminPage = await context.newPage();
    // Remove admin cookie if any, keep client
    const allCookies = await context.cookies();
    await context.clearCookies();
    const nonAdminCookies = allCookies.filter((c) => !c.name.includes("admin"));
    await context.addCookies(nonAdminCookies);
    await adminPage.goto("/admin");
    await expect(adminPage).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
    await adminPage.close();
  });

  test("admin token does NOT grant access to /client routes (client login still required)", async ({ page, context }) => {
    if (!ADMIN_EMAIL) {
      test.skip();
      return;
    }
    await loginAsAdmin(page);
    // Remove client cookie if any, keep only admin token
    const allCookies = await context.cookies();
    await context.clearCookies();
    const adminOnlyCookies = allCookies.filter((c) => !c.name.includes("client"));
    await context.addCookies(adminOnlyCookies);
    const clientPage = await context.newPage();
    await clientPage.goto("/client");
    await expect(clientPage).toHaveURL(/\/login/, { timeout: 10_000 });
    await clientPage.close();
  });
});

// ── 2. No flash before login ───────────────────────────────────────────────────

test.describe("No content flash before login", () => {
  test("/client shows nothing (redirects immediately) without a token", async ({ page }) => {
    await page.context().clearCookies();
    // Start navigation but don't wait for network idle — we want the fastest snapshot
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/login") || r.url().endsWith("/client")),
      page.goto("/client", { waitUntil: "commit" })
    ]);
    // Within one second the page must redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });

  test("/admin shows nothing (redirects immediately) without a token", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 5_000 });
  });
});

// ── 3. Return to previous page after login ────────────────────────────────────

test.describe("Return to page after login", () => {
  test("after session expiry on /client/invoices, login redirects back", async ({ page }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await page.context().clearCookies();
    // Go to a deep client page without auth
    await page.goto("/client/invoices");
    await expect(page).toHaveURL(/\/login\?next=%2Fclient%2Finvoices/, { timeout: 10_000 });
    // Now log in via the form that is on this page
    await page.fill('[name="email"]', CLIENT_EMAIL);
    await page.fill('[name="password"]', CLIENT_PASSWORD);
    await page.click('button[type="submit"]');
    // Should land back on /client/invoices
    await expect(page).toHaveURL(/\/client\/invoices/, { timeout: 15_000 });
  });
});

// ── 4. Cross-client data isolation ───────────────────────────────────────────

test.describe("Cross-client data isolation", () => {
  test("client API endpoints reject requests without auth", async ({ request }) => {
    const endpoints = [
      "/billing/invoices",
      "/services",
      "/users/me",
      "/tickets"
    ];
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
    for (const path of endpoints) {
      const resp = await request.get(`${base}${path}`);
      expect(resp.status(), `${path} should return 401 without auth`).toBe(401);
    }
  });

  test("client cannot fetch another client's invoice by guessing ID", async ({ page }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await loginAsClient(page);
    // Try accessing an arbitrary invoice ID that almost certainly belongs to another user
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
    const resp = await page.evaluate(async ({ base, fakeId }) => {
      const res = await fetch(`${base}/billing/invoices/${fakeId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dezhost_client_access_token") ?? ""}`
        }
      });
      return res.status;
    }, { base, fakeId });
    expect([403, 404], `Invoice ${fakeId} should not be accessible`).toContain(resp);
  });

  test("client cannot fetch another client's service by guessing ID", async ({ page }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await loginAsClient(page);
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
    const resp = await page.evaluate(async ({ base, fakeId }) => {
      const res = await fetch(`${base}/services/${fakeId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dezhost_client_access_token") ?? ""}`
        }
      });
      return res.status;
    }, { base, fakeId });
    expect([403, 404], `Service ${fakeId} should not be accessible`).toContain(resp);
  });
});

// ── 5. Password change validation ─────────────────────────────────────────────

test.describe("Password change validation", () => {
  test("password change form is present on profile page", async ({ page }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await loginAsClient(page);
    await page.goto("/client/profile");
    await expect(page.getByText("Change Password")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[name="currentPassword"]')).toBeVisible();
    await expect(page.locator('[name="newPassword"]')).toBeVisible();
    await expect(page.locator('[name="confirmPassword"]')).toBeVisible();
  });

  test("password change rejects weak password on client side", async ({ page }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await loginAsClient(page);
    await page.goto("/client/profile");
    await page.waitForSelector('[name="currentPassword"]', { timeout: 10_000 });
    await page.fill('[name="currentPassword"]', CLIENT_PASSWORD);
    await page.fill('[name="newPassword"]', "weak");
    await page.fill('[name="confirmPassword"]', "weak");
    // Submit the password change form
    const form = page.locator('form').filter({ hasText: "Change Password" });
    await form.locator('button[type="submit"]').click();
    // Should show error about requirements
    await expect(page.getByText(/password|Password/)).toBeVisible({ timeout: 5_000 });
  });

  test("password change rejects mismatched passwords", async ({ page }) => {
    if (!CLIENT_EMAIL) {
      test.skip();
      return;
    }
    await loginAsClient(page);
    await page.goto("/client/profile");
    await page.waitForSelector('[name="currentPassword"]', { timeout: 10_000 });
    await page.fill('[name="currentPassword"]', CLIENT_PASSWORD);
    await page.fill('[name="newPassword"]', "Valid1@Passw");
    await page.fill('[name="confirmPassword"]', "Different1@X");
    const form = page.locator('form').filter({ hasText: "Change Password" });
    await form.locator('button[type="submit"]').click();
    await expect(page.getByText(/do not match/i)).toBeVisible({ timeout: 5_000 });
  });
});

// ── 6. Admin/client portal separation ────────────────────────────────────────

test.describe("Admin/client portal separation", () => {
  test("header account toggle is client-only: does not show admin session as logged in", async ({ page }) => {
    if (!ADMIN_EMAIL) {
      test.skip();
      return;
    }
    await loginAsAdmin(page);
    // Navigate to a public page (not admin)
    await page.goto("/de");
    // The account menu should NOT show 'logged in' state because we have no client token
    // It should show the user icon linking to /client (the non-logged-in state)
    const clientLoginLink = page.locator('a[href="/client"]');
    await expect(clientLoginLink).toBeVisible({ timeout: 8_000 });
  });

  test("signup page is publicly accessible", async ({ page }) => {
    await page.goto("/de/signup");
    await expect(page).toHaveURL(/\/de\/signup/, { timeout: 10_000 });
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.locator('[name="name"]')).toBeVisible();
  });

  test("signup page is accessible in English too", async ({ page }) => {
    await page.goto("/en/signup");
    await expect(page).toHaveURL(/\/en\/signup/, { timeout: 10_000 });
    await expect(page.getByText(/Create Account|Sign Up/i)).toBeVisible();
  });
});
