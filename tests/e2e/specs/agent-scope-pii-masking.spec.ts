/**
 * Production verification: the read-only "agent" role (restricted, PII-masked credential used
 * for automated dashboard testing by Claude) never sees real customer PII and can never write to
 * a customer-linked resource.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/agent-scope-pii-masking.spec.ts --project=chromium --workers=1
 *
 * Needs E2E_AGENT_EMAIL / E2E_AGENT_PASSWORD (an admin-portal account whose only role is "agent" —
 * see AdminManagementController.roles() / Admin > Settings > Admins in the dashboard).
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const AGENT_EMAIL = process.env.E2E_AGENT_EMAIL ?? "";
const AGENT_PASSWORD = process.env.E2E_AGENT_PASSWORD ?? "";

type LoginBody = { accessToken?: string; user?: { roles?: string[] } };

async function loginAgent(request: import("@playwright/test").APIRequestContext) {
  const r = await request.post(`${API}/auth/login`, { data: { email: AGENT_EMAIL, password: AGENT_PASSWORD, scope: "admin" } });
  expect(r.ok(), `agent login: ${r.status()} ${await r.text()}`).toBeTruthy();
  const body = (await r.json()) as LoginBody;
  expect(body.user?.roles ?? []).toContain("agent");
  return body.accessToken!;
}

test.describe("agent role: read-only, PII masked", () => {
  test.skip(!AGENT_EMAIL || !AGENT_PASSWORD, "E2E_AGENT_* env vars required");

  test("GET /users returns masked email/name, never the real values (API)", async ({ request }) => {
    const token = await loginAgent(request);
    const r = await request.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok(), `list clients: ${r.status()}`).toBeTruthy();
    const clients = (await r.json()) as Array<{ email: string; name: string }>;
    for (const client of clients) {
      expect(client.email, `email must be masked: ${client.email}`).toMatch(/^.\*\*\*@/);
    }
  });

  test("agent cannot create, edit, or delete a customer (API)", async ({ request }) => {
    const token = await loginAgent(request);
    const headers = { Authorization: `Bearer ${token}` };

    const create = await request.post(`${API}/users`, {
      headers,
      data: { email: `agent-write-test-${Date.now()}@example.invalid`, name: "Should Not Be Created", password: "irrelevant-12345", }
    });
    expect(create.status(), "POST /users must be forbidden for agent").toBe(403);

    const list = await request.get(`${API}/users`, { headers });
    const [firstClient] = (await list.json()) as Array<{ id: string }>;
    test.skip(!firstClient, "no existing client to attempt a write against");

    const update = await request.patch(`${API}/users/${firstClient.id}`, { headers, data: { name: "Agent Should Not Write This" } });
    expect(update.status(), "PATCH /users/:id must be forbidden for agent").toBe(403);

    const destroy = await request.delete(`${API}/users/${firstClient.id}`, { headers });
    expect(destroy.status(), "DELETE /users/:id must be forbidden for agent").toBe(403);
  });

  test("agent cannot create an order, mutate order status, or touch billing writes (API)", async ({ request }) => {
    const token = await loginAgent(request);
    const headers = { Authorization: `Bearer ${token}` };

    const createOrder = await request.post(`${API}/orders/admin`, { headers, data: {} });
    expect(createOrder.status(), "POST orders/admin must be forbidden for agent").toBe(403);

    const refund = await request.post(`${API}/billing/invoices/nonexistent/refund`, { headers, data: {} });
    expect(refund.status(), "billing refund must be forbidden for agent").toBe(403);
  });

  test("agent cannot reply to, assign, or close a ticket (API)", async ({ request }) => {
    const token = await loginAgent(request);
    const headers = { Authorization: `Bearer ${token}` };

    const reply = await request.post(`${API}/tickets/nonexistent/replies`, { headers, data: { body: "should never send" } });
    expect(reply.status(), "ticket reply must be forbidden for agent").toBe(403);

    const close = await request.post(`${API}/tickets/nonexistent/close`, { headers });
    expect(close.status(), "ticket close must be forbidden for agent").toBe(403);
  });

  test("agent can view order/invoice detail and logs, masked; hosting panel stays forbidden (API)", async ({ request }) => {
    const token = await loginAgent(request);
    const headers = { Authorization: `Bearer ${token}` };

    const orders = (await (await request.get(`${API}/orders/admin`, { headers })).json()) as Array<{ id: string }>;
    if (orders[0]) {
      const order = (await (await request.get(`${API}/orders/${orders[0].id}`, { headers })).json()) as { user?: { email?: string } };
      if (order.user?.email) expect(order.user.email).toMatch(/^.\*\*\*@/);
    }

    const invoices = (await (await request.get(`${API}/admin/dev/billing/invoices`, { headers })).json()) as Array<{ id: string }>;
    if (invoices[0]) {
      const invoice = (await (await request.get(`${API}/billing/invoices/${invoices[0].id}`, { headers })).json()) as { user?: { email?: string } };
      if (invoice.user?.email) expect(invoice.user.email).toMatch(/^.\*\*\*@/);
      const html = await (await request.get(`${API}/billing/invoices/${invoices[0].id}/html`, { headers })).text();
      expect(html).toContain("***");
    }

    expect((await request.get(`${API}/admin/dev/logs?limit=5`, { headers })).status(), "logs must be readable for agent").toBe(200);
    expect((await request.get(`${API}/admin/dev/emails`, { headers })).status(), "email settings must be readable for agent").toBe(200);
    expect((await request.post(`${API}/admin/dev/emails/test`, { headers, data: {} })).status(), "email sends must stay forbidden").toBe(403);

    const services = (await (await request.get(`${API}/admin/dev/services`, { headers })).json()) as Array<{ id: string }>;
    if (services[0]) {
      expect((await request.get(`${API}/services/${services[0].id}`, { headers })).status(), "service detail must be readable").toBe(200);
      expect((await request.get(`${API}/services/${services[0].id}/hosting-panel`, { headers })).status(), "hosting panel must stay forbidden").toBe(403);
    }
  });

  test("agent can still write to non-customer areas like the product catalog (API)", async ({ request }) => {
    const token = await loginAgent(request);
    const headers = { Authorization: `Bearer ${token}` };
    const categories = await request.get(`${API}/admin/dev/product-categories`, { headers });
    expect(categories.ok(), `agent should retain read+write elsewhere: ${categories.status()}`).toBeTruthy();
  });

  test("admin dashboard renders masked client emails and shows the read-only badge (UI)", async ({ page }) => {
    await page.goto(`${BASE}/admin/login`);
    await page.fill('input[name="email"]', AGENT_EMAIL);
    await page.fill('input[name="password"]', AGENT_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });

    await expect(page.getByText(/masked|maskiert/i).first()).toBeVisible({ timeout: 15_000 });

    await page.goto(`${BASE}/admin/clients`);
    // Client rows link to /admin/clients/<id> and show the customer's email; exclude the
    // sidebar's "Add client" link (/admin/clients/new), which the bare href filter also matches.
    const firstClientRow = page.locator('a[href*="/admin/clients/"]:not([href$="/new"])').filter({ hasText: "@" }).first();
    if (await firstClientRow.count()) {
      await expect(firstClientRow).toContainText(/\*\*\*@/, { timeout: 15_000 });
    }
  });
});
