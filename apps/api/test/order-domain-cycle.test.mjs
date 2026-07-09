import assert from "node:assert/strict";
import { test } from "node:test";
import { domainCycleFor, isYearlyCycle } from "@dezhost/shared";
import { OrdersService } from "../dist/modules/orders/orders.service.js";

// 1.3 — an admin new-order (or storefront) domain line must register/renew on a yearly cadence,
// never inheriting the hosting item's monthly/one-time cycle. `domainCycleFor` maps the bundled
// hosting cycle to a domain-appropriate yearly cycle, and OrdersService.priceItem prices the domain
// on that cycle regardless of which domain price happened to be first.

test("domainCycleFor maps sub-annual/one-time cycles to YEAR_1 and keeps multi-year terms", () => {
  assert.equal(domainCycleFor("MONTHLY"), "YEAR_1");
  assert.equal(domainCycleFor("QUARTERLY"), "YEAR_1");
  assert.equal(domainCycleFor("SEMI_ANNUAL"), "YEAR_1");
  assert.equal(domainCycleFor("ONE_TIME"), "YEAR_1");
  assert.equal(domainCycleFor(undefined), "YEAR_1");
  assert.equal(domainCycleFor("YEAR_1"), "YEAR_1");
  assert.equal(domainCycleFor("YEAR_2"), "YEAR_2");
  assert.equal(domainCycleFor("YEAR_3"), "YEAR_3");
});

test("isYearlyCycle accepts YEAR_n and rejects everything else", () => {
  assert.equal(isYearlyCycle("YEAR_1"), true);
  assert.equal(isYearlyCycle("YEAR_10"), true);
  assert.equal(isYearlyCycle("MONTHLY"), false);
  assert.equal(isYearlyCycle("ONE_TIME"), false);
  assert.equal(isYearlyCycle(undefined), false);
});

function domainOrdersRepo() {
  return {
    findProduct: async () => ({
      id: "dom",
      name: "Domain .com",
      type: "DOMAIN",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      // prices[0] is deliberately MONTHLY — the old code priced the domain on it (the bug).
      prices: [
        { id: "p-month", billingCycle: "MONTHLY", amountCents: 199, setupFeeCents: 0 },
        { id: "p-year1", billingCycle: "YEAR_1", amountCents: 1200, setupFeeCents: 0 },
        { id: "p-year2", billingCycle: "YEAR_2", amountCents: 2200, setupFeeCents: 0 }
      ]
    }),
    findDomainProductPrice: async (_productId, billingCycle) => ({ id: `p-${billingCycle}`, billingCycle, amountCents: 1200, setupFeeCents: 0 })
  };
}

const domainPricing = { priceFor: async (_domain, amountCents) => ({ amountCents }) };

function ordersServiceWith(orders) {
  return new OrdersService(orders, {}, {}, {}, domainPricing);
}

test("priceItem forces a domain bundled with MONTHLY hosting onto a yearly cycle", async () => {
  const service = ordersServiceWith(domainOrdersRepo());
  const priced = await service.priceItem({
    productId: "dom",
    domainName: "example.com",
    // The storefront/admin form pass the hosting cycle here; a monthly hosting must not make the
    // domain monthly.
    configuration: { billingCycle: "MONTHLY", domainAction: "register" }
  });
  assert.equal(priced.billingCycle, "YEAR_1");
  assert.equal(priced.quantity, 1);
  assert.equal(priced.type, "DOMAIN");
});

test("priceItem ignores a MONTHLY first-price when no cycle is given (regression for the bug)", async () => {
  const service = ordersServiceWith(domainOrdersRepo());
  const priced = await service.priceItem({
    productId: "dom",
    domainName: "example.com",
    configuration: { domainAction: "register" }
  });
  assert.equal(priced.billingCycle, "YEAR_1");
});

test("priceItem keeps a multi-year domain term when the hosting cycle is multi-year", async () => {
  const service = ordersServiceWith(domainOrdersRepo());
  const priced = await service.priceItem({
    productId: "dom",
    domainName: "example.com",
    configuration: { billingCycle: "YEAR_2", domainAction: "register" }
  });
  assert.equal(priced.billingCycle, "YEAR_2");
  assert.equal(priced.quantity, 2);
});
