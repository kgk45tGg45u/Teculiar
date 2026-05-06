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
      markOrderInProgress: async () => events.push("order:in-progress"),
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
        provision: async () => {
          events.push("virtualmin");
          return { externalId: "vm_123", status: "ACTIVE", metadata: { panel: "virtualmin" } };
        }
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
      "item:item_hosting:provisioning",
      "virtualmin",
      "item:item_hosting:active:vm_123",
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
      markOrderInProgress: async () => events.push("order:in-progress"),
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
      "order:in-progress"
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

  it("keeps .de domains manual and does not call Resell.biz", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_de",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [domainItem("item_de", "example.de")]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_de" }),
      createDomainRecord: async (input: { domain: string; status: string; raw?: { manual?: boolean } }) =>
        events.push(`domain-record:${input.domain}:${input.status}:${input.raw?.manual}`),
      markItemProvisioning: async (id: string) => events.push(`item:${id}:provisioning`),
      markItemActive: async (id: string, providerReference?: string) =>
        events.push(`item:${id}:active:${providerReference ?? "none"}`),
      markItemFailed: async (id: string, message: string) => events.push(`item:${id}:failed:${message}`),
      markItemSkipped: async (id: string, message: string) => events.push(`item:${id}:skipped:${message}`),
      markOrderComplete: async () => events.push("order:complete"),
      markOrderInProgress: async () => events.push("order:in-progress"),
      markOrderFailed: async () => events.push("order:failed")
    };
    const billing = {
      payInvoice: async () => ({ status: "PAID" }),
      createSubscription: async () => ({ id: "sub_1" })
    };
    const external = {
      resellBiz: {
        register: async () => events.push("resellbiz")
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_de", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_de:provisioning",
      "domain-record:example.de:PENDING:true",
      "item:item_de:skipped:Manual .de registration required",
      "order:in-progress"
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

  it("uses the active domain product even when it is not homepage visible", async () => {
    const orders = {
      findProductByType: async (type: string) =>
        type === "DOMAIN" ? { id: "prod_domain_hidden", type: "DOMAIN", prices: [{ amountCents: 1000 }] } : undefined,
      listHomepageProducts: async () => []
    };
    const domainPricing = {
      listSuggestedTlds: async () => [],
      priceFor: async () => ({ amountCents: 1200, source: "live", tld: "com" })
    };
    const domainAvailability = {
      check: async (domain: string) => ({ available: true, domain, source: "rdap", tld: "com" })
    };
    const service = new OrdersService(orders as never, {} as never, {} as never, {} as never, domainPricing as never, domainAvailability as never);

    const result = await service.searchDomain("brand.com");

    assert.equal(result.productId, "prod_domain_hidden");
  });

  it("uses domain price rows instead of admin product prices", async () => {
    const orders = {
      findProduct: async () => product("prod_domain", "DOMAIN", 999, "YEAR_1")
    };
    const domainPricing = {
      priceFor: async (_domain: string, _fallback: number, action: string, years: number) => ({
        amountCents: years === 2 ? 2400 : 1200,
        source: "live",
        tld: "com",
        action
      })
    };
    const service = new OrdersService(orders as never, { vatPercent: async () => 0 } as never, {} as never, {} as never, domainPricing as never);

    const preview = await service.previewOrder({
      items: [{ domainName: "priced-example.com", productId: "prod_domain", productPriceId: "price_prod_domain", quantity: 1 }]
    });

    assert.equal(preview.items[0]?.unitAmountCents, 1200);
    assert.equal(preview.taxAmountCents, 0);
    assert.equal(preview.totalCents, 1200);
  });

  it("uses admin VAT setting for order preview", async () => {
    const orders = {
      findProduct: async () => product("prod_hosting", "SHARED_HOSTING", 1000, "MONTHLY")
    };
    const service = new OrdersService(orders as never, { vatPercent: async () => 20 } as never, {} as never, {} as never, {} as never);

    const preview = await service.previewOrder({
      items: [{ productId: "prod_hosting", quantity: 1 }]
    });

    assert.equal(preview.subtotalCents, 1000);
    assert.equal(preview.taxAmountCents, 200);
    assert.equal(preview.totalCents, 1200);
  });

  it("discounts cheap domains when annual hosting is in the same order", async () => {
    const orders = {
      findProduct: async (id: string) => (id === "prod_domain" ? product("prod_domain", "DOMAIN", 1200, "YEAR_1") : product("prod_hosting", "SHARED_HOSTING", 9900, "YEAR_1"))
    };
    const domainPricing = {
      priceFor: async () => ({ amountCents: 1200, source: "live", tld: "com" })
    };
    const service = new OrdersService(orders as never, { vatPercent: async () => 0 } as never, {} as never, {} as never, domainPricing as never);

    const preview = await service.previewOrder({
      items: [
        { domainName: "free-domain.com", productId: "prod_domain", quantity: 1 },
        { configuration: { domainName: "free-domain.com" }, productId: "prod_hosting", quantity: 1 }
      ]
    });

    const domain = preview.items.find((item) => item.type === "DOMAIN");
    assert.equal(domain?.unitAmountCents, 0);
    assert.equal(domain?.configuration.freeDomainApplied, true);
  });

  it("does not fail the paid order when Resell.biz registration fails", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_failed_domain",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [domainItem("item_domain", "broken-test.com")]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_domain" }),
      createDomainRecord: async () => events.push("domain-record"),
      markItemProvisioning: async (id: string) => events.push(`item:${id}:provisioning`),
      markItemActive: async () => events.push("item:active"),
      markItemFailed: async (id: string, message: string) => events.push(`item:${id}:failed:${message}`),
      markOrderComplete: async () => events.push("order:complete"),
      markOrderInProgress: async () => events.push("order:in-progress"),
      markOrderFailed: async () => events.push("order:failed")
    };
    const billing = {
      payInvoice: async () => ({ status: "PAID" }),
      createSubscription: async () => ({ id: "sub_1" })
    };
    const external = {
      resellBiz: {
        register: async () => ({ externalId: "rb_failed", status: "FAILED", metadata: { reason: "test" } })
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_failed_domain", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_domain:provisioning",
      "domain-record",
      "item:item_domain:failed:ResellBiz domain registration failed",
      "order:in-progress"
    ]);
  });

  it("provisions shared hosting through Virtualmin using the selected domain", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_hosting",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [{ ...serviceItem("item_hosting", "SHARED_HOSTING"), configuration: { domainName: "hosted-example.com" } }]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_hosting" }),
      markItemActive: async (id: string, providerReference?: string) => events.push(`item:${id}:active:${providerReference}`),
      markItemFailed: async (id: string, message: string) => events.push(`item:${id}:failed:${message}`),
      markItemProvisioning: async (id: string) => events.push(`item:${id}:provisioning`),
      markOrderComplete: async () => events.push("order:complete"),
      markOrderFailed: async () => events.push("order:failed")
    };
    const billing = {
      payInvoice: async () => ({ status: "PAID" }),
      createSubscription: async () => ({ id: "sub_1" })
    };
    const external = {
      virtualmin: {
        provision: async (request: { options: { domainName?: string } }) => {
          events.push(`virtualmin:${request.options.domainName}`);
          return { externalId: "vm_123", status: "ACTIVE", metadata: { panel: "virtualmin" } };
        }
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_hosting", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_hosting:provisioning",
      "virtualmin:hosted-example.com",
      "item:item_hosting:active:vm_123",
      "order:complete"
    ]);
  });

  it("uses one hosting service for a bundled hosting plus domain order", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_bundle",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [
        domainItem("item_domain", "bundle-example.com"),
        { ...serviceItem("item_hosting", "SHARED_HOSTING"), configuration: { bundledDomain: true, domainName: "bundle-example.com" } }
      ]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async (item: { id: string; type: string }) => {
        events.push(`service:${item.id}:${item.type}`);
        return { id: `svc_${item.id}` };
      },
      createDomainRecord: async (input: { serviceId: string }) => events.push(`domain-record:${input.serviceId}`),
      markItemProvisioning: async (id: string) => events.push(`item:${id}:provisioning`),
      markItemActive: async (id: string, providerReference?: string) => events.push(`item:${id}:active:${providerReference ?? "none"}`),
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
        register: async () => ({ externalId: "rb_123", status: "ACTIVE", metadata: {} })
      },
      virtualmin: {
        provision: async () => ({ externalId: "vm_123", status: "ACTIVE", metadata: {} })
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_bundle", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "service:item_hosting:SHARED_HOSTING",
      "item:item_hosting:provisioning",
      "item:item_hosting:active:vm_123",
      "item:item_domain:provisioning",
      "domain-record:svc_item_hosting",
      "item:item_domain:active:rb_123",
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

function product(id: string, type: string, amountCents: number, billingCycle: string) {
  return {
    id,
    name: id,
    prices: [{ amountCents, billingCycle, id: `price_${id}`, setupFeeCents: 0 }],
    type
  };
}
