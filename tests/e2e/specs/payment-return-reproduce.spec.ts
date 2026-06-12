/**
 * REPRODUCTION: real post-gateway confirm-payment flow (Mollie Credit Card, test mode).
 *
 * Unlike payment-gateways.spec.ts (which MOCKS confirm-payment), this test drives the
 * real Mollie test checkout page to "paid" and then exercises the real
 * POST /billing/invoices/:id/confirm-payment that the payment-return page calls.
 *
 * Goal: see exactly what the customer sees after coming back from the gateway.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/payment-return-reproduce.spec.ts --project=chromium
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");

// VPS product → Hetzner stub, provisions nothing on the live panel (avoids Virtualmin).
const VPS_PRODUCT = "prod_vps_starter";
const VPS_PRICE = "price_vps_starter_monthly";
const password = "E2eTest9!aA";

// PayPal sandbox buyer (test mode)
const PP_BUYER_EMAIL = process.env.PP_BUYER_EMAIL ?? "sb-w2nw247466170@personal.example.com";
const PP_BUYER_PASSWORD = process.env.PP_BUYER_PASSWORD ?? "F&Gr189i";

test.describe.configure({ mode: "serial" });

async function createCheckout(page: import("@playwright/test").Page, prefix: string) {
  const ts = Date.now();
  const newEmail = `${prefix}-${ts}@dezhost.test`;
  const co = await page.request.post(`${API}/orders/checkout`, {
    data: {
      customer: { email: newEmail, name: "Repro Tester", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "Teststr 1", city: "Berlin", postalCode: "10115", state: "Berlin" } },
      items: [{ productId: VPS_PRODUCT, productPriceId: VPS_PRICE, quantity: 1, configuration: { hostname: `${prefix}-${ts}` } }]
    }
  });
  expect(co.ok(), `checkout failed: ${co.status()} ${await co.text()}`).toBeTruthy();
  const { order } = await co.json() as { order: { id: string } };
  return { invoiceId: order.id, email: newEmail };
}

async function reportFinalState(page: import("@playwright/test").Page, invoiceId: string) {
  const bodyText = await page.locator("body").textContent().catch(() => "");
  console.log("PAGE TEXT:", (bodyText ?? "").replace(/\s+/g, " ").slice(0, 300));
  const admin = await page.request.post(`${API}/auth/login`, { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } });
  const adminTok = (await admin.json() as { accessToken?: string }).accessToken;
  const inv = await (await page.request.get(`${API}/billing/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${adminTok}` } })).json() as Record<string, unknown>;
  console.log("FINAL invoice status:", inv.status, "number:", inv.invoiceNumber, "order:", JSON.stringify((inv as { order?: { id?: string } }).order ?? null));
  const txs = (inv as { transactions?: Array<Record<string, unknown>> }).transactions ?? [];
  for (const t of txs) console.log("  TX", t.method, t.status, "ref=", t.providerReference);
}

test("Mollie CC: real checkout → pay on Mollie test page → confirm-payment (capture real result)", async ({ page }) => {
  test.setTimeout(120_000);

  const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
  if (!gateways.some((g) => g.method === "CREDIT_CARD")) { test.skip(true, "CREDIT_CARD not enabled"); return; }

  const { invoiceId } = await createCheckout(page, "repro-cc");
  console.log("INVOICE/checkout id:", invoiceId);

  const pay = await page.request.post(`${API}/orders/${invoiceId}/pay`, {
    data: { method: "CREDIT_CARD", paymentMethodId: "checkout" }
  });
  const payBody = await pay.json() as { invoice?: { id?: string; status?: string; paymentRedirectUrl?: string }; message?: string };
  console.log("PAY status:", pay.status(), "invoiceStatus:", payBody.invoice?.status, "redirect:", payBody.invoice?.paymentRedirectUrl);
  const redirectUrl = payBody.invoice?.paymentRedirectUrl;
  if (!redirectUrl || !/mollie\.com/.test(redirectUrl)) { test.skip(true, `No mollie redirect: ${JSON.stringify(payBody)}`); return; }

  // Drive the Mollie hosted test checkout page → select "paid".
  await page.goto(redirectUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  console.log("Mollie page url:", page.url());

  // Mollie test mode: a "Select the final payment status" form. Try several selectors.
  const paidSelectors = [
    'input[value="paid"]',
    'label:has-text("Paid")',
    'button:has-text("Paid")',
    'text=/^Paid$/'
  ];
  let clicked = false;
  for (const sel of paidSelectors) {
    const loc = page.locator(sel);
    if (await loc.count() > 0) {
      await loc.first().click().catch(() => undefined);
      clicked = true;
      console.log("clicked paid selector:", sel);
      break;
    }
  }
  // Some Mollie test pages need a submit/continue after selecting status
  const submit = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Weiter")');
  if (await submit.count() > 0) {
    await submit.first().click().catch(() => undefined);
  }
  console.log("after mollie interaction, clicked=", clicked);

  // Wait until Mollie redirects back to our payment-return page.
  await page.waitForURL(/payment-return/, { timeout: 30_000 }).catch(() => undefined);
  console.log("landed url:", page.url());

  // Capture the REAL confirm-payment response (the payment-return page fires it).
  const confirmResp = await page.waitForResponse(
    (r) => /\/confirm-payment$/.test(r.url()),
    { timeout: 20_000 }
  ).catch(() => null);

  if (confirmResp) {
    const status = confirmResp.status();
    const body = await confirmResp.text();
    console.log("CONFIRM-PAYMENT HTTP", status, "BODY:", body);
  } else {
    // The page may have already fired it before we attached; call it directly.
    const direct = await page.request.post(`${API}/billing/invoices/${invoiceId}/confirm-payment`);
    console.log("CONFIRM-PAYMENT (direct) HTTP", direct.status(), "BODY:", await direct.text());
  }

  await reportFinalState(page, invoiceId);
});

test("PayPal: real checkout → approve on PayPal sandbox → confirm-payment (capture real result)", async ({ page }) => {
  test.setTimeout(180_000);

  const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
  if (!gateways.some((g) => g.method === "PAYPAL")) { test.skip(true, "PAYPAL not enabled"); return; }

  const { invoiceId } = await createCheckout(page, "repro-pp");
  console.log("INVOICE/checkout id:", invoiceId);

  // Storefront checkout uses paymentMethodId:"checkout" → PayPal redirect mode (payer-action URL).
  const pay = await page.request.post(`${API}/orders/${invoiceId}/pay`, {
    data: { method: "PAYPAL", paymentMethodId: "checkout" }
  });
  const payBody = await pay.json() as { invoice?: { status?: string; paymentRedirectUrl?: string }; providerReference?: string; message?: string };
  console.log("PAY status:", pay.status(), "invoiceStatus:", payBody.invoice?.status, "redirect:", payBody.invoice?.paymentRedirectUrl);
  const redirectUrl = payBody.invoice?.paymentRedirectUrl;
  if (!redirectUrl || !/paypal\.com/.test(redirectUrl)) { test.skip(true, `No paypal redirect: ${JSON.stringify(payBody)}`); return; }

  await page.goto(redirectUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  console.log("PayPal page url:", page.url());

  // ---- PayPal sandbox login + approve ----
  try {
    // Email step
    const emailInput = page.locator('#email, input[name="login_email"]');
    await emailInput.first().waitFor({ timeout: 30_000 });
    await emailInput.first().fill(PP_BUYER_EMAIL);
    const nextBtn = page.locator('#btnNext, button:has-text("Next")');
    if (await nextBtn.count() > 0) await nextBtn.first().click().catch(() => undefined);

    const pwInput = page.locator('#password, input[name="login_password"]');
    await pwInput.first().waitFor({ timeout: 20_000 });
    await pwInput.first().fill(PP_BUYER_PASSWORD);
    const loginBtn = page.locator('#btnLogin, button:has-text("Log In"), button:has-text("Login")');
    await loginBtn.first().click().catch(() => undefined);

    // Review / approve step — button text varies: "Complete Purchase", "Pay Now", "Continue"
    const payNow = page.locator('#payment-submit-btn, button:has-text("Complete Purchase"), button:has-text("Pay Now"), button:has-text("Continue"), button:has-text("Agree & Pay")');
    await payNow.first().waitFor({ timeout: 40_000 });
    await payNow.first().click().catch(() => undefined);
  } catch (e) {
    console.log("PayPal interaction issue:", e instanceof Error ? e.message : String(e), "url:", page.url());
  }

  await page.waitForURL(/payment-return/, { timeout: 60_000 }).catch(() => undefined);
  console.log("landed url:", page.url());

  const confirmResp = await page.waitForResponse((r) => /\/confirm-payment$/.test(r.url()), { timeout: 25_000 }).catch(() => null);
  if (confirmResp) {
    console.log("CONFIRM-PAYMENT HTTP", confirmResp.status(), "BODY:", await confirmResp.text());
  } else {
    const direct = await page.request.post(`${API}/billing/invoices/${invoiceId}/confirm-payment`);
    console.log("CONFIRM-PAYMENT (direct) HTTP", direct.status(), "BODY:", await direct.text());
  }

  await reportFinalState(page, invoiceId);
});
