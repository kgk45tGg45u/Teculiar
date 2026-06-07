/**
 * Password reset E2E tests.
 *
 * Covers:
 *  - Admin and client forgot-password inline form flow
 *  - Reset password page (/reset-password) renders the new card UI
 *  - Reset password page rejects a missing/invalid token gracefully
 *
 * Run against production:
 *   PLAYWRIGHT_BASE_URL=https://www.dezhost.com npx playwright test password-reset
 *
 * Run against local dev:
 *   npx playwright test password-reset
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = "admin@solibox.net";

// ── Admin forgot-password flow ────────────────────────────────────────────────

test.describe("Admin forgot-password flow", () => {
  test("admin login renders Forgot password button", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/admin/login`);

    await expect(page.getByRole("button", { name: /Forgot password\?/i })).toBeVisible();
  });

  test("clicking Forgot password shows reset form", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/admin/login`);

    await page.getByRole("button", { name: /Forgot password\?/i }).click();

    await expect(page.getByRole("heading", { name: /Reset your password/i })).toBeVisible();
    await expect(page.locator('[name="resetEmail"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Send reset link/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Back to login/i })).toBeVisible();
  });

  test("submitting admin email shows confirmation message", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/admin/login`);

    await page.getByRole("button", { name: /Forgot password\?/i }).click();
    await page.fill('[name="resetEmail"]', ADMIN_EMAIL);
    await page.getByRole("button", { name: /Send reset link/i }).click();

    // Success state — "If an account exists…" or German equivalent; unique to the done-state div
    await expect(
      page.locator("main").getByText(/If an account exists|Falls das Konto/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Back to login returns to admin login screen", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/admin/login`);

    await page.getByRole("button", { name: /Forgot password\?/i }).click();
    await expect(page.getByRole("heading", { name: /Reset your password/i })).toBeVisible();

    await page.getByRole("button", { name: /Back to login/i }).click();
    await expect(page.getByRole("heading", { name: /Admin Login/i })).toBeVisible();
  });

  test("admin forgot password form has no First Admin Setup block", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/admin/login`);

    // The old admin setup section (Create admin / First admin setup) must not exist
    const main = page.locator("main");
    await expect(main.getByText(/First admin|Ersten Admin|Create admin|Admin erstellen/i)).not.toBeVisible();
    // No <details> inside the login card (nav header uses details for dropdowns, but main must not)
    await expect(main.locator("details")).toHaveCount(0);
  });
});

// ── Client forgot-password flow ───────────────────────────────────────────────

test.describe("Client forgot-password flow", () => {
  test("client login renders Forgot password button", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/login`);

    await expect(page.getByRole("button", { name: /Forgot password\?/i })).toBeVisible();
  });

  test("submitting client email shows confirmation message", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(`${BASE}/login`);

    await page.getByRole("button", { name: /Forgot password\?/i }).click();
    await page.fill('[name="resetEmail"]', "test-nonexistent@dezhost.test");
    await page.getByRole("button", { name: /Send reset link/i }).click();

    // Always returns a vague success to prevent user enumeration
    await expect(
      page.locator("main").getByText(/If an account exists|Falls das Konto/i)
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ── Reset password page (/reset-password) ─────────────────────────────────────

test.describe("Reset password page (/reset-password)", () => {
  test("renders the new card UI with heading and input", async ({ page }) => {
    await page.goto(`${BASE}/reset-password`);

    await expect(page.getByRole("heading", { name: /Reset Password/i })).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Change Password/i })).toBeVisible();
  });

  test("shows error when submitting with no token", async ({ page }) => {
    await page.goto(`${BASE}/reset-password`);

    await page.fill('[name="password"]', "NewSecureP@ssw0rd!");
    await page.getByRole("button", { name: /Change Password/i }).click();

    // API will reject missing / invalid token; check within main to avoid toast strict-mode collision
    await expect(
      page.locator("main").getByText(/failed|expired|invalid/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows success screen after password change with valid token placeholder", async ({ page }) => {
    // We can't get a real token in a test, but we verify the success path renders correctly
    // by stubbing the API response
    await page.route(`**/auth/password-reset/confirm`, (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), contentType: "application/json" })
    );

    await page.goto(`${BASE}/reset-password?token=faketoken.fakesig`);
    await page.fill('[name="password"]', "NewSecureP@ssw0rd!");
    await page.getByRole("button", { name: /Change Password/i }).click();

    // Success state — done view with a "Go to login" link; scope to main to avoid toast collision
    await expect(page.locator("main").getByText(/Password changed/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /Go to login/i })).toBeVisible();
  });
});
