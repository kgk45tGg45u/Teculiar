/**
 * Production verification: admin and client are fully separate auth scopes.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/auth-scope-separation.spec.ts --project=chromium --workers=1
 *
 * - admin credentials are rejected on the client portal (API + login page UI)
 * - client credentials are rejected on the admin portal
 * - an email registered as admin can hold an independent client account
 *   (first run signs it up via /auth/register, later runs log in)
 *
 * Needs E2E_ADMIN_*, E2E_CLIENT_* and E2E_ADMIN_AS_CLIENT_PASSWORD env vars.
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";
// Password of the CLIENT-world account that shares the admin's email (created on first run).
const ADMIN_AS_CLIENT_PASSWORD = process.env.E2E_ADMIN_AS_CLIENT_PASSWORD ?? "";

type LoginUser = { user?: { roles?: string[] } };

function login(request: import("@playwright/test").APIRequestContext, email: string, password: string, scope?: "admin" | "client") {
  return request.post(`${API}/auth/login`, { data: { email, password, ...(scope ? { scope } : {}) } });
}

test.describe("admin/client auth scope separation", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_* env vars required");

  test("admin credentials are rejected on the client portal (API)", async ({ request }) => {
    expect((await login(request, ADMIN_EMAIL, ADMIN_PASSWORD, "client")).status(), "explicit client scope").toBe(401);
    expect((await login(request, ADMIN_EMAIL, ADMIN_PASSWORD)).status(), "omitted scope defaults to client").toBe(401);
  });

  test("admin credentials still work on the admin portal (API)", async ({ request }) => {
    const r = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
    expect(r.ok(), `admin login: ${r.status()}`).toBeTruthy();
    const body = (await r.json()) as LoginUser;
    // "agent" is the read-only masked testing role (docs/agent-role.md) — the E2E admin-portal
    // account was switched to it in 2026-07, so it counts as a valid admin-portal role here.
    const staffRoles = ["admin", "super_admin", "support_agent", "sales_agent", "agent"];
    expect((body.user?.roles ?? []).some((role) => staffRoles.includes(role))).toBeTruthy();
  });

  test("client credentials are rejected on the admin portal (API)", async ({ request }) => {
    test.skip(!CLIENT_EMAIL || !CLIENT_PASSWORD, "E2E_CLIENT_* env vars required");
    expect((await login(request, CLIENT_EMAIL, CLIENT_PASSWORD, "admin")).status()).toBe(401);
    const clientLogin = await login(request, CLIENT_EMAIL, CLIENT_PASSWORD, "client");
    expect(clientLogin.ok(), `client login on its own portal: ${clientLogin.status()}`).toBeTruthy();
  });

  test("client login page rejects admin credentials (UI)", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByText(/fehlgeschlagen|failed/i).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("admin login page still signs the admin in (UI)", async ({ page }) => {
    await page.goto(`${BASE}/admin/login`);
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
  });

  test("an email registered as admin can hold an independent client account", async ({ request }) => {
    test.skip(!ADMIN_AS_CLIENT_PASSWORD, "E2E_ADMIN_AS_CLIENT_PASSWORD env var required");

    let clientLogin = await login(request, ADMIN_EMAIL, ADMIN_AS_CLIENT_PASSWORD, "client");
    if (clientLogin.status() === 401) {
      // First run: the client-world twin does not exist yet — sign it up.
      const signup = await request.post(`${API}/auth/register`, {
        data: { email: ADMIN_EMAIL, name: "Scope Separation Client", password: ADMIN_AS_CLIENT_PASSWORD }
      });
      expect(signup.ok(), `signup with admin-owned email: ${signup.status()} ${await signup.text()}`).toBeTruthy();
      clientLogin = await login(request, ADMIN_EMAIL, ADMIN_AS_CLIENT_PASSWORD, "client");
    }
    expect(clientLogin.ok(), `client twin login: ${clientLogin.status()}`).toBeTruthy();
    const body = (await clientLogin.json()) as LoginUser;
    expect(body.user?.roles ?? []).toContain("client");
    expect(body.user?.roles ?? []).not.toContain("admin");

    // The twin's password opens only the client world.
    expect((await login(request, ADMIN_EMAIL, ADMIN_AS_CLIENT_PASSWORD, "admin")).status()).toBe(401);
  });
});
