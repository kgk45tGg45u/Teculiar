/**
 * Full payment-gateway lifecycle on production (PayPal, Mollie Credit Card, Mollie SEPA) for both
 * NEW (guest) and OLD (existing/logged-in) customers: order → pay → return to dashboard with a paid
 * invoice, plus a renewal payment. Uses ONLY VPS products (Hetzner stub) so nothing touches the
 * shared Virtualmin server.
 *
 * PayPal + Mollie are both in TEST mode; the gateway UIs are driven with sandbox/test credentials.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   PP_BUYER_EMAIL=... PP_BUYER_PASSWORD=... \
 *     npx playwright test tests/e2e/specs/gateway-lifecycle.spec.ts --project=chromium --workers=1
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";
const PP_EMAIL = process.env.PP_BUYER_EMAIL ?? "sb-w2nw247466170@personal.example.com";
const PP_PW = process.env.PP_BUYER_PASSWORD ?? "F&Gr189i";

const VPS = { productId: "prod_vps_starter", productPriceId: "price_vps_starter_monthly" };
const password = "E2eTest9!aA";

function customer(email: string) {
  return { email, name: "Lifecycle Tester", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "Teststr 1", city: "Berlin", postalCode: "10115", state: "Berlin" } };
}
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

async function token(page: Page, email: string, pw: string, scope: "admin" | "client" = "client") {
  const r = await page.request.post(`${API}/auth/login`, { data: { email, password: pw, scope } });
  return r.ok() ? (await r.json() as { accessToken?: string }).accessToken ?? "" : "";
}
const adminToken = (page: Page) => token(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");

async function invoiceOf(page: Page, id: string) {
  const tok = await adminToken(page);
  return await (await page.request.get(`${API}/billing/invoices/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json() as Record<string, unknown>;
}

// ─── Gateway UI drivers (test/sandbox mode) ───────────────────────────────────

async function payMollieCard(page: Page, redirectUrl: string) {
  await page.goto(redirectUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const cards = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("*").forEach((e) => {
      const c = e.getAttribute("data-clipboard-text");
      if (c && /\d{12,}/.test(c.replace(/\s/g, ""))) out.push(c.replace(/\s/g, ""));
    });
    return [...new Set(out)];
  });
  const card = cards.find((c) => c.endsWith("9996")) ?? cards[0] ?? "4543474002249996";
  const fr = page.frameLocator('iframe[src*="js.mollie.com/v2/components/card"]');
  await fr.locator("#cardNumber").fill(card);
  await fr.locator("#cardExpiryDate").fill("1230");
  await fr.locator("#cardCvv").fill("123");
  await fr.locator("#cardHolder").fill("Test Holder");
  // "Pay with card" lives inside the Mollie component iframe.
  for (const f of page.frames()) {
    const b = f.locator('button:has-text("Pay with card")');
    if (await b.count().catch(() => 0)) { await b.first().click({ timeout: 6000 }).catch(() => undefined); break; }
  }
  // Mollie test-mode status selector → Paid.
  await page.waitForURL(/test-mode|payment-return/, { timeout: 30_000 }).catch(() => undefined);
  if (/test-mode/.test(page.url())) {
    await page.waitForTimeout(1200);
    await page.locator('button:has-text("Paid"), a:has-text("Paid"), label:has-text("Paid")').first().click().catch(() => undefined);
    await page.locator('button:has-text("Continue"), button[type=submit]').first().click().catch(() => undefined);
  }
}

async function payPayPal(page: Page, redirectUrl: string) {
  await page.goto(redirectUrl, { waitUntil: "domcontentloaded" });
  const email = page.locator('#email, input[name="login_email"]');
  await email.first().waitFor({ timeout: 45_000 });
  await email.first().fill(PP_EMAIL);
  const next = page.locator('#btnNext, button:has-text("Next")');
  if (await next.count()) await next.first().click().catch(() => undefined);
  const pw = page.locator('#password, input[name="login_password"]');
  await pw.first().waitFor({ timeout: 25_000 });
  await pw.first().fill(PP_PW);
  await page.locator('#btnLogin, button[name="btnLogin"], button:has-text("Log In")').first().click().catch(() => undefined);
  const sel = '#payment-submit-btn, [data-testid="submit-button-initial"], button:has-text("Complete Purchase"), button:has-text("Pay Now"), button:has-text("Continue"), button:has-text("Agree")';
  for (let i = 0; i < 35; i++) {
    if (/payment-return/.test(page.url())) break;
    let done = false;
    for (const f of page.frames()) {
      const b = f.locator(sel);
      if (await b.count().catch(() => 0)) { await b.first().click({ timeout: 4000 }).then(() => { done = true; }).catch(() => undefined); if (done) break; }
    }
    if (done) break;
    await page.waitForTimeout(2000);
  }
}

// After a redirect gateway returns to /client/billing/payment-return, the page calls confirm-payment.
async function settleAndAssertPaid(page: Page, invoiceId: string, opts: { expectOrder?: boolean } = {}) {
  // Wait for redirect to payment-return or straight to /client (if confirm is near-instant).
  await page.waitForURL(/payment-return|\/client/, { timeout: 60_000 }).catch(() => undefined);

  // If the browser landed on the payment-return page, wait for the confirm flow to finish.
  // It retries once after 3 s, so give it up to 12 s before checking for errors.
  if (/payment-return/.test(page.url())) {
    await page.waitForURL(/\/client/, { timeout: 12_000 }).catch(() => undefined);
    // If still on payment-return, the confirm failed — report what the page says.
    if (/payment-return/.test(page.url())) {
      const pageText = await page.locator("body").innerText().catch(() => "");
      expect(pageText, "payment-return page showed an error").not.toMatch(/could not confirm|confirmation failed|contact support/i);
    }
  }

  // Allow a few extra seconds for the invoice to settle (webhook path).
  await page.waitForTimeout(3000);
  const inv = await invoiceOf(page, invoiceId);
  expect(inv.status, `invoice ${invoiceId} not PAID: ${JSON.stringify(inv.status)}`).toBe("PAID");
  if (opts.expectOrder !== false) {
    expect((inv as { order?: { id?: string } }).order?.id, "order materialized").toBeTruthy();
  }
  return inv;
}

// ─── NEW customer (guest) ─────────────────────────────────────────────────────

test("NEW customer · Mollie Credit Card · order → pay → paid invoice on dashboard", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `${uniq("new-mcc")}@dezhost.test`;
  const { order } = await (await page.request.post(`${API}/orders/checkout`, { data: { customer: customer(email), items: [{ ...VPS, quantity: 1, configuration: { hostname: uniq("h") } }] } })).json() as { order: { id: string } };
  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "CREDIT_CARD", paymentMethodId: "checkout" } });
  const url = (await pay.json() as { invoice?: { paymentRedirectUrl?: string } }).invoice?.paymentRedirectUrl!;
  expect(url).toMatch(/mollie\.com/);
  await payMollieCard(page, url);
  await settleAndAssertPaid(page, order.id);
  // New guest was materialized into a real client and can log in.
  expect((await page.request.post(`${API}/auth/login`, { data: { email, password } })).ok(), "guest became a client").toBeTruthy();
});

test("NEW customer · PayPal · order → pay → paid invoice on dashboard", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `${uniq("new-pp")}@dezhost.test`;
  const { order } = await (await page.request.post(`${API}/orders/checkout`, { data: { customer: customer(email), items: [{ ...VPS, quantity: 1, configuration: { hostname: uniq("h") } }] } })).json() as { order: { id: string } };
  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "PAYPAL", paymentMethodId: "checkout" } });
  const url = (await pay.json() as { invoice?: { paymentRedirectUrl?: string } }).invoice?.paymentRedirectUrl!;
  expect(url).toMatch(/paypal\.com/);
  await payPayPal(page, url);
  await settleAndAssertPaid(page, order.id);
  expect((await page.request.post(`${API}/auth/login`, { data: { email, password } })).ok(), "guest became a client").toBeTruthy();
});

test("NEW customer · Mollie SEPA · order initiates SEPA debit (PENDING + mandate)", async ({ page }) => {
  const email = `${uniq("new-sepa")}@dezhost.test`;
  const { order } = await (await page.request.post(`${API}/orders/checkout`, { data: { customer: customer(email), items: [{ ...VPS, quantity: 1, configuration: { hostname: uniq("h") } }] } })).json() as { order: { id: string } };
  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "SEPA", paymentMethodId: "checkout", iban: "NL55INGB0000000000" } });
  const body = await pay.json() as { invoice?: { status?: string }; message?: string };
  if (body.message?.includes("Mollie API key")) { test.skip(true, "Mollie not configured"); return; }
  expect([200, 201]).toContain(pay.status());
  // SEPA direct debit is asynchronous → PENDING until it clears, with a SEPA transaction recorded.
  const inv = await invoiceOf(page, order.id);
  expect(inv.status).toBe("PENDING");
  const txs = (inv as { transactions?: Array<{ method?: string }> }).transactions ?? [];
  expect(txs.some((t) => t.method === "SEPA"), "SEPA transaction created").toBeTruthy();
});

// ─── OLD customer (existing, logged-in) ───────────────────────────────────────

async function oldCustomerCheckout(page: Page, method: string, extra: Record<string, unknown> = {}) {
  const tok = await token(page, CLIENT_EMAIL, CLIENT_PASSWORD);
  expect(tok, "client login").toBeTruthy();
  const host = new URL(BASE).hostname;
  await page.context().addCookies([{ name: "dezhost_client_access_token", value: tok, domain: host, path: "/" }]);
  const co = await page.request.post(`${API}/orders/checkout`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { customer: customer(CLIENT_EMAIL), items: [{ ...VPS, quantity: 1, configuration: { hostname: uniq("h") } }] }
  });
  expect(co.ok(), `old-customer checkout: ${co.status()} ${await co.text()}`).toBeTruthy();
  const { order } = await co.json() as { order: { id: string } };
  const pay = await page.request.post(`${API}/orders/${order.id}/pay`, { headers: { Authorization: `Bearer ${tok}` }, data: { method, paymentMethodId: "checkout", ...extra } });
  return { order, payBody: await pay.json() as { invoice?: { paymentRedirectUrl?: string; status?: string }; message?: string }, status: pay.status() };
}

test("OLD customer · Mollie Credit Card · order → pay → paid", async ({ page }) => {
  test.setTimeout(120_000);
  const { order, payBody } = await oldCustomerCheckout(page, "CREDIT_CARD");
  expect(payBody.invoice?.paymentRedirectUrl).toMatch(/mollie\.com/);
  await payMollieCard(page, payBody.invoice!.paymentRedirectUrl!);
  await settleAndAssertPaid(page, order.id);
});

test("OLD customer · PayPal · order → pay → paid", async ({ page }) => {
  test.setTimeout(180_000);
  const { order, payBody } = await oldCustomerCheckout(page, "PAYPAL");
  expect(payBody.invoice?.paymentRedirectUrl).toMatch(/paypal\.com/);
  await payPayPal(page, payBody.invoice!.paymentRedirectUrl!);
  await settleAndAssertPaid(page, order.id);
});

test("OLD customer · Mollie SEPA · order initiates SEPA debit (PENDING + mandate)", async ({ page }) => {
  const { order, payBody, status } = await oldCustomerCheckout(page, "SEPA", { iban: "NL55INGB0000000000" });
  if (payBody.message?.includes("Mollie API key")) { test.skip(true, "Mollie not configured"); return; }
  expect([200, 201]).toContain(status);
  const inv = await invoiceOf(page, order.id);
  expect(inv.status).toBe("PENDING");
  expect(((inv as { transactions?: Array<{ method?: string }> }).transactions ?? []).some((t) => t.method === "SEPA")).toBeTruthy();
});

// ─── Renewal payment (existing customer renews a service via a renewal invoice) ──

test("RENEW · existing customer pays a renewal invoice via Mollie Credit Card", async ({ page }) => {
  test.setTimeout(150_000);
  const admin = await adminToken(page);
  const clients = await (await page.request.get(`${API}/users`, { headers: { Authorization: `Bearer ${admin}` } })).json() as Array<{ id: string; email: string }>;
  const client = clients.find((c) => c.email === CLIENT_EMAIL) ?? clients[0];
  if (!client) { test.skip(true, "no client"); return; }

  // A renewal invoice is a normal PENDING invoice for an existing client with a service-renewal line
  // (this is what the billing cron emits each cycle). Create one for the client to pay.
  const created = await page.request.post(`${API}/billing/invoices`, {
    headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
    data: {
      userId: client.id,
      buyerCountryCode: "DE",
      status: "PENDING",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      lines: [{ description: "Cloud VPS Starter — renewal (MONTHLY)", quantity: 1, unitAmountCents: 799, type: "SERVICE", billingCycle: "MONTHLY", lifecycleAction: "renew", vatRate: 0 }]
    }
  });
  expect(created.ok(), `create renewal invoice: ${created.status()} ${await created.text()}`).toBeTruthy();
  const renewalInvoiceId = (await created.json() as { id?: string }).id!;
  expect(renewalInvoiceId).toBeTruthy();

  // The logged-in client pays the renewal invoice via Mollie Credit Card.
  const tok = await token(page, CLIENT_EMAIL, CLIENT_PASSWORD);
  const host = new URL(BASE).hostname;
  await page.context().addCookies([{ name: "dezhost_client_access_token", value: tok, domain: host, path: "/" }]);
  const pay = await page.request.post(`${API}/billing/invoices/${renewalInvoiceId}/pay`, { headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, data: { method: "CREDIT_CARD", paymentMethodId: "mollie" } });
  const payBody = await pay.json() as { paymentRedirectUrl?: string; message?: string };
  if (payBody.message?.includes("Mollie API key")) { test.skip(true, "Mollie not configured"); return; }
  expect(payBody.paymentRedirectUrl, `renewal redirect: ${JSON.stringify(payBody)}`).toMatch(/mollie\.com/);
  await payMollieCard(page, payBody.paymentRedirectUrl!);
  await settleAndAssertPaid(page, renewalInvoiceId, { expectOrder: false });

  // The paid renewal invoice is visible to the client with a final (non "N-") number.
  const finalInv = await invoiceOf(page, renewalInvoiceId);
  expect(String(finalInv.invoiceNumber ?? "")).not.toMatch(/^N-/);
});
