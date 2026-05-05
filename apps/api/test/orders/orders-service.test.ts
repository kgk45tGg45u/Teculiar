import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrdersService } from "../../src/modules/orders/orders.service";

describe("OrdersService", () => {
  it("activates paid orders, registers domains, and skips hosting/VPS provider calls", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_1",
      userId: "user_1",
      invoiceId: "inv_1",
      items: [
        domainItem("item_domain", "example-test.com"),
        serviceItem("item_hosting", "SHARED_HOSTING"),
        serviceItem("item_vps", "VPS")
      ]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async (item: { id: string; type: string; domainName?: string }) => {
        events.push(`service:${item.type}`);
        return { id: `svc_${item.id}` };
      },
      createDomainRecord: async (_input: unknown) => events.push("domain-record"),
      markItemProvisioning: async (id: string) => events.push(`item:${id}:provisioning`),
      markItemActive: async (id: string, providerReference?: string) =>
        events.push(`item:${id}:active:${providerReference ?? "none"}`),
      markItemFailed: async (id: string, message: string) => events.push(`item:${id}:failed:${message}`),
      markOrderComplete: async () => events.push("order:complete"),
      markOrderFailed: async () => events.push("order:failed")
    };
    const billing = {
      payInvoice: async () => ({ status: "PAID" }),
      createSubscription: async () => ({ id: "sub_1" })
    };
    const external = {
      resellBiz: {
        register: async (request: { domain: string }) => {
          events.push(`resellbiz:${request.domain}`);
          return { externalId: "rb_123", status: "ACTIVE", metadata: { testApi: true } };
        }
      },
      virtualmin: {
        provision: async () => events.push("virtualmin")
      },
      hetzner: {
        provision: async () => events.push("hetzner")
      }
    };

    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_1", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "service:DOMAIN",
      "item:item_domain:provisioning",
      "resellbiz:example-test.com",
      "domain-record",
      "item:item_domain:active:rb_123",
      "service:SHARED_HOSTING",
      "item:item_hosting:active:none",
      "service:VPS",
      "item:item_vps:active:none",
      "order:complete"
    ]);
  });
});

function domainItem(id: string, domainName: string) {
  return {
    id,
    billingCycle: "YEAR_1",
    configuration: {},
    description: domainName,
    domainName,
    productId: "prod_domain",
    productPriceId: "price_domain",
    type: "DOMAIN"
  };
}

function serviceItem(id: string, type: string) {
  return {
    id,
    billingCycle: "MONTHLY",
    configuration: {},
    description: type,
    domainName: null,
    productId: `prod_${type.toLowerCase()}`,
    productPriceId: `price_${type.toLowerCase()}`,
    type
  };
}
