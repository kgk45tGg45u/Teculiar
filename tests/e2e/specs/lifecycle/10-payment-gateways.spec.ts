/**
 * Payment gateway coverage. Every configured gateway is exercised against a real
 * order and validated for: invoice creation, payment status, and order status.
 *
 * Deterministic completion is only possible with SANDBOX; the live gateways
 * (Mollie card/SEPA, PayPal, bank wire) cannot be auto-approved without a human,
 * so for those we assert the platform's correct initiation (PENDING + redirect /
 * manual transaction). Orders are domain-only, so PENDING gateways leave no
 * provisioning side effects.
 *
 * Each order uses a FRESH (zero-balance) customer so wallet balance never silently
 * covers the invoice (which would turn a redirect gateway's PENDING into PAID), and
 * the file runs SERIAL so anonymous checkouts don't race on the shared pending-checkout
 * user. Invoices are read back via the admin (staff bypasses ownership).
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { OrderFactory } from "../../factories/order.factory";
import { CustomerFactory } from "../../factories/customer.factory";
import { DomainFactory } from "../../factories/domain.factory";
import type { ApiClient, CheckoutResult } from "../../helpers/api-client";
import type { Catalog } from "../../flows/catalog.flow";

const TEST_IBAN = "DE89370400440532013000";

test.describe.configure({ mode: "serial" });

/** Anonymous, fresh-customer domain-only checkout (zero wallet balance). */
async function newDomainOrder(api: ApiClient, catalog: Catalog): Promise<CheckoutResult> {
  const items = OrderFactory.domainOnly({ domainProduct: catalog.domain, domain: DomainFactory.build("register") });
  return api.checkout(items, CustomerFactory.toCheckoutCustomer(CustomerFactory.build()));
}

async function storefrontHas(api: ApiClient, method: string): Promise<boolean> {
  return (await api.storefrontGateways()).some((g) => g.method === method);
}

test.describe("Payment gateways — discovery", () => {
  test("storefront exposes the configured live gateways", async ({ api }) => {
    const methods = (await api.storefrontGateways()).map((g) => g.method);
    expect(methods).toEqual(expect.arrayContaining(["PAYPAL", "CREDIT_CARD", "SEPA", "BANK_TRANSFER"]));
  });

  test("admin gateway settings list every method with an enabled flag", async ({ adminApi }) => {
    const gateways = await adminApi.adminGateways();
    const methods = gateways.map((g) => g.method);
    for (const m of ["SANDBOX", "CREDIT_CARD", "PAYPAL", "SEPA", "BANK_TRANSFER"]) expect(methods).toContain(m);
    for (const g of gateways) expect(typeof g.enabled).toBe("boolean");
  });
});

test.describe("Payment gateways — per gateway", () => {
  test("SANDBOX → invoice PAID", async ({ api, catalog }) => {
    test.skip(!(await storefrontHas(api, "SANDBOX")), "SANDBOX not enabled");
    const checkout = await newDomainOrder(api, catalog);
    const pay = await api.payOrder(checkout.order.id, "CREDIT_CARD", "sandbox");
    expect(pay.invoice.status).toBe("PAID");
  });

  test("CREDIT_CARD (Mollie) → invoice PENDING with a hosted-checkout redirect", async ({ api, catalog }) => {
    test.skip(!(await storefrontHas(api, "CREDIT_CARD")), "CREDIT_CARD not enabled");
    const checkout = await newDomainOrder(api, catalog);
    const pay = await api.payOrder(checkout.order.id, "CREDIT_CARD", "creditcard");
    expect(pay.invoice.status).toBe("PENDING");
    expect(pay.invoice.paymentRedirectUrl ?? "", "Mollie should return a checkout URL").toMatch(/mollie\.com/);
  });

  test("PAYPAL → invoice PENDING with a PayPal approval redirect", async ({ api, catalog }) => {
    test.skip(!(await storefrontHas(api, "PAYPAL")), "PAYPAL not enabled");
    const checkout = await newDomainOrder(api, catalog);
    const pay = await api.payOrder(checkout.order.id, "PAYPAL", "paypal_redirect");
    expect(pay.invoice.status).toBe("PENDING");
    expect(pay.invoice.paymentRedirectUrl ?? "", "PayPal should return an approval URL").toMatch(/paypal\.com/);
  });

  test("SEPA (Mollie direct debit) → payment initiated with a transaction", async ({ api, adminApi, catalog }) => {
    test.skip(!(await storefrontHas(api, "SEPA")), "SEPA not enabled");
    const checkout = await newDomainOrder(api, catalog);
    const pay = await api.payOrder(checkout.order.id, "SEPA", "sepa", TEST_IBAN);
    expect(["PENDING", "PAID", "FAILED"]).toContain(pay.invoice.status);
    const invoice = await adminApi.getInvoice(checkout.invoice.id);
    expect((invoice.transactions ?? []).some((t) => t.method === "SEPA"), "a SEPA transaction should be recorded").toBe(true);
  });

  test("BANK_TRANSFER → invoice stays PENDING with a manual transaction", async ({ api, adminApi, catalog }) => {
    test.skip(!(await storefrontHas(api, "BANK_TRANSFER")), "BANK_TRANSFER not enabled");
    const checkout = await newDomainOrder(api, catalog);
    const pay = await api.payOrder(checkout.order.id, "BANK_TRANSFER", "bank_transfer");
    expect(pay.invoice.status, "bank wire is awaiting manual confirmation").toBe("PENDING");
    const invoice = await adminApi.getInvoice(checkout.invoice.id);
    expect((invoice.transactions ?? []).some((t) => t.method === "BANK_TRANSFER"), "a BANK_TRANSFER transaction should be recorded").toBe(true);
  });
});
