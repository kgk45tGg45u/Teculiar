import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingService } from "../../src/modules/billing/billing.service";

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
});
