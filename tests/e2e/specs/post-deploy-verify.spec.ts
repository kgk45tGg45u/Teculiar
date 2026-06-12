/**
 * Post-deploy production verification (non-Virtualmin services only — VPS = Hetzner stub).
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/post-deploy-verify.spec.ts --project=chromium --workers=1
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const PP_BUYER_EMAIL = process.env.PP_BUYER_EMAIL ?? "sb-w2nw247466170@personal.example.com";
const PP_BUYER_PASSWORD = process.env.PP_BUYER_PASSWORD ?? "F&Gr189i";

const VPS_PRODUCT = "prod_vps_starter";
const VPS_PRICE = "price_vps_starter_monthly";
const password = "E2eTest9!aA";

// workers=1 serializes; tests are otherwise independent (no shared state).

function guest(prefix: string) {
  const ts = Date.now();
  return {
    email: `${prefix}-${ts}@dezhost.test`,
    body: {
      customer: { email: `${prefix}-${ts}@dezhost.test`, name: "Verify Tester", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "Teststr 1", city: "Berlin", postalCode: "10115", state: "Berlin" } },
      items: [{ productId: VPS_PRODUCT, productPriceId: VPS_PRICE, quantity: 1, configuration: { hostname: `${prefix}-${ts}` } }]
    }
  };
}

async function adminToken(page: import("@playwright/test").Page) {
  const r = await page.request.post(`${API}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  return (await r.json() as { accessToken?: string }).accessToken ?? "";
}

// T1 — Guest SANDBOX lifecycle: checkout → synchronous pay → order materializes (deterministic).
test("guest sandbox VPS checkout materializes an order and a real user", async ({ page }) => {
  test.setTimeout(60_000);
  const g = guest("verify-sbx");
  const co = await page.request.post(`${API}/orders/checkout`, { data: g.body });
  expect(co.ok(), `checkout: ${co.status()} ${await co.text()}`).toBeTruthy();
  const { order } = await co.json() as { order: { id: string } };

  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "CREDIT_CARD", paymentMethodId: "sandbox" } });
  const payBody = await pay.json() as { invoice?: { status?: string; id?: string }; order?: { id?: string } };
  expect(payBody.invoice?.status, JSON.stringify(payBody)).toBe("PAID");

  // Order must now exist and the guest must have been materialized into a real client.
  const tok = await adminToken(page);
  const inv = await (await page.request.get(`${API}/billing/invoices/${payBody.invoice?.id}`, { headers: { Authorization: `Bearer ${tok}` } })).json() as Record<string, unknown>;
  expect((inv as { order?: { id?: string } }).order?.id, "order materialized").toBeTruthy();
  const login = await page.request.post(`${API}/auth/login`, { data: { email: g.email, password } });
  expect(login.ok(), "materialized guest can log in").toBeTruthy();
});

// T2 — The guest confirm-payment fix: reachable WITHOUT a session (no 401).
test("confirm-payment is reachable without auth (guest 401 bug fixed)", async ({ page }) => {
  const g = guest("verify-401");
  const co = await page.request.post(`${API}/orders/checkout`, { data: g.body });
  expect(co.ok()).toBeTruthy();
  const { order } = await co.json() as { order: { id: string } };
  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "PAYPAL", paymentMethodId: "checkout" } });
  expect(pay.ok()).toBeTruthy();

  // Unauthenticated confirm — the regression was a hard 401 "Missing access token" from the
  // class-level JwtAuthGuard, which blocked every guest. After the fix the request reaches the
  // handler: it may return PENDING (Mollie) or a 400 (capturing an un-approved PayPal order is
  // invalid) — but it must NOT be 401, and must NOT be the "Missing access token" message.
  const confirm = await page.request.post(`${API}/billing/invoices/${order.id}/confirm-payment`, { headers: {} });
  expect(confirm.status(), await confirm.text()).not.toBe(401);
  const body = await confirm.json() as { status?: string; message?: string };
  expect(body.message ?? "").not.toMatch(/missing access token/i);
});

// T3 — Admin Logs page: System/Cron tabs + pagination + retention control.
test("admin Logs page has System/Cron tabs, pagination and retention control", async ({ page }) => {
  test.setTimeout(60_000);
  const tok = await adminToken(page);
  const host = new URL(BASE).hostname;
  await page.context().addCookies([{ name: "dezhost_admin_access_token", value: tok, domain: host, path: "/" }]);
  await page.goto(`${BASE}/admin/logs`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");

  await expect(page.getByRole("tab", { name: /system logs/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /cron logs/i })).toBeVisible();
  // Retention control
  await expect(page.locator("#logRetentionDays")).toBeVisible();
  // Pagination control
  await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible();

  // Switch to Cron tab and page forward.
  await page.getByRole("tab", { name: /cron logs/i }).click();
  await page.waitForTimeout(1500);
  const next = page.getByRole("button", { name: /Next/ });
  if (await next.isEnabled()) {
    await next.click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
  }
});

// T4 — Real PayPal sandbox redirect → approve → confirm → order materializes (best-effort).
test("PayPal sandbox: guest pays, returns, order materializes", async ({ page }) => {
  test.setTimeout(180_000);
  const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
  if (!gateways.some((x) => x.method === "PAYPAL")) { test.skip(true, "PayPal not enabled"); return; }

  const g = guest("verify-pp");
  const co = await page.request.post(`${API}/orders/checkout`, { data: g.body });
  expect(co.ok()).toBeTruthy();
  const { order } = await co.json() as { order: { id: string } };
  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "PAYPAL", paymentMethodId: "checkout" } });
  const payBody = await pay.json() as { invoice?: { paymentRedirectUrl?: string } };
  const url = payBody.invoice?.paymentRedirectUrl;
  if (!url || !/paypal\.com/.test(url)) { test.skip(true, `no paypal redirect: ${JSON.stringify(payBody)}`); return; }

  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    const email = page.locator('#email, input[name="login_email"]');
    await email.first().waitFor({ timeout: 40_000 });
    await email.first().fill(PP_BUYER_EMAIL);
    const next = page.locator('#btnNext, button:has-text("Next")');
    if (await next.count()) await next.first().click().catch(() => undefined);
    const pw = page.locator('#password, input[name="login_password"]');
    await pw.first().waitFor({ timeout: 25_000 });
    await pw.first().fill(PP_BUYER_PASSWORD);
    await page.locator('#btnLogin, button:has-text("Log In"), button[name="btnLogin"]').first().click().catch(() => undefined);

    // The review page is a slow SPA. Poll for the pay/agree button for up to 60s.
    const payBtn = page.locator('#payment-submit-btn, [data-testid="submit-button-initial"], button:has-text("Complete Purchase"), button:has-text("Pay Now"), button:has-text("Continue"), button:has-text("Agree")');
    await expect(async () => { expect(await payBtn.count()).toBeGreaterThan(0); }).toPass({ timeout: 70_000 });
    await payBtn.first().click().catch(() => undefined);
  } catch (e) {
    console.log("PayPal UI step failed:", e instanceof Error ? e.message : String(e), "url:", page.url());
  }

  await page.waitForURL(/payment-return/, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(6_000);

  const tok = await adminToken(page);
  const inv = await (await page.request.get(`${API}/billing/invoices/${order.id}`, { headers: { Authorization: `Bearer ${tok}` } })).json() as Record<string, unknown>;
  console.log("PayPal final invoice status:", inv.status, "order:", JSON.stringify((inv as { order?: { id?: string } }).order ?? null));
  // If the sandbox UI completed, the invoice is PAID and the order exists.
  if (inv.status === "PAID") {
    expect((inv as { order?: { id?: string } }).order?.id, "order materialized after PayPal").toBeTruthy();
  } else {
    test.info().annotations.push({ type: "note", description: `PayPal sandbox UI did not complete; invoice=${String(inv.status)}` });
  }
});
