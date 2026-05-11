import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingEngineService } from "../../src/modules/billing/billing-engine.service";
import { BillingService } from "../../src/modules/billing/billing.service";
import { TaxService } from "../../src/modules/billing/tax.service";

describe("Billing lifecycle", () => {
  it("marks paid invoices final, activates pending services, registers domains, and stays idempotent", async () => {
    const events: string[] = [];
    const processedKeys = new Set<string>();
    const invoice = lifecycleInvoice({
      items: [
        serviceLine("line_service", "svc_1", "ORDERED", "SHARED_HOSTING", { domainName: "site.test" }),
        domainLine("line_domain", "dom_1", "example.com", "register")
      ]
    });
    const billing = lifecycleRepository(events, processedKeys, invoice);
    const service = new BillingService(
      billing as never,
      new BillingEngineService(new TaxService()),
      paymentProcessor(events) as never,
      externalProviders(events) as never
    );

    const paid = await service.payInvoice("inv_1", { method: "CREDIT_CARD", paymentMethodId: "sandbox" });
    await service.onInvoicePaid("inv_1");

    assert.equal(paid.status, "PAID");
    assert.equal(paid.finalInvoiceNumber, "100001");
    assert.deepEqual(
      events.filter((event) => event.startsWith("module:") || event.startsWith("virtualmin") || event.startsWith("resellbiz")),
      [
        "module:create:invoice:inv_1:service:svc_1:create",
        "virtualmin:site.test",
        "module:register_domain:invoice:inv_1:domain:dom_1:register_domain",
        "resellbiz:register:example.com"
      ]
    );
    assert.equal(events.filter((event) => event === "service:svc_1:ACTIVE").length, 1);
    assert.equal(events.filter((event) => event === "domain:dom_1:ACTIVE").length, 1);
    assert.equal(events.filter((event) => event === "order:ord_1:COMPLETE").length, 2);
  });

  it("keeps invoice paid when module provisioning fails", async () => {
    const events: string[] = [];
    const invoice = lifecycleInvoice({
      items: [serviceLine("line_service", "svc_fail", "ORDERED", "SHARED_HOSTING", { domainName: "broken.test" })]
    });
    const billing = lifecycleRepository(events, new Set(), invoice);
    const service = new BillingService(
      billing as never,
      new BillingEngineService(new TaxService()),
      paymentProcessor(events) as never,
      externalProviders(events, { failHosting: true }) as never
    );

    const paid = await service.payInvoice("inv_1", { method: "PAYPAL", paymentMethodId: "sandbox" });

    assert.equal(paid.status, "PAID");
    assert.deepEqual(events.filter((event) => event.includes("svc_fail")), [
      "module:create:invoice:inv_1:service:svc_fail:create",
      "service:svc_fail:FAILED",
      "item:oi_svc_fail:FAILED"
    ]);
    assert.ok(events.includes("order:ord_1:PROVISIONING"));
  });

  it("manual paid behaves like gateway payment and manual unpaid does not terminate service", async () => {
    const events: string[] = [];
    const invoice = lifecycleInvoice({
      items: [serviceLine("line_service", "svc_manual", "ORDERED", "VPS", { hostname: "vps.test" })]
    });
    const billing = lifecycleRepository(events, new Set(), invoice);
    const service = new BillingService(
      billing as never,
      new BillingEngineService(new TaxService()),
      paymentProcessor(events) as never,
      externalProviders(events) as never
    );

    await service.markInvoicePaid("inv_1", { actorId: "admin_1", source: "admin" });
    await service.markInvoiceUnpaid("inv_1", { actorId: "admin_1", reason: "manual correction" });

    assert.ok(events.includes("hetzner:svc_manual"));
    assert.ok(events.includes("service:svc_manual:ACTIVE"));
    assert.ok(events.includes("invoice:unpaid:inv_1"));
    assert.ok(events.includes("service:svc_manual:SUSPENDED"));
    assert.equal(events.includes("service:svc_manual:TERMINATED"), false);
  });

  it("paid renewal invoices renew, unsuspend, and renew domains", async () => {
    const events: string[] = [];
    const invoice = lifecycleInvoice({
      items: [
        serviceLine("line_active", "svc_active", "ACTIVE", "SHARED_HOSTING", { domainName: "active.test" }, "renew"),
        serviceLine("line_suspended", "svc_suspended", "SUSPENDED", "SHARED_HOSTING", { domainName: "paused.test" }),
        domainLine("line_domain_renew", "dom_renew", "renew.me", "renew")
      ]
    });
    const billing = lifecycleRepository(events, new Set(), invoice);
    const service = new BillingService(
      billing as never,
      new BillingEngineService(new TaxService()),
      paymentProcessor(events) as never,
      externalProviders(events) as never
    );

    await service.onInvoicePaid("inv_1", { source: "gateway" });

    assert.ok(events.includes("service:svc_active:ACTIVE"));
    assert.ok(events.includes("service:svc_suspended:ACTIVE"));
    assert.ok(events.includes("resellbiz:renew:renew.me"));
    assert.ok(events.includes("domain:dom_renew:ACTIVE"));
  });

  it("calculates next due date from payment date instead of adding a cycle twice", async () => {
    const events: string[] = [];
    const dueDates: string[] = [];
    const paidAt = new Date("2026-05-11T10:00:00.000Z");
    const invoice = lifecycleInvoice({
      dueAt: paidAt,
      items: [
        serviceLine("line_monthly", "svc_monthly", "ORDERED", "SHARED_HOSTING", {
          billingCycle: "MONTHLY",
          domainName: "monthly.test",
          renewsAt: "2026-06-11T10:00:00.000Z"
        })
      ]
    });
    const billing = {
      ...lifecycleRepository(events, new Set(), invoice),
      setServiceLifecycleStatus: async (_id: string, _status: string, input: { renewsAt?: Date } = {}) => {
        if (input.renewsAt) {
          dueDates.push(input.renewsAt.toISOString());
        }
      }
    };
    const service = new BillingService(
      billing as never,
      new BillingEngineService(new TaxService()),
      paymentProcessor(events) as never,
      externalProviders(events) as never
    );

    await service.onInvoicePaid("inv_1", { source: "gateway" });

    assert.equal(dueDates[0], "2026-06-11T10:00:00.000Z");
  });

  it("does not retry a failed module action when a successful run already exists", async () => {
    const events: string[] = [];
    const billing = {
      findModuleLog: async () => ({
        action: "create",
        domainRecordId: null,
        id: "log_failed",
        invoiceId: "inv_1",
        request: {},
        serviceId: "svc_retry",
        status: "FAILED"
      }),
      successfulModuleLogForTarget: async () => ({ id: "log_success" }),
      createAuditLog: async (input: { action: string }) => events.push(`audit:${input.action}`)
    };
    const service = new BillingService(
      billing as never,
      new BillingEngineService(new TaxService()),
      paymentProcessor(events) as never,
      externalProviders(events) as never
    );

    const result = await service.retryModuleAction("log_failed", { actorId: "admin_1" });

    assert.equal(result.skipped, true);
    assert.equal(events.some((event) => event.startsWith("virtualmin") || event.startsWith("hetzner")), false);
  });

  it("supports admin custom invoices, VAT overrides, and German invoice settings", async () => {
    const created: Record<string, unknown>[] = [];
    const billing = {
      createInvoice: async (input: Record<string, unknown>) => {
        created.push(input);
        return { id: "inv_custom", tempInvoiceNumber: "N-100001", invoiceNumber: "N-100001", ...input };
      },
      findCoupon: async () => null,
      settingNumber: async (key: string) => (key === "vatPercent" ? 19 : 0),
      settingString: async (key: string) =>
        ({
          invoiceCompanyName: "Dezhost GmbH",
          invoiceCompanyAddress: "Hoststr. 1",
          invoiceCompanyZip: "10115",
          invoiceCompanyCity: "Berlin",
          invoiceCompanyCountry: "DE",
          invoiceCompanyEmail: "billing@dezhost.test",
          invoiceCompanyPhone: "+49 30 123",
          invoiceVatNumber: "DE123456789",
          invoiceFooterLine1: "Footer 1",
          invoiceFooterLine2: "Footer 2",
          invoiceFooterLine3: "Footer 3",
          invoicePaymentInstructions: "Bitte innerhalb der Frist zahlen.",
          invoiceBankDetails: "IBAN DE00 0000 0000 0000 0000 00"
        })[key] ?? ""
    };
    const service = new BillingService(billing as never, new BillingEngineService(new TaxService()), paymentProcessor([]) as never);

    const invoice = await service.createInvoice({
      buyerCountryCode: "DE",
      customerSnapshot: { name: "Manual Client" },
      dueAt: new Date().toISOString(),
      lines: [
        { description: "Support work", quantity: 2, type: "CUSTOM", unitAmountCents: 5000, vatRate: 7 },
        { description: "Discount", quantity: 1, type: "DISCOUNT", unitAmountCents: -1000, vatRate: 0 }
      ],
      status: "UNPAID",
      userId: "user_1"
    } as never);

    const lines = created[0]?.lines as Array<{ taxAmountCents: number; taxRate: number; totalCents: number; type: string }>;
    assert.equal(invoice.invoiceNumber, "N-100001");
    assert.equal(lines[0]?.type, "CUSTOM");
    assert.equal(lines[0]?.taxRate, 7);
    assert.equal(lines[0]?.taxAmountCents, 700);
    assert.equal(lines[1]?.taxRate, 0);
    assert.deepEqual(created[0]?.sellerSnapshot, {
      address: "Hoststr. 1",
      bankDetails: "IBAN DE00 0000 0000 0000 0000 00",
      city: "Berlin",
      companyName: "Dezhost GmbH",
      country: "DE",
      email: "billing@dezhost.test",
      footerLines: ["Footer 1", "Footer 2", "Footer 3"],
      paymentInstructions: "Bitte innerhalb der Frist zahlen.",
      phone: "+49 30 123",
      vatNumber: "DE123456789",
      zip: "10115"
    });
  });
});

