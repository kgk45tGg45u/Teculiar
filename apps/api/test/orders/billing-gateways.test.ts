import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingEngineService } from "../../src/modules/billing/billing-engine.service";
import { BillingService } from "../../src/modules/billing/billing.service";
import { TaxService } from "../../src/modules/billing/tax.service";

describe("BillingService payment gateways", () => {
  it("returns default storefront gateways when admin has not configured any", async () => {
    const billing = {
      listPaymentGateways: async () => []
    };
    const service = new BillingService(billing as never, {} as never, {} as never);

    const gateways = await service.storefrontPaymentGateways();

    assert.deepEqual(gateways.map((gateway) => gateway.method), ["CREDIT_CARD", "PAYPAL", "SEPA"]);
    assert.equal(gateways[0]?.title, "Credit/debit card");
  });

  it("keeps only admin-enabled gateways on storefront", async () => {
    const billing = {
      listPaymentGateways: async () => [
        { config: { apiKey: "secret" }, enabled: false, method: "CREDIT_CARD" },
        { config: { provider: "paypal" }, enabled: true, method: "PAYPAL" }
      ]
    };
    const service = new BillingService(billing as never, {} as never, {} as never);

    const gateways = await service.storefrontPaymentGateways();

    assert.deepEqual(gateways, [{ method: "PAYPAL", title: "Paypal" }]);
  });

  it("validates enabled gateway configs before saving them", async () => {
    const events: string[] = [];
    const billing = {
      listPaymentGateways: async () => [],
      upsertPaymentGateway: async (input: { method: string }) => {
        events.push(`save:${input.method}`);
        return input;
      }
    };
    const payments = {
      validateConfig: async (input: { method: string }) => {
        events.push(`validate:${input.method}`);
        return { ok: true, message: `${input.method} ok` };
      }
    };
    const service = new BillingService(billing as never, new BillingEngineService(new TaxService()), payments as never);

    const saved = await service.updatePaymentGateways([
      { config: { apiKey: "test_xxx" }, enabled: true, method: "CREDIT_CARD" },
      { config: { clientId: "id", clientSecret: "secret" }, enabled: true, method: "PAYPAL" }
    ]);

    assert.deepEqual(events, ["validate:CREDIT_CARD", "save:CREDIT_CARD", "validate:PAYPAL", "save:PAYPAL"]);
    assert.deepEqual(saved.map((gateway) => gateway.validation.message), ["CREDIT_CARD ok", "PAYPAL ok"]);
  });

  it("adds account balance immediately when top-up payment succeeds", async () => {
    const events: string[] = [];
    const billing = {
      addUserBalance: async (_userId: string, amountCents: number) => events.push(`balance:${amountCents}`),
      createInvoice: async () => ({ id: "inv_funds", invoiceNumber: "N-100001", status: "UNPAID" }),
      createTransaction: async () => events.push("transaction"),
      findCoupon: async () => null,
      findInvoice: async () => ({ id: "inv_funds", invoiceNumber: "N-100001", status: "UNPAID", totalCents: 2500 }),
      listPaymentGateways: async () => [],
      markInvoicePaid: async () => ({ id: "inv_funds", orderSnapshot: { accountCreditCents: 2500 }, status: "PAID", userId: "user_1" }),
      settingNumber: async () => 0,
      settingString: async () => ""
    };
    const payments = {
      get: () => ({
        charge: async () => ({ providerReference: "sandbox_funds", raw: {}, status: "SUCCEEDED" })
      })
    };
    const service = new BillingService(billing as never, new BillingEngineService(new TaxService()), payments as never);

    const result = await service.addFunds("user_1", { amountCents: 2500, method: "PAYPAL" });

    assert.equal(result.status, "PAID");
    assert.ok(events.includes("balance:2500"));
  });

  it("runs Mollie card payments with the creditcard method and checkout redirect", async () => {
    const calls: Array<{ body?: Record<string, unknown>; url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
        url: String(url)
      });
      return new Response(JSON.stringify({
        id: "tr_mollie",
        status: "open",
        _links: { checkout: { href: "https://www.mollie.com/checkout/select-method/tr_mollie" } }
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      const billing = {
        paymentGateway: async () => ({ config: { apiKey: "test_xxx" }, enabled: true })
      };
      const payments = new (await import("../../src/modules/billing/processors/abstract-payment.service")).AbstractPaymentService(billing as never);

      const result = await payments.get("CREDIT_CARD").charge({
        amountCents: 1234,
        currency: "EUR",
        invoiceId: "inv_1",
        paymentMethodId: "card",
        redirectUrl: "https://dezhost.test/client/billing/payment-return?invoiceId=inv_1"
      });

      assert.equal(result.status, "PENDING");
      assert.equal(result.providerReference, "tr_mollie");
      assert.equal(result.paymentRedirectUrl, "https://www.mollie.com/checkout/select-method/tr_mollie");
      assert.equal(calls[0]?.url, "https://api.mollie.com/v2/payments");
      assert.equal(calls[0]?.body?.method, "creditcard");
      assert.deepEqual(calls[0]?.body?.amount, { currency: "EUR", value: "12.34" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("pays invoices from account balance during maintenance when funds cover the total", async () => {
    const events: string[] = [];
    const invoices = [
      { id: "inv_paid", orderSnapshot: {}, status: "UNPAID", totalCents: 2000, user: { balanceCents: 2500 }, userId: "user_1" },
      { id: "inv_short", orderSnapshot: {}, status: "UNPAID", totalCents: 3000, user: { balanceCents: 1000 }, userId: "user_2" },
      { id: "inv_topup", orderSnapshot: { accountCreditCents: 5000 }, status: "UNPAID", totalCents: 5000, user: { balanceCents: 6000 }, userId: "user_3" }
    ];
    const billing = {
      balancePayableInvoices: async () => invoices,
      createAuditLog: async (input: { action: string; subjectId?: string }) => events.push(`audit:${input.action}:${input.subjectId}`),
      createTransaction: async (input: { amountCents: number; invoiceId: string; method: string }) => events.push(`transaction:${input.method}:${input.invoiceId}:${input.amountCents}`),
      debitUserBalance: async (userId: string, amountCents: number) => {
        events.push(`debit:${userId}:${amountCents}`);
        return { count: userId === "user_1" ? 1 : 0 };
      },
      dueSubscriptions: async () => [],
      findInvoiceForLifecycle: async () => ({ id: "inv_paid", items: [], orderSnapshot: {}, userId: "user_1" }),
      markInvoicePaid: async (id: string) => ({ id, orderSnapshot: {}, status: "PAID", userId: "user_1" }),
      overdueUnpaidInvoices: async () => [],
      settingNumber: async (_key: string, fallback: number) => fallback,
      suspendServices: async () => ({ count: 0 })
    };
    const service = new BillingService(billing as never, new BillingEngineService(new TaxService()), {} as never);

    const result = await service.runAdminMaintenance();

    assert.equal(result.balancePaidInvoices, 1);
    assert.deepEqual(events.filter((event) => event.startsWith("debit:")), ["debit:user_1:2000"]);
    assert.ok(events.includes("transaction:ACCOUNT_BALANCE:inv_paid:2000"));
    assert.ok(!events.some((event) => event.includes("inv_short")));
    assert.ok(!events.some((event) => event.includes("inv_topup")));
  });
});
