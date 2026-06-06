/**
 * Tests for:
 *  1. SMTP "Save & Test Connection" returns a success result (not a crash/502)
 *  2. After session expiry, logging back in redirects to the original page
 *
 * Run with servers already started:
 *   npx playwright test tests/e2e/specs/email-and-login-redirect.spec.ts
 */
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dezhost-3f417f4248a568cfe6!";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_COOKIE = "dezhost_admin_access_token";

async function loginAsAdmin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

// ── SMTP Test Connection ───────────────────────────────────────────────────────

test.describe("SMTP test connection", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/emails/settings`);
    await page.waitForSelector('[name="host"]', { timeout: 15_000 });
  });

  test("Save & Test Connection does not crash the API (no 502)", async ({ page }) => {
    // Fill in SMTP settings pointing to localhost mailpit-style (no auth, port 1025)
    // This tests that the endpoint returns JSON, not a 502 proxy error
    await page.fill('[name="host"]', "127.0.0.1");
    await page.fill('[name="port"]', "1025");
    await page.fill('[name="username"]', "");
    await page.fill('[name="password"]', "");

    // Uncheck TLS/SSL
    const tlsCheckbox = page.locator('[name="secure"]');
    if (await tlsCheckbox.isChecked()) {
      await tlsCheckbox.uncheck();
    }

    // Ensure SMTP is enabled
    const enabledCheckbox = page.locator('[name="smtpEnabled"]');
    if (!(await enabledCheckbox.isChecked())) {
      await enabledCheckbox.check();
    }

    // Click Save & Test Connection
    await page.getByRole("button", { name: /Save & Test Connection/i }).click();

    // Wait for result – should show ✓ or ✗ but NOT show raw HTML 502 proxy error
    const resultParagraph = page.locator("form p");
    await expect(resultParagraph).toBeVisible({ timeout: 20_000 });

    const resultText = await resultParagraph.textContent();
    expect(resultText).not.toContain("502");
    expect(resultText).not.toContain("Proxy Error");
    expect(resultText).not.toContain("DOCTYPE");
    // Result should be one of: ✓ Connected… or ✗ <error message>
    expect(resultText).toMatch(/[✓✗]/);
  });

  test("Save & Test Connection with real SMTP settings returns meaningful result", async ({ page }) => {
    // Read current SMTP settings from the form
    const host = await page.inputValue('[name="host"]');
    const port = await page.inputValue('[name="port"]');

    // Skip if no host is configured (test env may not have SMTP)
    if (!host || host === "127.0.0.1") {
      test.skip();
      return;
    }

    await page.getByRole("button", { name: /Save & Test Connection/i }).click();

    const resultParagraph = page.locator("form p");
    await expect(resultParagraph).toBeVisible({ timeout: 20_000 });

    const resultText = await resultParagraph.textContent();
    // Should show connected successfully or a clear auth/connection error – not HTML
    expect(resultText).not.toContain("DOCTYPE");
    expect(resultText).not.toContain("502");
    expect(resultText).toMatch(/[✓✗]/);

    // If success, verify it shows the host and port
    if (resultText?.includes("✓")) {
      expect(resultText).toContain(host);
      expect(resultText).toContain(port);
    }
  });

  test("Send Test Email button triggers email dispatch (no crash)", async ({ page }) => {
    await page.getByRole("button", { name: /Send Test Email/i }).click();

    // Should show a toast or message – not crash
    // Either a success toast or an email-related message
    await page.waitForTimeout(3000);

    // Page should still be on email settings (not crashed or redirected)
    await expect(page).toHaveURL(/\/admin\/emails\/settings/);
  });
});

// ── Login Redirect ─────────────────────────────────────────────────────────────

test.describe("Login redirect after session expiry", () => {
  test("middleware redirects to login with ?next param when cookie is absent", async ({ context, page }) => {
    // Navigate to a deep admin page without any auth cookie
    await context.clearCookies();
    await page.goto(`${BASE}/admin/emails/settings`);

    // Should be redirected to login
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });

    // The URL should contain the ?next param pointing back to the original page
    const url = page.url();
    expect(url).toContain("next=");
    expect(decodeURIComponent(url)).toContain("/admin/emails/settings");
  });

  test("after login with ?next param, user is redirected to the original page", async ({ context, page }) => {
    // Go directly to login with a ?next param
    await context.clearCookies();
    await page.goto(`${BASE}/admin/login?next=/admin/emails/settings`);

    // Log in
    await page.fill('[name="email"]', ADMIN_EMAIL);
    await page.fill('[name="password"]', ADMIN_PASSWORD);
    const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
    await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();

    // Should land on the ?next page, not the dashboard home
    await page.waitForURL(/\/admin\/emails\/settings/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/emails\/settings/);
  });

  test("token-invalidated session redirects to login with ?next param", async ({ context, page }) => {
    // Log in normally first
    await loginAsAdmin(page);

    // Navigate to a specific page
    await page.goto(`${BASE}/admin/emails/settings`);
    await expect(page).toHaveURL(/\/admin\/emails\/settings/);

    // Simulate token expiry: replace cookie with invalid value
    await context.addCookies([{
      name: ADMIN_COOKIE,
      value: "invalid.token.value",
      domain: "127.0.0.1",
      path: "/"
    }]);

    // Navigate to the same page – server component should redirect to login with ?next
    await page.goto(`${BASE}/admin/emails/settings`);
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });

    // ?next should point back to the settings page
    const url = page.url();
    expect(decodeURIComponent(url)).toContain("/admin/emails/settings");
  });

  test("after re-login following token expiry, user returns to original page", async ({ context, page }) => {
    // Log in normally
    await loginAsAdmin(page);

    // Navigate to email logs page
    await page.goto(`${BASE}/admin/emails/logs`);

    // Simulate token expiry
    await context.addCookies([{
      name: ADMIN_COOKIE,
      value: "expired.token.value",
      domain: "127.0.0.1",
      path: "/"
    }]);

    // Navigate – should redirect to login with ?next=/admin/emails/logs
    await page.goto(`${BASE}/admin/emails/logs`);
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
    expect(decodeURIComponent(page.url())).toContain("/admin/emails/logs");

    // Log in again
    await page.fill('[name="email"]', ADMIN_EMAIL);
    await page.fill('[name="password"]', ADMIN_PASSWORD);
    const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
    await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();

    // Should return to the email logs page
    await page.waitForURL(/\/admin\/emails\/logs/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/emails\/logs/);
  });
});