function lifecycleInvoice(input: { dueAt?: Date; items: Array<Record<string, unknown>> }) {
  return {
    currency: "EUR",
    customerSnapshot: customerSnapshot(),
    dueAt: input.dueAt ?? new Date(Date.now() + 86400_000),
    finalInvoiceNumber: null,
    id: "inv_1",
    invoiceNumber: "N-100001",
    items: input.items,
    order: { id: "ord_1", items: input.items.map((item) => item.orderItem).filter(Boolean), status: "PENDING_PAYMENT" },
    paidAt: null,
    status: "UNPAID",
    tempInvoiceNumber: "N-100001",
    totalCents: 11900,
    userId: "user_1"
  };
}

function serviceLine(
  id: string,
  serviceId: string,
  status: string,
  productType: string,
  configuration: Record<string, unknown>,
  lifecycleAction = "create"
) {
  const orderItem = { id: `oi_${serviceId}`, provisioningStatus: "PENDING", type: productType };
  return {
    description: serviceId,
    id,
    lifecycleAction,
    orderItem,
    orderItemId: orderItem.id,
    service: {
      autoRenew: true,
      billingCycle: configuration.billingCycle,
      configuration,
      id: serviceId,
      moduleName: productType === "VPS" ? "hetzner" : "virtualmin",
      product: { type: productType },
      renewsAt: configuration.renewsAt,
      status
    },
    serviceId,
    type: lifecycleAction === "renew" ? "SERVICE_RENEWAL" : "SERVICE"
  };
}

