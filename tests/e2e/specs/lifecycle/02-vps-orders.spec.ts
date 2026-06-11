/**
 * Category 1 — VPS orders. VPS provisions via the Hetzner module, which is a stub
 * in this platform (apps/api hetzner-provider.service.ts): no real server is created
 * and the service settles at PROVISIONING. We assert invoice PAID + the VPS service
 * exists, and exercise the domain scenarios by composing a VPS item with a domain item.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { env } from "../../config/env";
import { vpsOrder } from "../../flows/checkout.flow";
import { OrderFactory } from "../../factories/order.factory";
import { CustomerFactory } from "../../factories/customer.factory";
import { DomainFactory } from "../../factories/domain.factory";
import { matchVpsService, findDomainRecord } from "../../helpers/records";

test.describe("Category 1 — VPS orders", () => {
  test.skip(({ catalog }) => !catalog.vps, "No active VPS product in catalogue");

  test("VPS only, new customer → invoice PAID, VPS service present", async ({ checkoutDeps }) => {
    const result = await vpsOrder(checkoutDeps, { buyer: { kind: "new" } });
    expect(result.paidInvoice.status).toBe("PAID");
    const services = await result.clientApi.listServices(true);
    const vps = matchVpsService(services);
    expect(vps, "VPS service should exist").toBeTruthy();
    // Hetzner is a stub — VPS never auto-activates; it must not be FAILED either.
    expect(["PENDING", "PROVISIONING", "ACTIVE"]).toContain(vps?.status);
  });

  test("VPS only, existing customer → service appears in dashboard", async ({ clientApi, catalog }) => {
    const customer = CustomerFactory.build({ email: env.client.email });
    const items = OrderFactory.vps({ vpsProduct: catalog.vps! });
    const checkout = await clientApi.checkout(items, CustomerFactory.toCheckoutCustomer(customer));
    const pay = await clientApi.payOrder(checkout.order.id, "CREDIT_CARD", "sandbox");
    expect(pay.invoice.status).toBe("PAID");
    expect(matchVpsService(await clientApi.listServices(true))).toBeTruthy();
  });

  for (const action of ["register", "transfer"] as const) {
    test(`VPS + ${action} domain, existing customer → both items ordered`, async ({ clientApi, catalog }) => {
      const customer = CustomerFactory.build({ email: env.client.email });
      const domain = DomainFactory.build(action);
      const items = [
        ...OrderFactory.vps({ vpsProduct: catalog.vps! }),
        ...OrderFactory.domainOnly({ domainProduct: catalog.domain, domain })
      ];
      const checkout = await clientApi.checkout(items, CustomerFactory.toCheckoutCustomer(customer));
      const pay = await clientApi.payOrder(checkout.order.id, "CREDIT_CARD", "sandbox");
      expect(pay.invoice.status).toBe("PAID");

      const services = await clientApi.listServices(true);
      expect(matchVpsService(services), "VPS service should exist").toBeTruthy();
      expect(findDomainRecord(services, domain.name), `domain record for ${domain.name} should exist`).toBeTruthy();
    });
  }
});
