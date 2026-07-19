/**
 * Production verification for master-plan Phase 6 (catalog & commerce).
 *
 * Part A — dezhost.com with the AGENT credential (see docs/agent-role.md). Addons are catalog
 * data (agent-writable by design), so 6.1 admin CRUD verifies with REAL writes: a throwaway
 * addon is created UNASSIGNED (customers never see it) and soft-deleted again. 6.2 checks the
 * product form's own module select; 6.4 checks the payment-module cards and the public gateway
 * list shape. Nothing here mutates customer data or live checkout behavior.
 *
 * Part B — teculiar.com with a FULL-ADMIN credential (E2E_TECULIAR_ADMIN_*): assigns an addon to
 * a product, confirms the storefront checkout offers it, exercises the 6.4 registry kill switch
 * (module off → method gone from /storefront/payment-gateways → restored), and creates a real
 * admin order with an addon for the E2E client (skipEmail, no modules) proving the write path +
 * ADDON invoice line, then cancels the order. Skipped when the env vars are missing.
 *
 * Run (Part A):
 *   set -a && source .env && set +a
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   npx playwright test tests/e2e/specs/phase6-commerce-verify.spec.ts --project=chromium --workers=1
 * Part B runs in the same invocation once E2E_TECULIAR_ADMIN_EMAIL/PASSWORD are set in .env.
 *
 * The 6.3 PayPal sandbox purchase is a separate operator-run spec:
 * tests/e2e/specs/phase6-paypal-sandbox.spec.ts (see docs/paypal-sandbox-testing.md).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? `${BASE}/api/v1`).replace(/\/$/, "");
const AGENT_EMAIL = process.env.E2E_AGENT_EMAIL ?? "";
const AGENT_PASSWORD = process.env.E2E_AGENT_PASSWORD ?? "";

const TECULIAR = (process.env.E2E_TECULIAR_URL ?? "https://teculiar.com").replace(/\/$/, "");
const TEC_API = `${TECULIAR}/api/v1`;
const TEC_ADMIN_EMAIL = process.env.E2E_TECULIAR_ADMIN_EMAIL ?? "";
const TEC_ADMIN_PASSWORD = process.env.E2E_TECULIAR_ADMIN_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";

async function loginAdminPortal(page: Page, email = AGENT_EMAIL, password = AGENT_PASSWORD, base = BASE) {
  await page.goto(`${base}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
}

async function apiToken(request: APIRequestContext, api: string, email: string, password: string) {
  const response = await request.post(`${api}/auth/login`, { data: { email, password, scope: "admin" } });
  expect(response.ok(), `admin API login at ${api}`).toBeTruthy();
  return (await response.json()).accessToken as string;
}

test.describe("Phase 6 — Part A: dezhost (agent credential)", () => {
  test.skip(!AGENT_EMAIL || !AGENT_PASSWORD, "E2E_AGENT_* env vars required");

  test("6.1 addon CRUD round-trip on the admin Add-ons page (real write, unassigned)", async ({ page }) => {
    const marker = `E2E Phase6 ${Date.now()}`;
    const slug = `e2e-phase6-${Date.now()}`;
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/products/addons`, { waitUntil: "domcontentloaded" });

    // Form: name is the TranslateField's inline input (no name attribute), the rest are named.
    await page.locator("form input:not([name])").first().fill(marker);
    await page.fill('input[name="slug"]', slug);
    await page.fill('input[name="amountEur"]', "1,23");
    await page.getByRole("button", { name: /Zusatzleistung speichern|Save Add-on/ }).click();
    await expect(page.locator("tbody tr", { hasText: marker })).toHaveCount(1, { timeout: 15000 });

    // Soft delete → the row flips to inactive (kept for billing history), no product ever saw it.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("tbody tr", { hasText: marker }).getByRole("button", { name: /Entfernen|Remove/ }).click();
    await expect(page.locator("tbody tr", { hasText: marker }).locator("td").nth(5)).toHaveText(/Nein|No/, { timeout: 15000 });
  });

  test("6.2 product form exposes the product-first module select", async ({ page }) => {
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/products`, { waitUntil: "domcontentloaded" });
    const moduleSelect = page.locator('select[name="provisioningModule"]');
    await expect(moduleSelect).toBeVisible();
    const values = await moduleSelect.locator("option").evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    expect(values.sort()).toEqual(["hetzner", "none", "resellbiz", "virtualmin"]);
  });

  test("6.4 payment modules appear on the Modules page with the gateway pointer", async ({ page }) => {
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/products/modules`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("PayPal Payments")).toBeVisible();
    await expect(page.getByText("Mollie Payments")).toBeVisible();
    await page.getByText("PayPal Payments").locator("xpath=ancestor::div[contains(@class,'moduleCard')]").getByRole("button", { name: /Konfigurieren|Configure/ }).click();
    await expect(page.getByRole("button", { name: /Zahlungs-Gateways öffnen|Open Payment Gateways/ })).toBeVisible();
  });

  test("6.4 public gateway list keeps its shape and the products API exposes addon links", async ({ request }) => {
    const gateways = await (await request.get(`${API}/storefront/payment-gateways`)).json();
    expect(Array.isArray(gateways)).toBeTruthy();
    expect(gateways.length).toBeGreaterThan(0);
    for (const gateway of gateways) expect(typeof gateway.method).toBe("string");

    const products = await (await request.get(`${API}/products`)).json();
    expect(Array.isArray(products)).toBeTruthy();
    for (const product of products) expect(Array.isArray(product.addOns ?? [])).toBeTruthy();
  });
});

test.describe("Phase 6 — Part B: teculiar.com (full admin, write-success paths)", () => {
  test.skip(!TEC_ADMIN_EMAIL || !TEC_ADMIN_PASSWORD, "E2E_TECULIAR_ADMIN_* env vars required (owner admin for teculiar.com)");

  test("6.1 addon assigned to a product surfaces in storefront checkout, then cleans up", async ({ page, request }) => {
    const token = await apiToken(request, TEC_API, TEC_ADMIN_EMAIL, TEC_ADMIN_PASSWORD);
    const auth = { Authorization: `Bearer ${token}` };
    const products = await (await request.get(`${TEC_API}/products`)).json();
    const product = products.find((candidate: { type: string; prices: unknown[] }) => candidate.type !== "DOMAIN" && (candidate.prices as unknown[]).length > 0);
    test.skip(!product, "no orderable non-domain product on teculiar.com");

    const marker = `E2E Addon ${Date.now()}`;
    const created = await (await request.post(`${TEC_API}/admin/dev/addons`, {
      data: { amountCents: 123, name: marker, productIds: [product.id], recurring: true, slug: `e2e-addon-${Date.now()}` },
      headers: auth
    })).json();
    expect(created.id).toBeTruthy();

    try {
      await page.goto(`${TECULIAR}/de/order/${product.id}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Zusatzleistungen|Add-ons/).first()).toBeVisible({ timeout: 15000 });
      const checkbox = page.locator("label", { hasText: marker }).locator('input[type="checkbox"]');
      await checkbox.check();
      // choosing the addon adds its summary line with a remove control
      await expect(page.locator("div", { hasText: marker }).locator("visible=true").first()).toBeVisible();
    } finally {
      const removed = await request.delete(`${TEC_API}/admin/dev/addons/${created.id}`, { headers: auth });
      expect(removed.ok()).toBeTruthy();
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("label", { hasText: marker })).toHaveCount(0);
  });

  test("6.4 registry kill switch: disabling the PayPal module hides it from checkout, restore brings it back", async ({ request }) => {
    const token = await apiToken(request, TEC_API, TEC_ADMIN_EMAIL, TEC_ADMIN_PASSWORD);
    const auth = { Authorization: `Bearer ${token}` };
    const methodsOf = async () => ((await (await request.get(`${TEC_API}/storefront/payment-gateways`)).json()) as Array<{ method: string }>).map((gateway) => gateway.method);

    const before = await methodsOf();
    try {
      await request.patch(`${TEC_API}/admin/dev/modules/paypal`, { data: { active: false }, headers: auth });
      const disabled = await methodsOf();
      expect(disabled).not.toContain("PAYPAL");
    } finally {
      await request.patch(`${TEC_API}/admin/dev/modules/paypal`, { data: { active: true }, headers: auth });
    }
    expect(await methodsOf()).toEqual(before);
  });

  test("6.1 admin order with an addon bills an ADDON line (write success), then cancels", async ({ request }) => {
    const token = await apiToken(request, TEC_API, TEC_ADMIN_EMAIL, TEC_ADMIN_PASSWORD);
    const auth = { Authorization: `Bearer ${token}` };
    const clients = await (await request.get(`${TEC_API}/users`, { headers: auth })).json();
    const client = Array.isArray(clients) ? clients.find((candidate: { email?: string }) => candidate.email === CLIENT_EMAIL) : undefined;
    test.skip(!client, "E2E client account not present on teculiar.com — skipping the customer-linked write");

    const products = await (await request.get(`${TEC_API}/products`)).json();
    const product = products.find((candidate: { addOns?: unknown[]; prices: unknown[]; type: string }) => candidate.type !== "DOMAIN" && (candidate.prices as unknown[]).length > 0);
    test.skip(!product, "no orderable product");

    const addon = await (await request.post(`${TEC_API}/admin/dev/addons`, {
      data: { amountCents: 100, name: `E2E Order Addon ${Date.now()}`, productIds: [product.id], recurring: true, slug: `e2e-order-addon-${Date.now()}` },
      headers: auth
    })).json();

    try {
      const orderResponse = await request.post(`${TEC_API}/orders/admin`, {
        data: {
          items: [{ addOnIds: [addon.id], productId: product.id, productPriceId: product.prices[0].id, quantity: 1 }],
          skipEmail: true,
          userId: client.id
        },
        headers: auth
      });
      expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
      const { invoice, order } = await orderResponse.json();
      const detailed = await (await request.get(`${TEC_API}/orders/${order.id}`, { headers: auth })).json();
      const lines = (detailed.invoice?.items ?? []) as Array<{ type: string; unitAmountCents: number }>;
      expect(lines.some((line) => line.type === "ADDON" && line.unitAmountCents === 100), JSON.stringify(lines)).toBeTruthy();
      expect(invoice.totalCents).toBeGreaterThan(0);

      const cancel = await request.patch(`${TEC_API}/orders/${order.id}/status`, { data: { status: "canceled" }, headers: auth });
      expect(cancel.ok()).toBeTruthy();
    } finally {
      await request.delete(`${TEC_API}/admin/dev/addons/${addon.id}`, { headers: auth });
    }
  });
});