function domainLine(id: string, domainRecordId: string, domain: string, action: "register" | "renew" | "transfer") {
  const orderItem = { id: `oi_${domainRecordId}`, configuration: { domainAction: action }, provisioningStatus: "PENDING", type: "DOMAIN" };
  return {
    description: domain,
    domainRecord: {
      autoRenew: true,
      domain,
      eppCode: action === "transfer" ? "secret" : null,
      externalId: "12345",
      id: domainRecordId,
      nameservers: ["ns1.dezhost.test", "ns2.dezhost.test"],
      registrationPeriodYears: 1,
      status: "PENDING",
      type: action
    },
    domainRecordId,
    id,
    lifecycleAction: action,
    orderItem,
    orderItemId: orderItem.id,
    type: action === "renew" ? "DOMAIN_RENEWAL" : "DOMAIN"
  };
}

function lifecycleRepository(events: string[], processedKeys: Set<string>, invoice: Record<string, unknown>) {
  return {
    createAuditLog: async (input: { action: string }) => events.push(`audit:${input.action}`),
    createModuleLog: async (input: { action: string; idempotencyKey: string }) => {
      processedKeys.add(input.idempotencyKey);
      events.push(`module:${input.action}:${input.idempotencyKey}`);
      return { id: `log_${processedKeys.size}`, ...input };
    },
    createTransaction: async () => events.push("transaction"),
    failModuleLog: async () => undefined,
    findInvoice: async () => invoice,
    findInvoiceForLifecycle: async () => ({ ...invoice, status: "PAID" }),
    findModuleLogByKey: async (key: string) => (processedKeys.has(key) ? { id: `log_${key}`, status: "SUCCEEDED" } : null),
    suspendServicesForInvoice: async () => {
      for (const item of (invoice.items as Array<Record<string, any>>) ?? []) {
        if ((item.service as { id?: string } | undefined)?.id) {
          events.push(`service:${(item.service as { id: string }).id}:SUSPENDED`);
        }
      }
    },
    markInvoicePaid: async () => ({ ...invoice, finalInvoiceNumber: "100001", invoiceNumber: "100001", status: "PAID" }),
    markInvoiceUnpaid: async (id: string) => events.push(`invoice:unpaid:${id}`),
    setDomainLifecycleStatus: async (id: string, status: string) => events.push(`domain:${id}:${status}`),
    setOrderItemLifecycleStatus: async (id: string, status: string) => events.push(`item:${id}:${status}`),
    setOrderLifecycleStatus: async (id: string, status: string) => events.push(`order:${id}:${status}`),
    setServiceLifecycleStatus: async (id: string, status: string) => events.push(`service:${id}:${status}`),
    succeedModuleLog: async () => undefined
  };
}

