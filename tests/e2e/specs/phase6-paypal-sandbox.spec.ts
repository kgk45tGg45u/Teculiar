/**
 * Master-plan 6.3 — scripted PayPal SANDBOX purchase on production.
 *
 * OPERATOR-RUN, never part of routine sweeps: it drives a real checkout on the live target site
 * while the PayPal gateway is switched to sandbox mode (see docs/paypal-sandbox-testing.md for
 * the surrounding procedure — flipping the gateway to the PAYPAL_SANDBOX_* credentials before,
 * and back to live after). Gate: RUN_PAYPAL_SANDBOX=1 + sandbox buyer credentials.
 *
 * Buyer account on the shop: uses E2E_CLIENT_* when set; otherwise registers a fresh
 * e2e-paypal-<ts>@… account through checkout (the account is materialized on payment).
 * After the sandbox approval the spec confirms the invoice is settled AND polls the client's
 * services until one is ACTIVE — "the customer sees an active service".
 *
 * Run (teculiar.com example):
 *   set -a && source .env && set +a
 *   RUN_PAYPAL_SANDBOX=1 E2E_BASE_URL=https://teculiar.com E2E_API_URL=https://teculiar.com/api/v1 \
 *   npx playwright test tests/e2e/specs/phase6-paypal-sandbox.spec.ts --project=chromium --workers=1
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? `${BASE}/api/v1`).replace(/\/$/, "");
const RUN = process.env.RUN_PAYPAL_SANDBOX === "1";
const BUYER_EMAIL = process.env.PAYPAL_SANDBOX_BUYER_EMAIL ?? "";
const BUYER_PASSWORD = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

const FRESH_EMAIL = `e2e-paypal-${Date.now()}@e2e.dezhost.com`;
const FRESH_PASSWORD = `Pp!${Date.now().toString(36)}Aa1?x`;

async function approveInPayPalSandbox(page: Page) {
  await page.waitForURL(/sandbox\.paypal\.com/, { timeout: 120_000 });
  const email = page.locator("#email, input[type=email]").first();
  await email.waitFor({ state: "visible", timeout: 60_000 });
  await email.fill(BUYER_EMAIL);
  // Two-step login: Next reveals the password field, then the explicit #btnLogin (never the
  // generic type=submit — the hidden #btnNext also matches that).
  const next = page.locator("#btnNext");
  if (await next.isVisible().catch(() => false)) await next.click();
  const password = page.locator("#password, input[type=password]").first();
  await password.waitFor({ state: "visible", timeout: 60_000 });
  await password.fill(BUYER_PASSWORD);
  await page.locator("#btnLogin").click();
  const pay = page
    .locator("#payment-submit-btn, [data-testid='submit-button-initial'], button:has-text('Complete Purchase'), button:has-text('Pay Now'), button:has-text('Jetzt bezahlen'), button:has-text('Weiter zur Überprüfung'), button:has-text('Zustimmen und weiter')")
    .first();
  await pay.waitFor({ state: "visible", timeout: 120_000 });
  await pay.click();
}

async function clientToken(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (!response.ok()) return undefined;
  return (await response.json()).accessToken as string | undefined;
}

test.describe("6.3 PayPal sandbox purchase (operator-run)", () => {
  test.skip(!RUN, "set RUN_PAYPAL_SANDBOX=1 to run (gateway must already be in sandbox mode)");
  test.skip(!BUYER_EMAIL || !BUYER_PASSWORD, "PAYPAL_SANDBOX_BUYER_* env vars required");

  test("storefront order → PayPal sandbox approve → invoice PAID → service ACTIVE for the customer", async ({ page, request }) => {
    test.setTimeout(900_000);

    // Cheapest orderable non-domain product; prefer one without a domain requirement.
    const products = (await (await request.get(`${API}/products`)).json()) as Array<{
      domainRequirement?: string; id: string; name: string; prices: Array<{ amountCents: number; id: string }>; type: string;
    }>;
    const orderable = products
      .filter((candidate) => candidate.type !== "DOMAIN" && candidate.prices.length > 0)
      .sort((a, b) => a.prices[0].amountCents - b.prices[0].amountCents);
    const product = orderable.find((candidate) => (candidate.domainRequirement ?? "NOT_NEEDED") === "NOT_NEEDED") ?? orderable[0];
    expect(product, "an orderable product must exist").toBeTruthy();

    const useExistingClient = Boolean(CLIENT_EMAIL && CLIENT_PASSWORD);
    const shopEmail = useExistingClient ? CLIENT_EMAIL : FRESH_EMAIL;
    const shopPassword = useExistingClient ? CLIENT_PASSWORD : FRESH_PASSWORD;

    await page.goto(`${BASE}/de/order/${product.id}`, { waitUntil: "domcontentloaded" });
    // Cookie banner overlays the submit button; hydration also resets fields filled too early.
    const cookieAccept = page.getByRole("button", { name: /akzeptieren|accept/i }).first();
    if (await cookieAccept.isVisible().catch(() => false)) await cookieAccept.click();
    await page.waitForLoadState("networkidle").catch(() => undefined);

    if (useExistingClient) {
      const loginToggle = page.getByText(/anmelden|log in|einloggen/i).first();
      if (await loginToggle.isVisible().catch(() => false)) {
        await loginToggle.click();
        await page.fill('input[name="loginEmail"]', shopEmail);
        await page.fill('input[name="loginPassword"]', shopPassword);
        await page.getByRole("button", { name: /anmelden|log in/i }).first().click();
        await page.waitForTimeout(2000);
      }
    } else {
      // Fresh customer: fill the registration side of checkout.
      await page.fill('input[name="name"]', "E2E PayPal Buyer");
      await page.fill('input[name="email"]', shopEmail);
      await page.fill('input[name="password"]', shopPassword);
      await page.fill('input[name="phone"]', "15112345678");
      await page.fill('input[name="address"]', "Teststraße 1");
      await page.fill('input[name="postalCode"]', "10115");
      await page.fill('input[name="city"]', "Berlin");
      const state = page.locator('input[name="state"]');
      if (await state.isVisible().catch(() => false)) await state.fill("Berlin");
      const country = page.locator('select[name="countryCode"]');
      if (await country.isVisible().catch(() => false)) await country.selectOption("DE");
    }

    // Domain field only when the product requires one.
    const externalDomain = page.locator('input[name="hostingDomainName"]');
    if (await externalDomain.isVisible().catch(() => false)) {
      await externalDomain.fill(`e2e-paypal-${Date.now()}.example.org`);
    }

    // Choose PayPal, accept terms, submit. Re-assert the name field right before submitting —
    // a late hydration pass can reset the earliest fill.
    if (!useExistingClient) {
      await page.fill('input[name="name"]', "E2E PayPal Buyer");
      await expect(page.locator('input[name="name"]')).toHaveValue("E2E PayPal Buyer");
    }
    await page.getByText("PayPal", { exact: false }).first().click();
    const terms = page.locator('input[name="acceptedTerms"]');
    if (await terms.isVisible().catch(() => false)) await terms.check();
    await page.getByRole("button", { name: /kostenpflichtig bestellen|zahlungspflichtig|order now|jetzt kaufen|bestellen|buy now/i }).first().click();

    await approveInPayPalSandbox(page);

    // Back on our site (payment-return usually auto-forwards straight to the client dashboard,
    // so don't assert on transient page text — the API is the source of truth).
    await page.waitForURL((url) => url.href.startsWith(BASE), { timeout: 180_000 });

    // The customer's view: account materialized, the invoice is PAID, and a service reaches
    // ACTIVE (provisioning may take minutes — tecreator creates a whole tenant).
    const token = await clientToken(request, shopEmail, shopPassword);
    expect(token, "client login after payment (account materialized)").toBeTruthy();
    const authHeaders = { Authorization: `Bearer ${token}` };

    const invoices = (await (await request.get(`${API}/billing/invoices`, { headers: authHeaders })).json()) as Array<{ status: string }>;
    expect(invoices.some((invoice) => invoice.status === "PAID"), `expected a PAID invoice, saw [${invoices.map((invoice) => invoice.status).join(",")}]`).toBeTruthy();

    const deadline = Date.now() + 600_000;
    let lastStatuses = "";
    while (Date.now() < deadline) {
      const services = (await (await request.get(`${API}/services`, { headers: authHeaders })).json()) as Array<{ status: string }>;
      lastStatuses = services.map((service) => service.status).join(",");
      if (services.some((service) => service.status === "ACTIVE")) break;
      await page.waitForTimeout(15_000);
    }
    expect(lastStatuses, `expected an ACTIVE service, saw [${lastStatuses}]`).toMatch(/ACTIVE/);
  });
});
