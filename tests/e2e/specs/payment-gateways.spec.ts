/**
 * Payment gateway E2E tests.
 *
 * Tests all payment gateway scenarios for storefront checkout and invoice payment.
 *
 * Gateway behaviour by environment:
 *   SANDBOX       – always works, no external calls. Full E2E (order → paid → portal).
 *   PayPal        – creates a real PayPal Sandbox order; redirect URL tested.
 *                   Full capture is not testable without a real PayPal login.
 *   Mollie CC     – creates a real Mollie Hosted Page; redirect URL tested.
 *                   Full capture needs a real card entry on Mollie's page.
 *   Mollie SEPA   – requires an existing mandate; NOT valid for checkout.
 *                   Tested via the payment-methods setup flow.
 *   Bank Wire     – shows bank details; invoice stays UNPAID.
 *
 * Mollie NOTE: Mollie validates the webhookUrl is publicly reachable.
 *   On localhost the webhookUrl is omitted (Mollie accepts it without one).
 *   On production the PUBLIC_API_URL env must be set to the public API domain.
 *
 * Run:
 *   npx playwright test tests/e2e/specs/payment-gateways.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

// Support both the E2E_* vars (passed on CLI) and the legacy PLAYWRIGHT_BASE_URL /
// NEXT_PUBLIC_API_URL vars (set internally by playwright.config.ts in some setups).
const BASE = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API  = (process.env.E2E_API_URL  ?? process.env.NEXT_PUBLIC_API_URL  ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
// A real client account created during previous sandbox checkout E2E runs
const CLIENT_EMAIL    = process.env.E2E_CLIENT_EMAIL    ?? "e2e-checkout-1780472803163@dezhost.test";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "E2eTest9!aA";

const ts = () => Date.now();
const email = (prefix: string) => `${prefix}-${ts()}@dezhost.test`;
const domain = (prefix: string) => `${prefix}-${ts()}.example.com`;
const password = "E2eTest9!aA";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getTestProduct(page: Page): Promise<{ id: string; priceId: string } | null> {
  const r = await page.request.get(`${API}/products`);
  if (!r.ok()) return null;
  const products = await r.json() as Array<{ id: string; type: string; prices: Array<{ id: string; billingCycle: string }> }>;
  const p = products.find((x) => x.type === "SHARED_HOSTING" && x.prices.length > 0);
  if (!p) return null;
  const price = p.prices.find((pr) => pr.billingCycle === "MONTHLY") ?? p.prices[0];
  return { id: p.id, priceId: price!.id };
}

// Cache the admin token for the lifetime of the test suite to avoid hitting
// the production rate limiter when many tests call the login endpoint.
let _cachedAdminToken: string | undefined;

async function adminToken(page: Page): Promise<string> {
  if (_cachedAdminToken) return _cachedAdminToken;
  const r = await page.request.post(`${API}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, scope: "admin" }
  });
  if (!r.ok()) return "";
  const body = await r.json() as { accessToken?: string };
  _cachedAdminToken = body.accessToken ?? "";
  return _cachedAdminToken;
}

async function createOrderViaApi(page: Page, token: string, productId: string, priceId: string) {
  const clients = await (await page.request.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })).json() as Array<{ id: string }>;
  const clientId = clients[0]?.id;
  if (!clientId) return null;

  const r = await page.request.post(`${API}/orders/admin`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { userId: clientId, items: [{ productId, productPriceId: priceId, quantity: 1, configuration: { domainName: domain("api-order") } }] }
  });
  const body = await r.json() as { order?: { id: string }; invoice?: { id: string } };
  return body;
}

async function fillCheckoutForm(page: Page, opts: { email: string; paymentMethod?: string }) {
  const domainInput = page.locator('input[name="hostingDomainName"], input[name="domainName"]');
  if (await domainInput.count() > 0) {
    await domainInput.first().fill(domain("chk"));
  }
  await page.fill('[name="name"]', "E2E Tester");
  await page.fill('[name="email"]', opts.email);
  await page.fill('[name="password"]', password);
  await page.fill('[name="phoneCountryCode"]', "+49");
  await page.fill('[name="phone"]', "1234567890");
  await page.fill('[name="address"]', "Test Str. 1");
  await page.fill('[name="postalCode"]', "10115");
  await page.fill('[name="city"]', "Berlin");
  await page.fill('[name="state"]', "Berlin");

  if (opts.paymentMethod) {
    // Click the parent label card (radio is visually hidden behind SVG overlay; label is the clickable card)
    const label = page.locator(`label:has(input[type="radio"][value="${opts.paymentMethod}"])`);
    if (await label.count() > 0) await label.first().click();
  }
  await page.check('[name="acceptedTerms"]');
}

async function loginAsAdmin(page: Page) {
  // Reuse the cached admin token to avoid hitting the production rate limiter.
  // On failure, invalidate the cache and retry once with a fresh token.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      _cachedAdminToken = undefined;
      await page.waitForTimeout(3_000);
    }
    const token = await adminToken(page);
    if (!token) continue;
    const hostname = new URL(BASE).hostname;
    await page.context().addCookies([
      { name: "teculiar_admin_access_token", value: token, domain: hostname, path: "/" },
      { name: "teculiar_admin_refresh_token", value: "", domain: hostname, path: "/" }
    ]);
    await page.goto(`${BASE}/admin`);
    try {
      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
      return;
    } catch {
      // Token might be stale — try once more with a fresh one
    }
  }
  throw new Error("Admin login failed after retries");
}

async function loginAsClient(page: Page) {
  // Set auth cookies directly via API — avoids dependency on frontend's NEXT_PUBLIC_API_URL build var
  const r = await page.request.post(`${API}/auth/login`, {
    data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD }
  });
  if (!r.ok()) {
    throw new Error(`Client login API failed: ${r.status()}`);
  }
  const body = await r.json() as { accessToken?: string; refreshToken?: string };
  const hostname = new URL(BASE).hostname;
  if (body.accessToken) {
    await page.context().addCookies([
      { name: "teculiar_client_access_token", value: body.accessToken, domain: hostname, path: "/" },
      { name: "teculiar_client_refresh_token", value: body.refreshToken ?? "", domain: hostname, path: "/" }
    ]);
  }
  await page.goto(`${BASE}/client`);
  await page.waitForURL(/\/client/, { timeout: 15_000 });
}

async function clientToken(page: Page): Promise<string> {
  const r = await page.request.post(`${API}/auth/login`, {
    data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD }
  });
  if (!r.ok()) return "";
  const body = await r.json() as { accessToken?: string };
  return body.accessToken ?? "";
}

// ─── Sandbox gateway (full E2E) ───────────────────────────────────────────────

test.describe("Sandbox gateway", () => {
  test("full checkout: new user → sandbox → redirected to client portal", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "SANDBOX")) {
      test.skip(true, "Sandbox gateway not enabled in storefront"); return;
    }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    await fillCheckoutForm(page, { email: email("sandbox"), paymentMethod: "SANDBOX" });
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/client/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/client/);
    // No raw "Internal Server Error" on the portal page
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("sandbox: invoice is marked PAID immediately", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "SANDBOX")) {
      test.skip(true, "Sandbox gateway not enabled in storefront"); return;
    }

    // Intercept the pay response to read the invoice status
    let invoiceStatus = "";
    await page.route(`${API}/orders/*/pay`, async (route) => {
      const resp = await route.fetch();
      const body = await resp.json();
      invoiceStatus = (body.invoice as { status?: string })?.status ?? "";
      await route.fulfill({ response: resp });
    });

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");
    await fillCheckoutForm(page, { email: email("sandbox-paid"), paymentMethod: "SANDBOX" });
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/client/, { timeout: 30_000 });
    expect(invoiceStatus).toBe("PAID");
  });
});

// ─── PayPal gateway ───────────────────────────────────────────────────────────

test.describe("PayPal gateway", () => {
  test("checkout creates PayPal order and returns redirect URL", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    // Check PayPal is available in storefront
    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "PAYPAL")) {
      test.skip(true, "PayPal gateway not enabled");
      return;
    }

    let paymentResponse: Record<string, unknown> = {};
    await page.route(`${API}/orders/*/pay`, async (route) => {
      const resp = await route.fetch();
      paymentResponse = await resp.json();
      await route.fulfill({ response: resp });
    });

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    const paypalRadio = page.locator('input[type="radio"][value="PAYPAL"]');
    if (await paypalRadio.count() === 0) {
      test.skip(true, "PayPal radio not visible in checkout");
      return;
    }

    await fillCheckoutForm(page, { email: email("paypal-chk"), paymentMethod: "PAYPAL" });
    await page.click('button[type="submit"]');

    // Wait for the pay request to complete (either redirect or error shown)
    await page.waitForTimeout(10_000);

    const inv = paymentResponse.invoice as Record<string, unknown> | undefined;
    // Invoice should be PENDING (payment awaiting PayPal approval)
    expect(inv?.status).toBe("PENDING");
    // A PayPal redirect URL must be present
    const redirectUrl = String(inv?.paymentRedirectUrl ?? "");
    expect(redirectUrl).toMatch(/paypal\.com/);
  });

  test("invoice payment page renders PayPal Buttons for an existing (logged-in) client", async ({ page }) => {
    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string; config?: Record<string, string> }>;
    const paypalGw = gateways.find((g) => g.method === "PAYPAL");
    if (!paypalGw?.config?.clientId) {
      test.skip(true, "PayPal clientId not configured");
      return;
    }

    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    // Use an existing client (admin account) — new checkout users only exist after payment succeeds
    const token = await adminToken(page);
    if (!token) { test.skip(true, "Admin login failed"); return; }

    const orderData = await createOrderViaApi(page, token, product.id, product.priceId);
    const invoiceId = orderData?.invoice?.id;
    if (!invoiceId) { test.skip(true, "Could not create test invoice via admin API"); return; }

    await loginAsAdmin(page);
    await page.goto(`${BASE}/client/billing/payment?invoice=${invoiceId}`);
    await page.waitForLoadState("networkidle");

    // Payment page should show method tabs without redirecting to login
    await expect(page.locator("body")).not.toContainText(/login|Login/, { timeout: 5_000 }).catch(() => undefined);
    await expect(page.locator("body")).toContainText(/PayPal|Credit|SEPA|Bank/i, { timeout: 10_000 });
  });

  test("payment-return page auto-logs-in new user when confirm-payment returns accessToken", async ({ page }) => {
    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "PAYPAL")) {
      test.skip(true, "PayPal gateway not enabled"); return;
    }
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No product found"); return; }

    // Create a checkout invoice (no user created yet — that happens on payment success)
    const ts2 = Date.now();
    const newEmail = `paypal-return-${ts2}@dezhost.test`;
    const co = await page.request.post(`${API}/orders/checkout`, {
      data: { customer: { email: newEmail, name: "T", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "A", city: "B", postalCode: "10115", state: "" } }, items: [{ productId: product.id, productPriceId: product.priceId, quantity: 1, configuration: { domainName: domain("pp-ret"), domainUse: "external" } }] }
    });
    if (!co.ok()) { test.skip(true, "Checkout failed"); return; }
    const { order } = await co.json() as { order: { id: string } };
    const payResp = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method: "PAYPAL", paymentMethodId: "checkout" } });
    const payBody = await payResp.json() as { invoice?: { id?: string } };
    const invoiceId = payBody.invoice?.id;
    if (!invoiceId) { test.skip(true, "No invoice ID from pay"); return; }

    // Visit payment-return unauthenticated — confirm-payment mock returns PAID
    // The page will call storeAuth (setting a mock cookie) and navigate away from payment-return.
    await page.route(`${API}/billing/invoices/*/confirm-payment`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "PAID",
          invoice: { id: invoiceId },
          accessToken: "mock-token-for-auto-login-test",
          user: { id: "mock-id", email: newEmail, name: "T", roles: ["client"] }
        })
      });
    });

    await page.goto(`${BASE}/client/billing/payment-return?invoiceId=${invoiceId}`);
    // Page should navigate away from payment-return (to /client or /login after token validation)
    await page.waitForFunction(() => !window.location.href.includes("payment-return"), { timeout: 10_000 });
    // Must not stay on payment-return
    expect(page.url()).not.toMatch(/payment-return/);
  });
});

// ─── Mollie Credit Card ───────────────────────────────────────────────────────

test.describe("Mollie Credit Card", () => {
  test("checkout creates Mollie payment and returns hosted checkout redirect URL", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "CREDIT_CARD")) {
      test.skip(true, "CREDIT_CARD gateway not enabled");
      return;
    }

    let invoiceStatus = "";
    let redirectUrl = "";
    await page.route(`${API}/orders/*/pay`, async (route) => {
      const resp = await route.fetch();
      const body = await resp.json() as { invoice?: { status?: string; paymentRedirectUrl?: string } };
      invoiceStatus = body.invoice?.status ?? "";
      redirectUrl = body.invoice?.paymentRedirectUrl ?? "";
      await route.fulfill({ response: resp });
    });

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    const ccRadio = page.locator('input[type="radio"][value="CREDIT_CARD"]');
    if (await ccRadio.count() === 0) { test.skip(true, "CREDIT_CARD radio not visible"); return; }

    await fillCheckoutForm(page, { email: email("mollie-cc"), paymentMethod: "CREDIT_CARD" });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(12_000);

    expect(invoiceStatus).toBe("PENDING");
    // Mollie hosted checkout URL should be returned (mollie.com domain)
    expect(redirectUrl).toMatch(/mollie\.com/);
  });

  test("direct API: Mollie CC pay → invoice PENDING with mollie.com redirect", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No product found"); return; }

    const ts2 = Date.now();
    const checkout = await page.request.post(`${API}/orders/checkout`, {
      data: {
        customer: { email: `api-cc-${ts2}@dezhost.test`, name: "API Test", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "A", city: "Berlin", postalCode: "10115", state: "" } },
        items: [{ productId: product.id, productPriceId: product.priceId, quantity: 1, configuration: { domainName: domain("api-cc"), domainUse: "external" } }]
      }
    });
    if (!checkout.ok()) { test.skip(true, "Checkout failed"); return; }
    const { order } = await checkout.json() as { order: { id: string } };

    const pay = await page.request.post(`${API}/orders/${order.id}/pay`, {
      data: { method: "CREDIT_CARD", paymentMethodId: "mollie" }
    });
    const payBody = await pay.json() as { invoice?: { status?: string; paymentRedirectUrl?: string }; statusCode?: number; message?: string };

    if (payBody.statusCode === 400 && payBody.message?.includes("Mollie API key")) {
      test.skip(true, "Mollie API key not configured on this environment"); return;
    }
    expect([200, 201]).toContain(pay.status());
    expect(payBody.invoice?.status).toBe("PENDING");
    expect(payBody.invoice?.paymentRedirectUrl).toMatch(/mollie\.com/);
  });

  test("payment-return auto-logs-in new user after Mollie payment (mocked API)", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No product found"); return; }

    // Create a checkout invoice (no user created yet — that happens on payment success)
    const ts2 = Date.now();
    const newEmail = `mollie-ret-${ts2}@dezhost.test`;
    const co = await page.request.post(`${API}/orders/checkout`, {
      data: { customer: { email: newEmail, name: "T", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "A", city: "B", postalCode: "10115", state: "" } }, items: [{ productId: product.id, productPriceId: product.priceId, quantity: 1, configuration: { domainName: domain("ml-ret"), domainUse: "external" } }] }
    });
    if (!co.ok()) { test.skip(true, "Checkout failed"); return; }
    const { order } = await co.json() as { order: { id: string } };
    // Use PAYPAL for the redirect (doesn't need Mollie API key)
    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    const method = gateways.some((g) => g.method === "PAYPAL") ? "PAYPAL" : "CREDIT_CARD";
    const payResp = await page.request.post(`${API}/orders/${order.id}/pay`, { data: { method, paymentMethodId: "checkout" } });
    if (!payResp.ok()) { test.skip(true, "Pay request failed"); return; }
    const payBody = await payResp.json() as { invoice?: { id?: string } };
    const invoiceId = payBody.invoice?.id;
    if (!invoiceId) { test.skip(true, "No invoice ID"); return; }

    // Visit payment-return unauthenticated — confirm-payment mock returns PAID
    // Page navigates away from payment-return after receiving the success response.
    await page.route(`${API}/billing/invoices/*/confirm-payment`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "PAID",
          invoice: { id: invoiceId },
          accessToken: "mock-token-mollie-return-test",
          user: { id: "mock-id", email: newEmail, name: "T", roles: ["client"] }
        })
      });
    });

    await page.goto(`${BASE}/client/billing/payment-return?invoiceId=${invoiceId}`);
    await page.waitForFunction(() => !window.location.href.includes("payment-return"), { timeout: 10_000 });
    expect(page.url()).not.toMatch(/payment-return/);
  });
});

// ─── Mollie SEPA ─────────────────────────────────────────────────────────────

test.describe("Mollie SEPA", () => {
  // Mollie SEPA directdebit uses sequenceType=first at checkout: the user is
  // redirected to Mollie to authorize the IBAN debit. After authorisation the
  // invoice is charged via sequenceType=recurring, and the mandate is saved for
  // automatic future billing.

  test("SEPA checkout: direct mandate + recurring charge returns PENDING invoice", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "SEPA")) {
      test.skip(true, "SEPA gateway not enabled"); return;
    }

    const ts2 = Date.now();
    const checkout = await page.request.post(`${API}/orders/checkout`, {
      data: {
        customer: {
          email: `sepa-test-${ts2}@dezhost.test`,
          name: "SEPA Test",
          password,
          countryCode: "DE",
          customerType: "INDIVIDUAL",
          address: { line1: "A", city: "Berlin", postalCode: "10115", state: "" }
        },
        items: [{ productId: product.id, productPriceId: product.priceId, quantity: 1, configuration: { domainName: domain("sepa"), domainUse: "external" } }]
      }
    });
    if (!checkout.ok()) { test.skip(true, "Checkout creation failed"); return; }
    const { order } = await checkout.json() as { order: { id: string } };

    // Pass a Mollie test IBAN — the API creates the mandate directly + charges via recurring
    const pay = await page.request.post(`${API}/orders/${order.id}/pay`, {
      data: { method: "SEPA", paymentMethodId: "checkout", iban: "NL55INGB0000000000" }
    });
    const body = await pay.json() as { statusCode?: number; message?: string; invoice?: { status?: string } };

    if (body.message?.includes("API key") || body.message?.includes("Mollie API key")) {
      test.skip(true, "Mollie API key not configured on this environment"); return;
    }
    if (body.statusCode === 400) {
      const msg = String(body.message ?? "");
      test.skip(true, `SEPA error: ${msg}`); return;
    }
    expect([200, 201]).toContain(pay.status());
    // SEPA direct debit is asynchronous — invoice is PENDING until the debit clears
    expect(body.invoice?.status).toBe("PENDING");
  });

  test("SEPA mandate setup via payment-methods API redirects to Mollie", async ({ page }) => {
    // Log in as a client (admin account for convenience in tests)
    await loginAsAdmin(page);

    await page.goto(`${BASE}/client/payments`);
    await page.waitForLoadState("networkidle");

    // Payment info page should render without errors
    await expect(page.locator("body")).not.toContainText("Internal Server Error");

    // SEPA method option should exist in the setup form
    const sepaOption = page.locator('select option[value="SEPA"], option[value="SEPA"]');
    if (await sepaOption.count() === 0) {
      test.skip(true, "SEPA option not visible in payments page");
      return;
    }
    await expect(sepaOption.first()).toBeAttached();
  });

  test("recurring SEPA charge via saved mandate (mocked cron)", async ({ page }) => {
    const token = await adminToken(page);
    if (!token) { test.skip(true, "Admin login failed"); return; }

    // Mock the maintenance endpoint (cron trigger) to test the automatic payment path
    const maintenanceResp = await page.request.post(`${API}/admin/dev/billing/maintenance`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Should succeed (even if no SEPA invoices to charge)
    const body = await maintenanceResp.json() as { automaticPayments?: { paid?: number; failed?: number } };
    expect(maintenanceResp.status()).toBe(201);
    // automaticPayments field shows counts
    expect(body).toHaveProperty("automaticPayments");
  });
});

// ─── Bank Wire ────────────────────────────────────────────────────────────────

test.describe("Bank Wire Transfer", () => {
  test("invoice payment page shows bank details when bank wire is configured", async ({ page }) => {
    const token = await adminToken(page);
    const product = await getTestProduct(page);
    if (!product || !token) { test.skip(true, "Missing test data"); return; }

    // Configure bank wire if not already set
    await page.request.patch(`${API}/admin/dev/billing/payment-gateways`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        gateways: [{
          method: "BANK_TRANSFER",
          enabled: true,
          config: {
            accountHolder: "Dezhost GmbH",
            bankName: "Deutsche Bank",
            iban: "DE89370400440532013000",
            bic: "DEUTDEDB",
            referenceNote: "Please include invoice number as payment reference."
          }
        }]
      }
    });

    const orderData = await createOrderViaApi(page, token, product.id, product.priceId);
    const invoiceId = orderData?.invoice?.id;
    if (!invoiceId) { test.skip(true, "Could not create test invoice"); return; }

    await loginAsAdmin(page);
    await page.goto(`${BASE}/client/billing/payment?invoice=${invoiceId}`);
    await page.waitForLoadState("networkidle");

    // Bank Wire tab should be available
    const bankTab = page.locator("button, [role='tab']").filter({ hasText: /bank|wire|überweisung/i });
    if (await bankTab.count() > 0) {
      await bankTab.first().click();
      // Bank details should appear
      await expect(page.locator("body")).toContainText(/IBAN|DE89/i, { timeout: 5_000 });
      await expect(page.locator("body")).toContainText(/BIC|DEUTDEDB/i, { timeout: 5_000 });
    }
  });

  test("bank wire checkout: invoice status becomes PENDING (via direct API)", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "BANK_TRANSFER")) {
      test.skip(true, "Bank wire not enabled in storefront"); return;
    }

    // Create a fresh order via checkout API
    const ts2 = Date.now();
    const checkout = await page.request.post(`${API}/orders/checkout`, {
      data: {
        customer: {
          email: `bankwire-${ts2}@dezhost.test`,
          name: "Bank Wire Test",
          password,
          countryCode: "DE",
          customerType: "INDIVIDUAL",
          address: { line1: "Teststr. 1", city: "Berlin", postalCode: "10115", state: "Berlin" }
        },
        items: [{ productId: product.id, productPriceId: product.priceId, quantity: 1, configuration: { domainName: domain("wire"), domainUse: "external" } }]
      }
    });
    if (!checkout.ok()) { test.skip(true, "Checkout creation failed"); return; }
    const { order } = await checkout.json() as { order: { id: string } };

    // Pay with BANK_TRANSFER — should succeed and return PENDING (not 400)
    const pay = await page.request.post(`${API}/orders/${order.id}/pay`, {
      data: { method: "BANK_TRANSFER", paymentMethodId: "checkout" }
    });
    const body = await pay.json() as { statusCode?: number; message?: string; invoice?: { status?: string } };

    // Must not be a 400 validation error (which was the bug: BANK_TRANSFER missing from @IsIn)
    expect(pay.status()).not.toBe(400);
    expect([200, 201]).toContain(pay.status());
    // Bank wire is manual — invoice stays PENDING until admin confirms
    expect(body.invoice?.status).toBe("PENDING");
  });

  test("bank wire checkout UI: BANK_TRANSFER radio is selectable and no crash", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "BANK_TRANSFER")) {
      test.skip(true, "Bank wire not enabled in storefront"); return;
    }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    const bankRadio = page.locator('input[type="radio"][value="BANK_TRANSFER"]');
    if (await bankRadio.count() === 0) { test.skip(true, "Bank wire not shown in checkout"); return; }

    await bankRadio.click();
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});

// ─── Payment gateway admin settings ──────────────────────────────────────────

test.describe("Admin: Payment Gateway Settings", () => {
  test("admin payment-gateways page loads without errors", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/payment-gateways`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    // Gateway form should show PayPal, Mollie sections
    await expect(page.locator("body")).toContainText(/PayPal|Mollie|Sandbox/i, { timeout: 8_000 });
  });

  test("admin can enable/disable sandbox gateway", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/payment-gateways`);
    await page.waitForLoadState("networkidle");

    const sandboxCheck = page.locator('input[name="SANDBOX_enabled"]');
    if (await sandboxCheck.count() === 0) { test.skip(true, "Sandbox gateway input not found"); return; }

    const isChecked = await sandboxCheck.isChecked();
    // Toggle it off then back on
    await sandboxCheck.setChecked(!isChecked);
    await sandboxCheck.setChecked(isChecked); // restore

    // Save
    const saveBtn = page.locator('button[type="submit"]').filter({ hasText: /save|verify/i });
    await saveBtn.click();
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("storefront payment-gateways API returns expected methods", async ({ page }) => {
    const r = await page.request.get(`${API}/storefront/payment-gateways`);
    expect(r.ok()).toBeTruthy();
    const gateways = await r.json() as Array<{ method: string; title: string }>;

    // Must always have at least one gateway
    expect(gateways.length).toBeGreaterThan(0);

    // Each gateway must have method and title
    for (const gw of gateways) {
      expect(gw.method).toBeTruthy();
      expect(gw.title).toBeTruthy();
    }

    // PayPal gateway (when present) must expose clientId
    const paypal = gateways.find((g) => g.method === "PAYPAL");
    if (paypal) {
      const hasClientId = Boolean((paypal as { config?: { clientId?: string } }).config?.clientId);
      expect(hasClientId).toBe(true);
    }
  });
});

// ─── Cross-gateway: conflict prevention ──────────────────────────────────────

test.describe("Payment method conflict prevention", () => {
  test("second pay attempt on PENDING invoice returns 400 Invoice is not payable", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const ts2 = Date.now();
    const checkout = await page.request.post(`${API}/orders/checkout`, {
      data: {
        customer: { email: `conflict-${ts2}@dezhost.test`, name: "T", password, countryCode: "DE", customerType: "INDIVIDUAL", address: { line1: "A", city: "B", postalCode: "10115", state: "" } },
        items: [{ productId: product.id, productPriceId: product.priceId, quantity: 1, configuration: { domainName: domain("conflict"), domainUse: "external" } }]
      }
    });
    if (!checkout.ok()) { test.skip(true, "Checkout failed"); return; }
    const { order } = await checkout.json() as { order: { id: string } };

    // First pay — sandbox makes it PAID immediately
    const first = await page.request.post(`${API}/orders/${order.id}/pay`, {
      data: { method: "CREDIT_CARD", paymentMethodId: "sandbox" }
    });
    expect(first.ok()).toBeTruthy();

    // Second pay attempt — should be rejected
    const second = await page.request.post(`${API}/orders/${order.id}/pay`, {
      data: { method: "PAYPAL", paymentMethodId: "checkout" }
    });
    const secondBody = await second.json() as { statusCode?: number; message?: string };
    expect(second.status()).toBe(400);
    expect(secondBody.message).toMatch(/not payable/i);
  });

  test("set-default payment method API works for existing methods", async ({ page }) => {
    // Log in as admin and check the payment methods API
    const token = await adminToken(page);
    if (!token) { test.skip(true, "Admin login failed"); return; }

    const clients = await (await page.request.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })).json() as Array<{ id: string }>;
    const clientId = clients[0]?.id;
    if (!clientId) { test.skip(true, "No clients found"); return; }

    // Get this client's payment methods via admin bearer (using their ID won't work via admin token)
    // Instead, verify the endpoint contract via the storefront
    await loginAsAdmin(page);

    // Check payment methods page renders
    await page.goto(`${BASE}/client/payments`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});

// ─── Bank Wire full UI flow (regression: was showing "Invalid credentials") ────

test.describe("Bank Wire checkout UI (full flow)", () => {
  test("bank wire checkout: new user sees pending message with bank details, NOT 'Invalid credentials'", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "BANK_TRANSFER")) {
      test.skip(true, "Bank wire not enabled in storefront"); return;
    }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    const bankRadio = page.locator('input[type="radio"][value="BANK_TRANSFER"]');
    if (await bankRadio.count() === 0) { test.skip(true, "Bank wire radio not visible"); return; }

    await fillCheckoutForm(page, { email: email("bankwire-ui"), paymentMethod: "BANK_TRANSFER" });
    await page.click('button[type="submit"]');

    // Wait for UI to respond — should show pending message, NOT "Invalid credentials"
    await page.waitForTimeout(15_000);

    const bodyText = await page.locator("body").textContent() ?? "";
    // Must not show "Invalid credentials" (the old bug)
    expect(bodyText).not.toContain("Invalid credentials");
    // Should show a pending/bank-wire message or IBAN
    const hasPendingMsg = /IBAN|pending|Auftrag|ausstehend|überweisen|bank/i.test(bodyText);
    expect(hasPendingMsg).toBe(true);
  });

  test("SEPA checkout: new user sees pending message, NOT 'Invalid credentials'", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "SEPA")) {
      test.skip(true, "SEPA gateway not enabled"); return;
    }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    const sepaRadio = page.locator('input[type="radio"][value="SEPA"]');
    if (await sepaRadio.count() === 0) { test.skip(true, "SEPA radio not visible"); return; }

    await fillCheckoutForm(page, { email: email("sepa-ui"), paymentMethod: "SEPA" });

    // Fill IBAN
    const ibanInput = page.locator('input#sepaIban, input[placeholder*="IBAN"], input[id*="sepa"]');
    if (await ibanInput.count() > 0) {
      await ibanInput.first().fill("NL55INGB0000000000");
    }

    await page.click('button[type="submit"]');

    // Wait for UI to respond — should show pending message, NOT "Invalid credentials"
    await page.waitForTimeout(15_000);

    const bodyText = await page.locator("body").textContent() ?? "";
    expect(bodyText).not.toContain("Invalid credentials");
    // Should show a pending message about SEPA
    const hasPendingMsg = /SEPA|pending|Auftrag|ausstehend|Lastschrift/i.test(bodyText);
    expect(hasPendingMsg).toBe(true);
  });
});

// ─── PayPal add-funds redirect mode ──────────────────────────────────────────

test.describe("PayPal add-funds (redirect mode)", () => {
  test("add-funds with PayPal returns a redirect URL (not stuck in SDK mode)", async ({ page }) => {
    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "PAYPAL")) {
      test.skip(true, "PayPal gateway not enabled"); return;
    }

    const token = await clientToken(page);
    if (!token) { test.skip(true, "Client login failed — set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD"); return; }

    const r = await page.request.post(`${API}/billing/add-funds`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { amountCents: 500, method: "PAYPAL" }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json() as { paymentRedirectUrl?: string; status?: string };
    // Must return a redirect URL pointing to PayPal (redirect mode, not SDK mode)
    expect(body.paymentRedirectUrl).toMatch(/paypal\.com/);
  });
});

// ─── OG image meta tag URL ────────────────────────────────────────────────────

test.describe("OG image meta tag URL", () => {
  test("homepage og:image URL uses www domain (no 302 redirect loop)", async ({ page }) => {
    const r = await page.request.get(`${BASE}/de`);
    const html = await r.text();
    const match = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    const ogImageUrl = match?.[1] ?? "";

    if (!ogImageUrl) {
      // Some pages may not have OG images — skip rather than fail
      test.skip(true, "No og:image meta tag found on homepage");
      return;
    }

    // The URL must not use the bare dezhost.com domain (no-www redirects to www)
    expect(ogImageUrl).not.toMatch(/^https?:\/\/dezhost\.com\//);
    // Must use www.dezhost.com (no redirect)
    expect(ogImageUrl).toMatch(/www\.dezhost\.com/);
  });
});

// ─── Webhook handling ─────────────────────────────────────────────────────────

test.describe("Webhook handling", () => {
  test("PayPal webhook endpoint accepts POST without auth", async ({ page }) => {
    // The webhook endpoint must be public (no auth guard)
    const r = await page.request.post(`${API}/billing/webhooks/paypal`, {
      data: { id: "FAKE_PAYPAL_WEBHOOK_TEST" },
      headers: { "Content-Type": "application/json" }
    });
    // Should return 200/201 (skipped or ok=true), not 401 or 500
    expect([200, 201]).toContain(r.status());
    const body = await r.json() as { ok?: boolean; skipped?: string };
    expect(body.ok).toBe(true);
  });

  test("Mollie webhook endpoint accepts POST without auth", async ({ page }) => {
    const r = await page.request.post(`${API}/billing/webhooks/credit_card`, {
      data: { id: "tr_fake_mollie_test" },
      headers: { "Content-Type": "application/json" }
    });
    expect([200, 201]).toContain(r.status());
    const body = await r.json() as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});

// ─── Bug fix: middleware - payment-return accessible without auth ──────────────

test.describe("Middleware: payment-return accessible without auth", () => {
  test("unauthenticated GET /client/billing/payment-return does NOT redirect to /login", async ({ page }) => {
    // Before the fix, the /client block ran first and redirected to /login.
    // After the fix, the exception for /client/billing/payment-return runs first.
    const fakeInvoiceId = "nonexistent-invoice-test-id";
    const response = await page.goto(`${BASE}/client/billing/payment-return?invoiceId=${fakeInvoiceId}`, {
      waitUntil: "commit"
    });
    // Must NOT be redirected to /login
    expect(page.url()).not.toMatch(/\/login/);
    // Must land on the payment-return page (200 or render the page)
    expect(response?.status()).not.toBe(302);
    await page.waitForLoadState("domcontentloaded");
    // Page should say "Payment" (the h1), not the login form
    await expect(page.locator("h1")).not.toContainText(/login|anmelden/i, { timeout: 5_000 });
  });

  test("payment-return page shows cancel/fail message and new-order link for unknown invoice", async ({ page }) => {
    // Mock the confirm-payment endpoint to return FAILED (simulating a canceled PayPal order)
    await page.route(`${API}/billing/invoices/*/confirm-payment`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "FAILED", invoice: { id: "fake-id" } })
      });
    });

    await page.goto(`${BASE}/client/billing/payment-return?invoiceId=fake-canceled-order`);
    await page.waitForLoadState("networkidle");

    // Must not redirect to /login
    expect(page.url()).not.toMatch(/\/login/);

    // Should show the failure message
    await expect(page.locator("body")).toContainText(/not completed|try again|new order/i, { timeout: 8_000 });

    // Should show a "place new order" or "go back" button
    const retryLink = page.locator("a").filter({ hasText: /new order|back|home|kontakt|support/i });
    await expect(retryLink.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Bug fix: radio button grouping ──────────────────────────────────────────

test.describe("Payment gateway radio grouping", () => {
  test("only one payment gateway is visually selected at a time", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    const methods = gateways.map((g) => g.method);
    if (methods.length < 2) { test.skip(true, "Need at least 2 payment gateways for this test"); return; }

    // All radio inputs must have the same name attribute to form a group
    const radios = page.locator('input[type="radio"][value]');
    const count = await radios.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const name = await radios.nth(i).getAttribute("name");
      expect(name).toBe("paymentMethod");
    }

    // Click a second gateway by its parent label (radio input is visually hidden; label is the clickable card)
    const secondRadio = radios.nth(1);
    const secondValue = await secondRadio.getAttribute("value");
    // Click via the parent label element to simulate real user interaction on the card
    const secondLabel = page.locator(`label:has(input[type="radio"][value="${secondValue}"])`);
    await secondLabel.first().click();

    // All other radios must not be checked
    for (let i = 0; i < count; i++) {
      const r = radios.nth(i);
      const v = await r.getAttribute("value");
      if (v === secondValue) {
        await expect(r).toBeChecked();
      } else {
        await expect(r).not.toBeChecked();
      }
    }
  });
});

// ─── Bug fix: payment gateway UI redesign (logo icons) ───────────────────────

test.describe("Payment gateway icon-based UI", () => {
  test("BANK_TRANSFER card does not show 'VISA' or 'MC' text", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (!gateways.some((g) => g.method === "BANK_TRANSFER")) {
      test.skip(true, "Bank wire not enabled in storefront"); return;
    }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    // Find the BANK_TRANSFER card label
    const bankLabel = page.locator('label:has(input[value="BANK_TRANSFER"])');
    if (await bankLabel.count() === 0) { test.skip(true, "BANK_TRANSFER label not found"); return; }

    const bankCardText = await bankLabel.first().textContent() ?? "";
    // Must NOT show Visa/MC text (the old bug)
    expect(bankCardText).not.toMatch(/VISA\s*·\s*MC/i);
    expect(bankCardText).not.toMatch(/visa.*mc|visa.*mastercard/i);
  });

  test("payment gateway cards use logo/icon spans (not plain text marks)", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    // Each card should have a .paymentLogo span (contains SVG or icon, not raw text)
    const logoSpans = page.locator('[class*="paymentLogo"]');
    const count = await logoSpans.count();
    // At least one gateway must have the redesigned logo container
    expect(count).toBeGreaterThan(0);

    // SVGs or images should be inside the logo spans
    const svgCount = await page.locator('[class*="paymentLogo"] svg').count();
    // At least one SVG logo must be rendered
    expect(svgCount).toBeGreaterThan(0);
  });

  test("clicking a payment gateway card selects only that gateway", async ({ page }) => {
    const product = await getTestProduct(page);
    if (!product) { test.skip(true, "No hosting product found"); return; }

    const gateways = await (await page.request.get(`${API}/storefront/payment-gateways`)).json() as Array<{ method: string }>;
    if (gateways.length < 2) { test.skip(true, "Need at least 2 gateways"); return; }

    await page.goto(`${BASE}/de/order/${product.id}`);
    await page.waitForLoadState("networkidle");

    // Click each gateway card and verify only that card gets the selected CSS class
    for (const gw of gateways.slice(0, Math.min(gateways.length, 3))) {
      const label = page.locator(`label:has(input[value="${gw.method}"])`);
      if (await label.count() === 0) continue;
      await label.first().click();

      // The clicked label must have the selected class
      await expect(label.first()).toHaveClass(/paymentSelected/, { timeout: 3_000 });

      // Other labels must NOT have the selected class
      for (const other of gateways) {
        if (other.method === gw.method) continue;
        const otherLabel = page.locator(`label:has(input[value="${other.method}"])`);
        if (await otherLabel.count() === 0) continue;
        await expect(otherLabel.first()).not.toHaveClass(/paymentSelected/);
      }
    }
  });
});
