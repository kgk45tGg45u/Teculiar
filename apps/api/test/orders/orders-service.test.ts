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
      customerSnapshot: customerSnapshot(),
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

  it("activates paid transfer orders with the submitted auth code", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_transfer",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [
        {
          ...domainItem("item_transfer", "transfer-test.com"),
          configuration: { domainAction: "transfer", transferAuthCode: "secret-code" }
        }
      ]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_transfer" }),
      createDomainRecord: async (input: { status: string }) => events.push(`domain-record:${input.status}`),
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
        register: async () => events.push("register"),
        transfer: async (request: { domain: string; authCode?: string }) => {
          events.push(`transfer:${request.domain}:${request.authCode}`);
          return { externalId: "rb_transfer", status: "QUEUED", metadata: { testApi: true } };
        }
      }
    };

    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_transfer", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_transfer:provisioning",
      "transfer:transfer-test.com:secret-code",
      "domain-record:PENDING",
      "item:item_transfer:active:rb_transfer",
      "order:complete"
    ]);
  });

  it("creates reseller customer/contact before registering a paid domain", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_contact",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [domainItem("item_domain", "contact-test.com")]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_domain" }),
      createDomainRecord: async () => events.push("domain-record"),
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
        register: async (request: { customerContact?: { email: string }; domain: string }) => {
          events.push(`register:${request.domain}:${request.customerContact?.email}`);
          return { externalId: "rb_123", status: "ACTIVE", metadata: { testApi: true } };
        }
      }
    };

    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_contact", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_domain:provisioning",
      "register:contact-test.com:buyer@example.com",
      "domain-record",
      "item:item_domain:active:rb_123",
      "order:complete"
    ]);
  });

  it("returns searched domain plus suggested TLD results", async () => {
    const orders = {
      listHomepageProducts: async () => [{ id: "prod_domain", type: "DOMAIN", prices: [{ amountCents: 999 }] }]
    };
    const domainPricing = {
      listSuggestedTlds: async () => ["com", "net"],
      priceFor: async (domain: string) => ({ amountCents: domain.endsWith(".com") ? 1200 : 900, source: "live", tld: domain.split(".").at(-1) })
    };
    const domainAvailability = {
      check: async (domain: string) => ({
        available: domain !== "brand.com",
        domain,
        source: "rdap",
        tld: domain.split(".").at(-1)
      })
    };
    const service = new OrdersService(orders as never, {} as never, {} as never, {} as never, domainPricing as never, domainAvailability as never);

    const result = await service.searchDomain("brand.de");

    assert.equal(result.domain, "brand.de");
    assert.deepEqual(
      result.suggestions.map((item) => `${item.domain}:${item.action}:${item.price.amountCents}`),
      ["brand.com:transfer:1200", "brand.net:register:900"]
    );
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

function customerSnapshot() {
  return {
    address: {
      city: "Berlin",
      line1: "Main Street 1",
      postalCode: "10115",
      state: "Berlin"
    },
    companyName: "Buyer GmbH",
    countryCode: "DE",
    email: "buyer@example.com",
    name: "Buyer Person",
    phone: "+49 30123456",
    vatId: "DE123"
  };
}
