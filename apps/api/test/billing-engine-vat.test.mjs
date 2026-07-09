import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingEngineService } from "../dist/modules/billing/billing-engine.service.js";
import { TaxService } from "../dist/modules/billing/tax.service.js";

// Invoicing rule: every entered/looked-up price is NET (VAT-excluded). The engine ADDS VAT on top of
// each line — hosting AND domain — and a discount reduces the NET taxable base (so it also lowers the
// VAT). VAT is never extracted from the price. This is the source of truth the admin new-order preview
// and the storefront checkout estimate both mirror.

const config = { enabled: true, default: "DE", rates: { DE: 19 } };
const deIndividual = { sellerCountryCode: "DE", buyerCountryCode: "DE", isBusinessCustomer: false };

function engine() {
  return new BillingEngineService(new TaxService());
}

test("VAT is added on top of every net line, including the domain line", () => {
  const draft = engine().createDraft({
    lines: [
      { description: "Web Hosting", quantity: 1, unitAmountCents: 500 }, // €5.00 net
      { description: "example.com domain register", quantity: 1, unitAmountCents: 1200, type: "DOMAIN" } // €12.00 net
    ],
    taxContext: deIndividual,
    taxConfig: config
  });
  assert.equal(draft.subtotalCents, 1700); // net sum, not reduced
  assert.equal(draft.discountCents, 0);
  assert.equal(draft.taxAmountCents, 323); // 19% of 1700, added on top
  assert.equal(draft.totalCents, 2023); // 1700 + 323 — VAT added, never extracted
  const domainLine = draft.lines.find((line) => line.type === "DOMAIN");
  assert.equal(domainLine.taxAmountCents, 228); // 19% of 1200 → the domain carries VAT too
  assert.equal(domainLine.totalCents, 1428);
});

// Order discounts are billed as their OWN flat line (not distributed into product lines) with NO VAT
// (taxRate 0, from the DISCOUNT line's vatRate: 0): a €2 discount takes exactly €2 off the total, while
// VAT stays computed on the full product/domain lines.
test("a flat discount line (no VAT) reduces the total by exactly its amount and leaves product lines untouched", () => {
  const draft = engine().createDraft({
    lines: [
      { description: "Web Hosting", quantity: 1, unitAmountCents: 500 },
      { description: "example.com domain register", quantity: 1, unitAmountCents: 1200, type: "DOMAIN" },
      { description: "Discount", quantity: 1, unitAmountCents: -200, type: "DISCOUNT", taxRate: 0 } // €2.00 off, whole order
    ],
    taxContext: deIndividual,
    taxConfig: config
  });
  const host = draft.lines.find((line) => line.description === "Web Hosting");
  const domain = draft.lines.find((line) => line.type === "DOMAIN");
  const discount = draft.lines.find((line) => line.type === "DISCOUNT");
  // Product lines keep full net + VAT (untouched by the discount).
  assert.equal(host.totalCents, 595); // 500 + 95
  assert.equal(domain.totalCents, 1428); // 1200 + 228
  // The discount line carries NO VAT — it is a flat reduction. (+0 normalizes Math.round's -0.)
  assert.equal(discount.taxAmountCents + 0, 0);
  assert.equal(discount.totalCents, -200);
  assert.equal(draft.subtotalCents, 1500); // 500 + 1200 - 200
  assert.equal(draft.taxAmountCents, 323); // 95 + 228 — VAT on the full product lines
  assert.equal(draft.totalCents, 1823); // 1500 + 323 = (595 + 1428) - 200
});

// The coupon distribution path still exists for legacy/manual coupon invoices (not used by admin orders).
test("a FIXED coupon still reduces the net taxable base and the VAT with it", () => {
  const draft = engine().createDraft({
    lines: [{ description: "Web Hosting", quantity: 1, unitAmountCents: 500 }],
    coupon: { type: "FIXED", amountCents: 200 }, // €2.00 net off
    taxContext: deIndividual,
    taxConfig: config
  });
  assert.equal(draft.subtotalCents, 500);
  assert.equal(draft.discountCents, 200);
  assert.equal(draft.taxAmountCents, 57); // 19% of (500 - 200) = 300
  assert.equal(draft.totalCents, 357); // 300 + 57
});

test("no VAT (reverse charge / export) leaves the net price as the total", () => {
  const draft = engine().createDraft({
    lines: [{ description: "Web Hosting", quantity: 1, unitAmountCents: 500 }],
    taxContext: { sellerCountryCode: "DE", buyerCountryCode: "FR", isBusinessCustomer: true, buyerVatId: "FR123456789" },
    taxConfig: config
  });
  assert.equal(draft.taxAmountCents, 0);
  assert.equal(draft.totalCents, 500);
});
