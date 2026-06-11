/**
 * Category 3 — Domain-only orders. Register and transfer via the Resell.biz TEST API
 * (test.httpapi.com). We assert order + invoice creation, payment, domain visibility,
 * a valid domain status, and that the system-wide duplicate-domain rule is enforced.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { env } from "../../config/env";
import { domainOnlyOrder, type Buyer } from "../../flows/checkout.flow";
import { OrderFactory } from "../../factories/order.factory";
import { CustomerFactory } from "../../factories/customer.factory";
import { findDomainRecord, matchDomainService } from "../../helpers/records";

const DOMAIN_STATUSES = ["PENDING", "PENDING_TRANSFER", "ACTIVE", "TRANSFERRING", "EXPIRED", "LOCKED", "SUSPENDED", "CANCELLED", "FAILED"];

test.describe("Category 3 — Domain-only orders", () => {
  test("register domain (new customer): order + invoice PAID, domain visible with a valid status", async ({ checkoutDeps }) => {
    const result = await domainOnlyOrder(checkoutDeps, { buyer: { kind: "new" }, action: "register" });

    expect(result.checkout.invoice.id, "invoice should be created").toBeTruthy();
    expect(result.orderId, "order should be created").toBeTruthy();
    expect(result.paidInvoice.status).toBe("PAID");

    const services = await result.clientApi.listServices(true);
    expect(matchDomainService(services, result.domain.name), "domain service should be visible").toBeTruthy();
    const record = findDomainRecord(services, result.domain.name);
    expect(record, "domain record should exist").toBeTruthy();
    expect(DOMAIN_STATUSES).toContain(record!.status);
  });

  test("transfer domain (existing customer): order + invoice PAID, domain record present", async ({ checkoutDeps, clientApi }) => {
    const buyer: Buyer = { kind: "existing", api: clientApi, email: env.client.email };
    const result = await domainOnlyOrder(checkoutDeps, { buyer, action: "transfer" });
    expect(result.paidInvoice.status).toBe("PAID");

    const record = findDomainRecord(await clientApi.listServices(true), result.domain.name);
    expect(record, "transferred domain record should exist").toBeTruthy();
    expect(DOMAIN_STATUSES).toContain(record!.status);
  });

  test("duplicate domain registration is rejected system-wide", async ({ checkoutDeps, clientApi, catalog }) => {
    const buyer: Buyer = { kind: "existing", api: clientApi, email: env.client.email };
    const first = await domainOnlyOrder(checkoutDeps, { buyer, action: "register" });
    expect(first.paidInvoice.status).toBe("PAID");

    // A second active registration of the SAME name must be blocked (400) before payment.
    const items = OrderFactory.domainOnly({ domainProduct: catalog.domain, domain: first.domain });
    const customer = CustomerFactory.build({ email: env.client.email });
    const res = await clientApi.post<{ message?: string }>("/orders/checkout", { items, customer: CustomerFactory.toCheckoutCustomer(customer) });

    expect(res.status, "duplicate domain checkout should be rejected").toBe(400);
    expect(String(res.body.message ?? "")).toMatch(/already active/i);
  });
});