function paymentProcessor(events: string[]) {
  return {
    get: () => ({
      charge: async () => {
        events.push("charge");
        return { providerReference: `txn_${events.length}`, raw: {}, status: "SUCCEEDED" };
      }
    })
  };
}

function externalProviders(events: string[], options: { failHosting?: boolean } = {}) {
  return {
    hetzner: {
      provision: async (request: { serviceId: string }) => {
        events.push(`hetzner:${request.serviceId}`);
        return { externalId: `hz_${request.serviceId}`, metadata: {}, status: "ACTIVE" };
      }
    },
    resellBiz: {
      register: async (request: { domain: string }) => {
        events.push(`resellbiz:register:${request.domain}`);
        return { externalId: "rb_123", metadata: {}, status: "ACTIVE" };
      },
      renew: async (request: { domain: string }) => {
        events.push(`resellbiz:renew:${request.domain}`);
        return { externalId: "rb_renew", metadata: {}, status: "ACTIVE" };
      },
      transfer: async (request: { domain: string }) => {
        events.push(`resellbiz:transfer:${request.domain}`);
        return { externalId: "rb_transfer", metadata: {}, status: "ACTIVE" };
      }
    },
    virtualmin: {
      provision: async (request: { options: { domainName?: string } }) => {
        events.push(`virtualmin:${request.options.domainName}`);
        return options.failHosting
          ? { externalId: "vm_failed", metadata: {}, status: "FAILED" }
          : { externalId: "vm_123", metadata: {}, status: "ACTIVE" };
      }
    }
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
    countryCode: "DE",
    email: "buyer@example.com",
    name: "Buyer Person",
    phone: "+49 30123456"
  };
}
