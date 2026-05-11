import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hash } from "bcryptjs";
import { OrdersService } from "../../src/modules/orders/orders.service";

describe("OrdersService", () => {
  it("activates paid orders, registers domains, and queues hosting provider calls", async () => {
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
        provision: async () => new Promise(() => undefined)
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
      "service:VPS",
      "item:item_vps:active:none",
      "order:in-progress"
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
        register: async (request: { customerContact?: { email: string; phone: string; phoneCountryCode: string }; domain: string }) => {
          events.push(`register:${request.domain}:${request.customerContact?.email}:${request.customerContact?.phoneCountryCode}:${request.customerContact?.phone}`);
          return { externalId: "rb_123", status: "ACTIVE", metadata: { testApi: true } };
        }
      }
    };

    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_contact", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_domain:provisioning",
      "register:contact-test.com:buyer@example.com:49:30123456",
      "domain-record",
      "item:item_domain:active:rb_123",
      "order:complete"
    ]);
  });

  it("sends state as required domain contact data", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_contact_state",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [domainItem("item_domain", "state-test.com")]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_domain" }),
      createDomainRecord: async () => events.push("domain-record"),
      markItemProvisioning: async () => events.push("item:provisioning"),
      markItemActive: async () => events.push("item:active"),
      markItemFailed: async (_id: string, message: string) => events.push(`item:failed:${message}`),
      markOrderComplete: async () => events.push("order:complete")
    };
    const billing = {
      payInvoice: async () => ({ status: "PAID" }),
      createSubscription: async () => ({ id: "sub_1" })
    };
    const external = {
      resellBiz: {
        register: async (request: { customerContact?: { state?: string } }) => {
          events.push(`state:${request.customerContact?.state}`);
          return { externalId: "rb_123", status: "ACTIVE", metadata: {} };
        }
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_contact_state", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, ["order:paid", "item:provisioning", "state:Berlin", "domain-record", "item:active", "order:complete"]);
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

  it("can price a domain from TLD prices when the product has no active price", async () => {
    const orders = {
      findDomainProductPrice: async (_productId: string, billingCycle: string) => ({
        amountCents: 0,
        billingCycle,
        id: "price_domain_year_1",
        setupFeeCents: 0
      }),
      findProduct: async () => ({
        id: "prod_domain",
        name: "Domains",
        prices: [],
        type: "DOMAIN"
      })
    };
    const domainPricing = {
      priceFor: async (_domain: string, fallback: number, action: string, years: number) => ({
        amountCents: fallback + years + (action === "register" ? 1199 : 899),
        source: "live",
        tld: "com"
      })
    };
    const service = new OrdersService(orders as never, { vatPercent: async () => 0 } as never, {} as never, {} as never, domainPricing as never);

    const preview = await service.previewOrder({
      items: [{ domainName: "priced-example.com", productId: "prod_domain", quantity: 1 }]
    });

    assert.equal(preview.items[0]?.billingCycle, "YEAR_1");
    assert.equal(preview.items[0]?.productPriceId, "price_domain_year_1");
    assert.equal(preview.items[0]?.unitAmountCents, 1200);
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

  it("storefront checkout invoices monthly hosting and annual domain billing cycles", async () => {
    const invoiceLines: Array<{ billingCycle?: string; type?: string; unitAmountCents: number }> = [];
    const orders = {
      createOrder: async (input: { items: Array<{ billingCycle: string; type: string }>; userId: string }) => ({
        id: "ord_storefront_cycles",
        items: input.items.map((item, index) => ({ ...item, id: `item_${index}` })),
        userId: input.userId
      }),
      createPendingEntitiesForOrder: async () => undefined,
      findProduct: async (id: string) =>
        id === "prod_domain"
          ? product("prod_domain", "DOMAIN", 1200, "YEAR_1")
          : product("prod_hosting", "SHARED_HOSTING", 999, "MONTHLY")
    };
    const billing = {
      createInvoice: async (input: { lines: typeof invoiceLines }) => {
        invoiceLines.push(...input.lines);
        return { id: "inv_storefront_cycles", subtotalCents: 2199, taxAmountCents: 0, totalCents: 2199 };
      },
      vatPercent: async () => 0
    };
    const users = {
      createUser: async (input: { email: string }) => ({ email: input.email, id: "user_storefront_cycles" }),
      findByEmail: async () => null
    };
    const domainPricing = {
      priceFor: async (_domain: string, fallback: number) => ({ amountCents: fallback, source: "stored", tld: "com" })
    };
    const service = new OrdersService(orders as never, billing as never, {} as never, users as never, domainPricing as never);

    await service.checkout({
      customer: {
        address: { city: "Berlin", line1: "Main 1", postalCode: "10115", state: "Berlin" },
        email: "storefront-cycles@example.test",
        name: "Storefront Buyer",
        password: "StrongPass1!",
        phone: "+49 30123456"
      },
      items: [
        { configuration: { domainName: "storefront-cycles.com" }, productId: "prod_hosting", quantity: 1 },
        { configuration: { domainAction: "register" }, domainName: "storefront-cycles.com", productId: "prod_domain", quantity: 1 }
      ]
    });

    assert.deepEqual(invoiceLines.map((line) => `${line.type}:${line.billingCycle}:${line.unitAmountCents}`), [
      "SERVICE:MONTHLY:999",
      "DOMAIN:YEAR_1:1200"
    ]);
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
    const provisioning = deferred<{ externalId: string; status: "ACTIVE"; metadata: { panel: string } }>();
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
      markOrderInProgress: async () => events.push("order:in-progress"),
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
          return provisioning.promise;
        }
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_hosting", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "item:item_hosting:provisioning",
      "virtualmin:hosted-example.com",
      "order:in-progress"
    ]);

    provisioning.resolve({ externalId: "vm_123", status: "ACTIVE", metadata: { panel: "virtualmin" } });
    await flushPromises();

    assert.deepEqual(events, [
      "order:paid",
      "item:item_hosting:provisioning",
      "virtualmin:hosted-example.com",
      "order:in-progress",
      "item:item_hosting:active:vm_123"
    ]);
  });

  it("keeps slow Virtualmin hosting orders in provisioning instead of failing them", async () => {
    const events: string[] = [];
    const order = {
      id: "ord_hosting_queued",
      userId: "user_1",
      invoiceId: "inv_1",
      customerSnapshot: customerSnapshot(),
      items: [{ ...serviceItem("item_hosting", "SHARED_HOSTING"), configuration: { domainName: "slow-example.com" } }]
    };
    const orders = {
      findOrderForActivation: async () => order,
      markOrderPaid: async () => events.push("order:paid"),
      createServiceForItem: async () => ({ id: "svc_hosting" }),
      markItemActive: async () => events.push("item:active"),
      markItemFailed: async (_id: string, message: string) => events.push(`item:failed:${message}`),
      markItemProvisioning: async () => events.push("item:provisioning"),
      markOrderComplete: async () => events.push("order:complete"),
      markOrderInProgress: async () => events.push("order:in-progress")
    };
    const billing = {
      payInvoice: async () => ({ status: "PAID" }),
      createSubscription: async () => ({ id: "sub_1" })
    };
    const external = {
      virtualmin: {
        provision: async () => ({ externalId: "slow-example.com", status: "QUEUED", metadata: { reason: "timeout" } })
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_hosting_queued", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, ["order:paid", "item:provisioning", "order:in-progress"]);
  });

  it("uses one hosting service for a bundled hosting plus domain order", async () => {
    const events: string[] = [];
    const provisioning = deferred<{ externalId: string; status: "ACTIVE"; metadata: Record<string, unknown> }>();
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
      markOrderInProgress: async () => events.push("order:in-progress"),
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
        provision: async () => provisioning.promise
      }
    };
    const service = new OrdersService(orders as never, billing as never, external as never, {} as never, {} as never);

    await service.payOrder("ord_bundle", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });

    assert.deepEqual(events, [
      "order:paid",
      "service:item_hosting:SHARED_HOSTING",
      "item:item_hosting:provisioning",
      "item:item_domain:provisioning",
      "domain-record:svc_item_hosting",
      "item:item_domain:active:rb_123",
      "order:in-progress"
    ]);

    provisioning.resolve({ externalId: "vm_123", status: "ACTIVE", metadata: {} });
    await flushPromises();

    assert.equal(events.at(-1), "item:item_hosting:active:vm_123");
  });

  it("lets an existing client order when their password is correct", async () => {
    const events: string[] = [];
    const passwordHash = await hash("StrongPass1!", 4);
    const orders = {
      createOrder: async (input: { userId: string }) => {
        events.push(`order:${input.userId}`);
        return { id: "ord_existing" };
      },
      findProduct: async () => product("prod_hosting", "SHARED_HOSTING", 1000, "MONTHLY")
    };
    const billing = {
      createInvoice: async (input: { userId: string }) => {
        events.push(`invoice:${input.userId}`);
        return { id: "inv_existing", subtotalCents: 1000, taxAmountCents: 0, totalCents: 1000 };
      },
      vatPercent: async () => 0
    };
    const users = {
      createUser: async () => events.push("create-user"),
      findByEmail: async () => ({ email: "client@example.com", id: "user_existing", passwordHash })
    };
    const service = new OrdersService(orders as never, billing as never, {} as never, users as never, {} as never);

    await service.checkout({
      customer: { email: "client@example.com", name: "Client", password: "StrongPass1!" },
      items: [{ productId: "prod_hosting", quantity: 1 }]
    });

    assert.deepEqual(events, ["invoice:user_existing", "order:user_existing"]);
  });

  it("checkout creates unpaid invoice and pending entities for storefront order combinations", async () => {
    const cases = [
      { label: "only-domain", items: [{ domainName: "only-domain.test", productId: "prod_domain", quantity: 1 }] },
      {
        label: "domain-and-hosting",
        items: [
          { domainName: "bundle.test", productId: "prod_domain", quantity: 1 },
          { configuration: { bundledDomain: true, domainName: "bundle.test" }, productId: "prod_hosting", quantity: 1 }
        ]
      },
      { label: "only-hosting", items: [{ configuration: { domainName: "external.test" }, productId: "prod_hosting", quantity: 1 }] }
    ];

    for (const scenario of cases) {
      const events: string[] = [];
      const orders = {
        createOrder: async (input: { items: Array<{ type: string }>; userId: string }) => {
          events.push(`order:${scenario.label}:${input.items.map((item) => item.type).join("+")}`);
          return {
            id: `ord_${scenario.label}`,
            items: input.items.map((item, index) => ({ ...item, id: `item_${scenario.label}_${index}` }))
          };
        },
        createPendingEntitiesForOrder: async (order: { id: string; items: Array<{ type: string }> }, invoiceId: string) =>
          events.push(`pending:${order.id}:${invoiceId}:${order.items.map((item) => item.type).join("+")}`),
        findProduct: async (id: string) =>
          id === "prod_domain" ? product("prod_domain", "DOMAIN", 1200, "YEAR_1") : product("prod_hosting", "SHARED_HOSTING", 1000, "MONTHLY")
      };
      const billing = {
        createInvoice: async (input: { status: string; userId: string }) => {
          events.push(`invoice:${input.userId}:${input.status}`);
          return { id: `inv_${scenario.label}`, subtotalCents: 1000, taxAmountCents: 0, totalCents: 1000 };
        },
        vatPercent: async () => 0
      };
      const users = {
        createUser: async (input: { email: string }) => ({ email: input.email, id: `user_${scenario.label}` }),
        findByEmail: async () => null
      };
      const domainPricing = {
        priceFor: async (_domain: string, fallback: number) => ({ amountCents: fallback, source: "stored", tld: "test" })
      };
      const service = new OrdersService(orders as never, billing as never, {} as never, users as never, domainPricing as never);

      await service.checkout({
        customer: {
          email: `${scenario.label}@example.test`,
          name: scenario.label,
          password: "StrongPass1!"
        },
        items: scenario.items
      });

      assert.deepEqual(events, [
        `invoice:user_${scenario.label}:UNPAID`,
        `order:${scenario.label}:${scenario.items.map((item) => (item.productId === "prod_domain" ? "DOMAIN" : "SHARED_HOSTING")).join("+")}`,
        `pending:ord_${scenario.label}:inv_${scenario.label}:${scenario.items.map((item) => (item.productId === "prod_domain" ? "DOMAIN" : "SHARED_HOSTING")).join("+")}`
      ]);
    }
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
    phone: "+4930123456",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}
