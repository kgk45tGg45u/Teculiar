/**
 * Production verification for master-plan Phase 2 (per-surface subdomain white-label).
 *
 * PREREQUISITES (see the Phase 2 deploy runbook / docs/teculiar-master-plan.md → Verify (Phase 2)):
 *   - app deployed (middleware surface mapping) AND the new Caddyfile installed on eu01
 *   - hosts registered: register-domain.js admin.dezhost.com  dezhost admin  active
 *                       register-domain.js portal.dezhost.com dezhost client active
 *     ("portal" = dezhost's chosen client label; any non-api/non-admin label works. Only ONE
 *     client-surface row may be ACTIVE — clientBaseUrl picks the first.)
 *   - DNS: admin.dezhost.com + portal.dezhost.com → CNAME edge.teculiar.net (or A 195.201.252.12).
 *     Let's Encrypt needs public DNS; if your local resolver hasn't caught up yet, set
 *     E2E_EDGE_IP=195.201.252.12 to pin the hosts in Chromium.
 *
 * Run:
 *   set -a && source .env && set +a
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/phase2-whitelabel-verify.spec.ts --project=chromium --workers=1
 *
 * 2.1/2.2 clean URLs: admin.dezhost.com serves the admin panel at the host root (no /admin segment),
 *         client.dezhost.com the client portal (no /client); legacy prefixed URLs still work;
 *         apex-path URLs on www.dezhost.com are unchanged; a spoofed X-Teculiar-Surface is stripped.
 * 2.3     /storefront/settings exposes clientBaseUrl = the dedicated client origin.
 * 2.4     a client logged in on the storefront crosses to client.dezhost.com via /sso/handoff.
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_HOST = (process.env.E2E_ADMIN_HOST_URL ?? "https://admin.dezhost.com").replace(/\/$/, "");
const CLIENT_HOST = (process.env.E2E_CLIENT_HOST_URL ?? "https://portal.dezhost.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";
const EDGE_IP = process.env.E2E_EDGE_IP ?? "";

// Optional: pin the surface hosts to the floating IP while local DNS caches catch up. The cert is
// still the real Let's Encrypt one (issuance needs public DNS), so no ignoreHTTPSErrors.
if (EDGE_IP) {
  const hosts = [new URL(ADMIN_HOST).hostname, new URL(CLIENT_HOST).hostname];
  test.use({
    launchOptions: { args: [`--host-resolver-rules=${hosts.map((h) => `MAP ${h} ${EDGE_IP}`).join(", ")}`] }
  });
}

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

// 2.3 — the settings payload advertises the dedicated client origin (drives the account menu).
test("storefront settings expose clientBaseUrl + storefrontBaseUrl", async ({ request }) => {
  const r = await request.get(`${API}/storefront/settings`);
  expect(r.ok(), `settings: ${r.status()}`).toBeTruthy();
  const settings = (await r.json()) as { clientBaseUrl?: string; storefrontBaseUrl?: string };
  expect((settings.clientBaseUrl ?? "").replace(/\/$/, "")).toBe(CLIENT_HOST);
  expect(settings.storefrontBaseUrl).toMatch(/^https:\/\/(www\.)?dezhost\.com$/);
});

// 2.2 — apex-path URLs keep working exactly as before the phase.
test("apex-path model unchanged on www.dezhost.com", async ({ page }) => {
  await page.goto(`${BASE}/admin`);
  await expect(page).toHaveURL(new RegExp(`${BASE}/admin/login`));
  const storefront = await page.goto(`${BASE}/de`);
  expect(storefront?.status()).toBe(200);
});

// 2.1 — a spoofed surface header must not flip an apex request into clean-URL mode.
test("spoofed X-Teculiar-Surface is stripped at the edge", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "X-Teculiar-Surface": "client" });
  await page.goto(`${BASE}/admin`);
  await expect(page).toHaveURL(new RegExp(`${BASE}/admin/login`)); // NOT the surface /login shape
});

// 2.1/2.2 — admin surface host: login + navigation never show the /admin segment.
test("admin.dezhost.com serves the admin panel at the host root", async ({ page }) => {
  await page.goto(`${ADMIN_HOST}/`);
  await expect(page).toHaveURL(`${ADMIN_HOST}/login?next=%2F`);
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForURL(`${ADMIN_HOST}/`);
  await expect(page.locator("main h1").first()).toBeVisible();
  // Sidebar links are surface-relative: clicking "clients" stays clean.
  await page.click('a[href="/clients"]');
  await page.waitForURL(`${ADMIN_HOST}/clients`);
  expect(new URL(page.url()).pathname).not.toContain("/admin");
  // Admin-scope fetches must keep working without the /admin pathname (surface cookie → admin
  // token): the Settings page's own data call has to succeed, not silently render empty fields.
  const settingsResponse = page.waitForResponse(
    (r) => r.url().includes("/admin/dev/billing/settings") && r.request().method() === "GET"
  );
  await page.goto(`${ADMIN_HOST}/settings`);
  expect((await settingsResponse).status(), "settings fetch must be authorized on the clean-URL host").toBe(200);
});

// 2.2 — legacy prefixed URLs on a surface host still route (passthrough), no doubled segment.
test("legacy /admin path on the admin host still works", async ({ page }) => {
  await page.goto(`${ADMIN_HOST}/admin`);
  // Unauthenticated: the guard sends the browser to the clean login with the legacy next target.
  await expect(page).toHaveURL(`${ADMIN_HOST}/login?next=%2Fadmin`);
});

// 2.1/2.2 — client surface host: portal at the root, nav stays clean.
test("client.dezhost.com serves the client portal at the host root", async ({ page }) => {
  await page.goto(`${CLIENT_HOST}/`);
  await expect(page).toHaveURL(`${CLIENT_HOST}/login?next=%2F`);
  await login(page, CLIENT_EMAIL, CLIENT_PASSWORD);
  await page.waitForURL(`${CLIENT_HOST}/`);
  await page.click('a[href="/invoices"]');
  await page.waitForURL(`${CLIENT_HOST}/invoices`);
  expect(new URL(page.url()).pathname).not.toContain("/client");
});

// 2.4 — a client session on the storefront origin crosses to the client origin via /sso/handoff.
test("storefront account menu hands the session off to client.dezhost.com", async ({ page, request }) => {
  const r = await request.post(`${API}/auth/login`, {
    data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, scope: "client" }
  });
  expect(r.ok(), `client login: ${r.status()}`).toBeTruthy();
  const { accessToken } = (await r.json()) as { accessToken: string };

  // Seed the token ONLY on the storefront origin — the client origin must earn its own session
  // through the handoff, otherwise the test would pass vacuously.
  const storefrontOrigin = new URL(BASE).origin;
  await page.addInitScript(
    ([origin, token]) => {
      if (window.location.origin === origin) {
        window.localStorage.setItem("teculiar_client_access_token", token!);
      }
    },
    [storefrontOrigin, accessToken]
  );

  await page.goto(`${BASE}/de`);
  // The header has several <details> (nav dropdowns, mobile menu) — open specifically the account
  // menu, i.e. the one that contains the handoff link (rendered once /users/me confirms the token).
  const dashboardLink = page.locator('a[href^="/sso/handoff"]');
  await page.locator('details:has(a[href^="/sso/handoff"]) > summary').click();
  await expect(dashboardLink).toBeVisible();
  await dashboardLink.click();
  // handoff → exchange → client.dezhost.com/sso/callback → redeem → "/"
  await page.waitForURL(`${CLIENT_HOST}/`, { timeout: 20_000 });
  await expect(page.locator('a[href="/invoices"]')).toBeVisible(); // authenticated portal nav
});
