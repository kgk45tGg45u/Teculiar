/**
 * Production verification for the 2026-07-16 bug sweep (read-only, agent-credential safe).
 *
 * The prod `E2E_ADMIN_*` account holds the `agent` role: masked PII and 403 on writes are
 * this system working as designed (docs/agent-role.md). Everything here is therefore either
 * a read or an intentionally-blocked write:
 *  - staff-viewer detail endpoints (invoice/service/order) return 200, not "Not found"
 *  - the admin invoice/service detail PAGES render (regression: super_admin/staff 404'd)
 *  - rendered invoice HTML never prints the internal "VAT disabled" reason
 *  - DELETE /tickets/:id exists and is guarded (agent gets 403, never 404-route-missing)
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/bugfix-sweep-verify.spec.ts --project=chromium --workers=1
 *
 * Creates no data — nothing to clean up afterwards.
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function login(page: Page): Promise<string> {
  const r = await page.request.post(`${API}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, scope: "admin" } });
  expect(r.ok(), `admin-portal login: ${r.status()} ${await r.text()}`).toBeTruthy();
  const body = await r.json() as { accessToken?: string; refreshToken?: string };
  expect(body.accessToken, "login returned no accessToken").toBeTruthy();
  const hostname = new URL(BASE).hostname;
  await page.context().addCookies([
    { name: "teculiar_admin_access_token", value: body.accessToken!, domain: hostname, path: "/" },
    { name: "teculiar_admin_refresh_token", value: body.refreshToken ?? "", domain: hostname, path: "/" }
  ]);
  return body.accessToken!;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test("staff-viewer invoice detail returns the invoice (no more Not found)", async ({ page }) => {
  const token = await login(page);
  const list = await page.request.get(`${API}/admin/dev/billing/invoices`, { headers: auth(token) });
  expect(list.ok(), `invoice list: ${list.status()}`).toBeTruthy();
  const invoices = await list.json() as Array<{ id: string }>;
  test.skip(invoices.length === 0, "no invoices on this environment yet");

  const detail = await page.request.get(`${API}/billing/invoices/${invoices[0]!.id}`, { headers: auth(token) });
  expect(detail.status(), `invoice detail: ${await detail.text()}`).toBe(200);
  const invoice = await detail.json() as { id: string };
  expect(invoice.id).toBe(invoices[0]!.id);
});

test("staff-viewer service detail returns the service (no more Not found)", async ({ page }) => {
  const token = await login(page);
  const list = await page.request.get(`${API}/admin/dev/services`, { headers: auth(token) });
  expect(list.ok(), `service list: ${list.status()}`).toBeTruthy();
  const services = await list.json() as Array<{ id: string }>;
  test.skip(services.length === 0, "no services on this environment yet");

  const detail = await page.request.get(`${API}/services/${services[0]!.id}`, { headers: auth(token) });
  expect(detail.status(), `service detail: ${await detail.text()}`).toBe(200);
});

test("staff-viewer order detail returns the order (no more Not found)", async ({ page }) => {
  const token = await login(page);
  const list = await page.request.get(`${API}/orders/admin`, { headers: auth(token) });
  expect(list.ok(), `order list: ${list.status()}`).toBeTruthy();
  const orders = await list.json() as Array<{ id: string }>;
  test.skip(orders.length === 0, "no orders on this environment yet");

  const detail = await page.request.get(`${API}/orders/${orders[0]!.id}`, { headers: auth(token) });
  expect(detail.status(), `order detail: ${await detail.text()}`).toBe(200);
});

test("admin invoice page renders the sheet instead of 'Not found'", async ({ page }) => {
  const token = await login(page);
  const invoices = await (await page.request.get(`${API}/admin/dev/billing/invoices`, { headers: auth(token) })).json() as Array<{ id: string }>;
  test.skip(invoices.length === 0, "no invoices on this environment yet");

  await page.goto(`${BASE}/admin/invoices/${invoices[0]!.id}`);
  await expect(page.locator("main")).not.toContainText(/not found/i);
  await expect(page.locator("main h1").first()).toContainText(/\S/); // an invoice number heading rendered
});

test("admin service page renders details instead of 'Not found'", async ({ page }) => {
  const token = await login(page);
  const services = await (await page.request.get(`${API}/admin/dev/services`, { headers: auth(token) })).json() as Array<{ id: string }>;
  test.skip(services.length === 0, "no services on this environment yet");

  await page.goto(`${BASE}/admin/services/${services[0]!.id}`);
  await expect(page.locator("main")).not.toContainText(/not found/i);
});

test("rendered invoice HTML never prints the internal 'VAT disabled' reason", async ({ page }) => {
  const token = await login(page);
  const invoices = await (await page.request.get(`${API}/admin/dev/billing/invoices`, { headers: auth(token) })).json() as Array<{ id: string; taxAmountCents?: number }>;
  test.skip(invoices.length === 0, "no invoices on this environment yet");

  // Check up to three invoices (the zero-VAT ones are where the reason used to leak).
  for (const invoice of invoices.slice(0, 3)) {
    const html = await page.request.get(`${API}/billing/invoices/${invoice.id}/html`, { headers: auth(token) });
    expect(html.ok(), `invoice ${invoice.id} html: ${html.status()}`).toBeTruthy();
    expect(await html.text()).not.toMatch(/VAT disabled/i);
  }
});

test("DELETE /tickets/:id exists and is role-guarded (agent blocked with 403, not 404-route)", async ({ page }) => {
  const token = await login(page);
  // Guards run before the handler, so even a fabricated id proves the route is registered:
  // a missing route would 404 with Nest's "Cannot DELETE" message instead.
  const del = await page.request.delete(`${API}/tickets/nonexistent-ticket-id`, { headers: auth(token) });
  const body = await del.text();
  expect(body).not.toMatch(/cannot delete/i);
  expect(del.status(), body).toBe(403);
});
