import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";

// renewSubscription must bill the captured order price (Service.recurringAmountCents), not the product
// list price. Domain products carry a 0 list price (every TLD/term is priced live from resell.biz at
// checkout), so renewing off productPrice would generate €0 domain renewal invoices.

function buildService(subscription) {
  const billingRepo = {
    findSubscription: async () => subscription,
    advanceSubscription: async () => undefined
  };
  const service = new BillingService(billingRepo, {}, {});
  let capturedDto;
  // createInvoice does a lot of repository work; stub it so the test isolates the renewal line pricing.
  service.createInvoice = async (dto) => {
    capturedDto = dto;
    return { id: "inv-1", ...dto };
  };
  return { capturedLine: () => capturedDto.lines[0], service };
}

function domainSubscription({ recurringAmountCents }) {
  return {
    id: "sub-domain",
    serviceId: "svc-domain",
    userId: "user-1",
    billingCycle: "YEAR_1",
    nextInvoiceAt: new Date("2026-07-01T00:00:00Z"),
    user: { countryCode: "DE", customerType: "INDIVIDUAL", vatId: null },
    productPrice: { amountCents: 0, billingCycle: "YEAR_1", currency: "EUR" },
    service: { recurringAmountCents, product: { name: "Domain" } }
  };
}

test("domain renewal bills the captured order price, not the 0 product list price", async () => {
  const { capturedLine, service } = buildService(domainSubscription({ recurringAmountCents: 1282 }));
  await service.renewSubscription("sub-domain");
  assert.equal(capturedLine().unitAmountCents, 1282);
});

test("renewal falls back to product list price for legacy services without a captured order price", async () => {
  const subscription = domainSubscription({ recurringAmountCents: 0 });
  subscription.productPrice.amountCents = 1499;
  const { capturedLine, service } = buildService(subscription);
  await service.renewSubscription("sub-domain");
  assert.equal(capturedLine().unitAmountCents, 1499);
});

// A recurring admin discount rides on the subscription (stored as a coupon). renewSubscription must bill
// it as its OWN negative discount line on every renewal invoice — never distributed into the renewal line
// and never via the engine's coupon distribution — so the discount keeps applying on future Cron invoices.
test("recurring discount is billed as its own discount line on each renewal invoice", async () => {
  const subscription = domainSubscription({ recurringAmountCents: 2000 });
  subscription.coupon = { id: "cpn-1", code: "ADHOC-ABC123", type: "FIXED", amountCents: 500 };
  const billingRepo = {
    findSubscription: async () => subscription,
    advanceSubscription: async () => undefined
  };
  const service = new BillingService(billingRepo, {}, {});
  let capturedDto;
  service.createInvoice = async (dto) => {
    capturedDto = dto;
    return { id: "inv-1", ...dto };
  };
  service.i18nLanguages = async () => ({ main: "en", others: [] });
  await service.renewSubscription("sub-domain");
  // No coupon distribution — the discount is an explicit line instead.
  assert.equal(capturedDto.couponCode, undefined);
  const discountLine = capturedDto.lines.find((line) => line.type === "DISCOUNT");
  assert.ok(discountLine, "expected a discount line on the renewal invoice");
  assert.equal(discountLine.unitAmountCents, -500); // FIXED €5.00 flat, capped at the €20.00 renewal net
  assert.equal(discountLine.vatRate, 0); // flat discount — carries no VAT
});
