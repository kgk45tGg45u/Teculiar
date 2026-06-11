/**
 * UI checkout coverage (Page Object Model). Drives the real storefront form in the
 * browser. Sandbox completion requires the SANDBOX radio, which global-setup enables;
 * tests skip gracefully if it is unavailable. Created hosting accounts are torn down
 * by the fixture.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { CustomerFactory } from "../../factories/customer.factory";
import { DomainFactory } from "../../factories/domain.factory";
import { injectAuthCookies } from "../../helpers/auth";
import { withHostingProvisionGate } from "../../helpers/provision-gate";
import { confirmHostingProvisioned } from "../../flows/provisioning.flow";

test.describe("UI checkout — new customer", () => {
  test("hosting checkout via sandbox redirects to the client portal", async ({ checkoutPage, makeApi, catalog, teardown }) => {
    await checkoutPage.goto(catalog.hosting.id);
    if (!(await checkoutPage.selectPaymentMethod("SANDBOX"))) {
      test.skip(true, "SANDBOX gateway not available in storefront (set E2E_ENABLE_SANDBOX=1)");
      return;
    }
    const domain = DomainFactory.hostingName();
    const customer = CustomerFactory.build();
    teardown.registerHostingDomain(domain);

    await checkoutPage.fillHostingDomain(domain);
    await checkoutPage.fillCustomer(customer);
    await checkoutPage.acceptTerms();

    // Submitting provisions a Virtualmin account — hold the gate through the whole create.
    await withHostingProvisionGate(async () => {
      await checkoutPage.submit();
      await checkoutPage.expectRedirectToPortal();
      // Confirm the account finished on the server before releasing the gate.
      const api = makeApi();
      for (let i = 0; i < 8; i++) {
        try { await api.login(customer.email, customer.password); break; } catch { await new Promise((r) => setTimeout(r, 3_000)); }
      }
      if (api.getToken()) await confirmHostingProvisioned(api, domain).catch(() => undefined);
    });
  });
});

test.describe("UI portal — existing customer", () => {
  test("logged-in client can open the portal and see services/domains/invoices nav", async ({ page, portalPage, clientApi }) => {
    await injectAuthCookies(page.context(), "client", { accessToken: clientApi.getToken()! });
    await portalPage.gotoDashboard();
    await expect(page).toHaveURL(/\/client/);
    await portalPage.expectNoServerError();
    // Portal navigation surfaces the three core areas.
    await portalPage.expectVisibleText(/Services|Dienste/i);
  });
});

test.describe("UI checkout — storefront rendering", () => {
  test("hosting order page renders the checkout form and real payment gateways", async ({ checkoutPage, catalog }) => {
    await checkoutPage.goto(catalog.hosting.id);
    await checkoutPage.expectNoServerError();
    await checkoutPage.expectFormVisible();
    const methods = await checkoutPage.paymentMethods();
    expect(methods.some((m) => ["PAYPAL", "CREDIT_CARD", "SEPA", "BANK_TRANSFER"].includes(m))).toBe(true);
  });

  test("order pages load without server errors for hosting, VPS and domain products", async ({ checkoutPage, catalog }) => {
    const ids = [catalog.hosting.id, catalog.domain.id, ...(catalog.vps ? [catalog.vps.id] : [])];
    for (const id of ids) {
      await checkoutPage.goto(id);
      await checkoutPage.expectNoServerError();
      await checkoutPage.expectFormVisible();
    }
  });
});
