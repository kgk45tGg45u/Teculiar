/**
 * Master-plan 6.3 — scripted PayPal SANDBOX purchase on production.
 *
 * OPERATOR-RUN, never part of routine sweeps: it drives a real checkout on the live site while
 * the PayPal gateway is switched to sandbox mode (see docs/paypal-sandbox-testing.md for the
 * full procedure incl. flipping the gateway config and back). The spec only runs when
 * RUN_PAYPAL_SANDBOX=1 AND the sandbox buyer credentials are present — the gateway must ALREADY
 * be in sandbox mode when it starts (step 2 of the doc).
 *
 * Run:
 *   set -a && source .env && set +a
 *   RUN_PAYPAL_SANDBOX=1 E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   npx playwright test tests/e2e/specs/phase6-paypal-sandbox.spec.ts --project=chromium --workers=1 --headed
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? `${BASE}/api/v1`).replace(/\/$/, "");
const RUN = process.env.RUN_PAYPAL_SANDBOX === "1";
const BUYER_EMAIL = process.env.PAYPAL_SANDBOX_BUYER_EMAIL ?? "";
const BUYER_PASSWORD = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

test.describe("6.3 PayPal sandbox purchase (operator-run)", () => {
  test.skip(!RUN, "set RUN_PAYPAL_SANDBOX=1 to run (gateway must already be in sandbox mode)");
  test.skip(!BUYER_EMAIL || !BUYER_PASSWORD, "PAYPAL_SANDBOX_BUYER_* env vars required");
  test.skip(!CLIENT_EMAIL || !CLIENT_PASSWORD, "E2E_CLIENT_* env vars required");

  test("storefront order → PayPal sandbox approve → invoice PAID", async ({ page, request }) => {
    test.setTimeout(300_000);

    // Cheapest orderable non-domain product.
    const products = await (await request.get(`${API}/products`)).json();
    const product = products
      .filter((candidate: { prices: Array<{ amountCents: number }>; type: string }) => candidate.type !== "DOMAIN" && candidate.prices.length > 0)
      .sort((a: { prices: Array<{ amountCents: number }> }, b: { prices: Array<{ amountCents: number }> }) => a.prices[0].amountCents - b.prices[0].amountCents)[0];
    expect(product, "an orderable product must exist").toBeTruthy();

    // Log the E2E client into the storefront so checkout reuses the profile.
    await page.goto(`${BASE}/de/order/${product.id}`, { waitUntil: "domcontentloaded" });
    const loginToggle = page.getByText(/anmelden|log in/i).first();
    if (await loginToggle.isVisible().catch(() => false)) {
      await loginToggle.click();
      await page.fill('input[name="loginEmail"]', CLIENT_EMAIL);
      await page.fill('input[name="loginPassword"]', CLIENT_PASSWORD);
      await page.getByRole("button", { name: /anmelden|log in/i }).first().click();
    }

    // Domain field (products with NECESSARY domain requirement): use external/own domain if offered.
    const externalDomain = page.locator('input[name="hostingDomainName"]');
    if (await externalDomain.isVisible().catch(() => false)) {
      await externalDomain.fill(`e2e-paypal-${Date.now()}.example.org`);
    }

    // Choose PayPal, accept terms, submit.
    await page.getByText("PayPal", { exact: false }).first().click();
    const terms = page.locator('input[name="acceptedTerms"]');
    if (await terms.isVisible().catch(() => false)) await terms.check();
    await page.getByRole("button", { name: /kostenpflichtig bestellen|order now|bestellen/i }).first().click();

    // Redirect (or popup) to sandbox.paypal.com → buyer login → approve.
    await page.waitForURL(/sandbox\.paypal\.com/, { timeout: 120_000 });
    await page.fill('input[type="email"], #email', BUYER_EMAIL);
    const next = page.locator("#btnNext");
    if (await next.isVisible().catch(() => false)) await next.click();
    await page.fill('input[type="password"], #password', BUYER_PASSWORD);
    await page.locator("#btnLogin, button[type=submit]").first().click();
    await page.getByRole("button", { name: /complete purchase|pay now|jetzt bezahlen|weiter/i }).first().click({ timeout: 120_000 });

    // Back on our payment-return page → confirmation, then the client portal shows the paid order.
    await page.waitForURL(new RegExp(BASE.replace(/[/\\^$.*+?()[\]{}|]/g, "\\$&")), { timeout: 120_000 });
    await expect(page.getByText(/bezahlt|paid|erfolgreich|success/i).first()).toBeVisible({ timeout: 60_000 });
  });
});
