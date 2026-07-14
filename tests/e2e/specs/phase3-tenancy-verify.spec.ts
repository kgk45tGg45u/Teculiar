/**
 * Production verification for master-plan Phase 3 (multi-tenant hardening).
 *
 * Scope: the parts safely checkable on a live, single-active tenant without touching tenant
 * status (flipping the real dezhost tenant to "suspended" would lock out real admin/client and
 * needs a manual DB step — see docs/teculiar-master-plan.md Phase 3 status note).
 *
 * 3.5 the on-view `?refresh=1` service probe is gone — GET /services and GET /services/:id
 *     read stored DB state only and both still return successfully.
 * 3.2 the public /cron endpoint returns the compact {ok, tenants, ran, failed, skipped,
 *     perTenant} summary (single-tenant fallback here, since the control-plane test box has one
 *     active tenant) instead of the old flat {ran: [...], skipped: [...]}.
 * 3.1/3.4 admin + client dashboards still render cleanly post-deploy (not falsely flagged
 *     TENANT_SUSPENDED by the new guard payload shape).
 *
 * Auth: logs in via the API directly and injects the returned token as a cookie (never reads
 * localStorage right after a UI form submit) — this codebase's white-label surface hosts (Phase 2)
 * can land a UI login on a different origin than it started on, which makes an immediate
 * `page.evaluate(() => localStorage.getItem(...))` read unreliable. See payment-gateways.spec.ts
 * loginAsClient/loginAsAdmin for the same pattern.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/phase3-tenancy-verify.spec.ts --project=chromium --workers=1
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

/** API login → returns the access token directly (no browser/localStorage involved). */
async function apiLogin(page: Page, email: string, password: string, scope: "admin" | "client") {
  const r = await page.request.post(`${API}/auth/login`, { data: { email, password, scope } });
  expect(r.ok(), `${scope} login: ${r.status()} ${await r.text()}`).toBeTruthy();
  const body = (await r.json()) as { accessToken?: string; refreshToken?: string };
  expect(body.accessToken, `${scope} login returned no accessToken`).toBeTruthy();
  return body as { accessToken: string; refreshToken?: string };
}

/** Same token, ALSO dropped into a cookie so a subsequent page.goto() renders as logged-in. */
async function loginAndSeedCookies(page: Page, email: string, password: string, scope: "admin" | "client") {
  const { accessToken, refreshToken } = await apiLogin(page, email, password, scope);
  const hostname = new URL(BASE).hostname;
  await page.context().addCookies([
    { name: `teculiar_${scope}_access_token`, value: accessToken, domain: hostname, path: "/" },
    { name: `teculiar_${scope}_refresh_token`, value: refreshToken ?? "", domain: hostname, path: "/" }
  ]);
  return accessToken;
}

// ── 3.5: on-view refresh removed, stored-state reads still work ──────────────────────────────

test("GET /services (no refresh param) succeeds for a logged-in client", async ({ page }) => {
  const token = await apiLogin(page, CLIENT_EMAIL, CLIENT_PASSWORD, "client").then((b) => b.accessToken);
  const r = await page.request.get(`${API}/services`, { headers: { Authorization: `Bearer ${token}` } });
  expect(r.ok(), `GET /services: ${r.status()} ${await r.text()}`).toBeTruthy();
  const body = await r.json();
  expect(Array.isArray(body), "GET /services returns an array").toBe(true);
});

test("GET /services/:id (no refresh param) succeeds when the client has a service", async ({ page }) => {
  const token = await apiLogin(page, CLIENT_EMAIL, CLIENT_PASSWORD, "client").then((b) => b.accessToken);
  const list = await page.request.get(`${API}/services`, { headers: { Authorization: `Bearer ${token}` } });
  expect(list.ok()).toBeTruthy();
  const services = (await list.json()) as Array<{ id: string }>;
  test.skip(services.length === 0, "no services on this account to fetch a detail for");
  const r = await page.request.get(`${API}/services/${services[0]!.id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(r.ok(), `GET /services/:id: ${r.status()} ${await r.text()}`).toBeTruthy();
});

test("client portal service pages render without a refresh query in requests", async ({ page }) => {
  await loginAndSeedCookies(page, CLIENT_EMAIL, CLIENT_PASSWORD, "client");
  const requestedUrls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/services")) requestedUrls.push(req.url());
  });
  await page.goto(`${BASE}/client/services`);
  await page.waitForLoadState("networkidle");
  expect(requestedUrls.some((u) => u.includes("refresh=1") || u.includes("refresh=true"))).toBe(false);
});

// ── 3.2: compact cron summary on the public endpoint ──────────────────────────────────────────

test("public /cron returns the Phase 3.2 compact summary shape", async ({ request }) => {
  const secret = process.env.E2E_CRON_SECRET ?? process.env.CRON_SECRET;
  test.skip(!secret, "E2E_CRON_SECRET/CRON_SECRET not set in this environment — cannot authorize");
  const r = await request.get(`${API}/cron`, { headers: { "x-cron-secret": secret! } });
  expect(r.ok(), `GET /cron: ${r.status()} ${await r.text()}`).toBeTruthy();
  const body = (await r.json()) as { ok: boolean; tenants: number; ran: number; failed: number; skipped: number; perTenant: unknown[] };
  expect(typeof body.ok).toBe("boolean");
  expect(typeof body.tenants).toBe("number");
  expect(typeof body.ran).toBe("number");
  expect(typeof body.failed).toBe("number");
  expect(typeof body.skipped).toBe("number");
  expect(Array.isArray(body.perTenant)).toBe(true);
  // typeof body.ran === "number" above already proves the old flat {ran: [...]} shape is gone.
});

// ── 3.1/3.4: dashboards render clean post-deploy (not falsely suspended) ─────────────────────

test("admin dashboard loads without the suspension notice", async ({ page }) => {
  await loginAndSeedCookies(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText(/suspended|gesperrt/i);
});

test("client portal loads without the suspension notice", async ({ page }) => {
  await loginAndSeedCookies(page, CLIENT_EMAIL, CLIENT_PASSWORD, "client");
  await page.goto(`${BASE}/client`);
  await page.waitForURL(/\/client/, { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText(/suspended|gesperrt/i);
});
