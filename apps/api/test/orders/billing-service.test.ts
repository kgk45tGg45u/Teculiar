import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingService } from "../../src/modules/billing/billing.service";
import { BillingEngineService } from "../../src/modules/billing/billing-engine.service";
import { TaxService } from "../../src/modules/billing/tax.service";

describe("BillingService invoice snapshots", () => {
  it("stores customer and footer snapshots when creating an invoice", async () => {
    const created: Record<string, unknown>[] = [];
    const billing = {
      createInvoice: async (input: Record<string, unknown>) => {
        created.push(input);
        return { id: "inv_1", ...input };
      },
      findCoupon: async () => null,
      settingNumber: async () => 0,
      settingString: async (key: string) => ({ invoiceFooterLine1: "Line 1", invoiceFooterLine2: "Line 2", invoiceFooterLine3: "" })[key] ?? ""
    };
    const service = new BillingService(billing as never, new BillingEngineService(new TaxService()), {} as never);

    await service.createInvoice({
      buyerCountryCode: "DE",
      customerSnapshot: { name: "Frozen Buyer" },
      dueAt: new Date().toISOString(),
      lines: [{ description: "Service", quantity: 1, unitAmountCents: 1000 }],
      orderSnapshot: { orderNumber: "000001" },
      userId: "user_1"
    });

    assert.deepEqual(created[0]?.customerSnapshot, { name: "Frozen Buyer" });
    assert.deepEqual(created[0]?.footerLines, ["Line 1", "Line 2"]);
    assert.deepEqual(created[0]?.orderSnapshot, { orderNumber: "000001" });
  });
});
