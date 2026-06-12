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
