import assert from "node:assert/strict";
import { test } from "node:test";
import { OrdersRepository } from "../dist/modules/orders/orders.repository.js";
import { OrdersService } from "../dist/modules/orders/orders.service.js";

// Admin custom pricing — when an admin overrides a product's price on the new-order form, the priced
// order item (and therefore the created order item, first invoice, and captured service recurring
// amount) must reflect that custom amount and cycle. `applyCustomToRenewals` controls whether the
// custom amount also drives Cron renewal invoices (default) or only the first invoice.

function hostingOrdersRepo() {
  return {
    findProduct: async () => ({
      id: "host",
      name: "Web Hosting M",
      slug: "web-hosting-m",
      type: "SHARED_HOSTING",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      prices: [{ id: "p-month", billingCycle: "MONTHLY", amountCents: 1000, setupFeeCents: 0 }]
    })
  };
}

function domainOrdersRepo() {
  return {
    findProduct: async () => ({
      id: "dom",
      name: "Domain .com",
      slug: "domain-com",
      type: "DOMAIN",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      prices: [
        { id: "p-month", billingCycle: "MONTHLY", amountCents: 199, setupFeeCents: 0 },
        { id: "p-year1", billingCycle: "YEAR_1", amountCents: 1200, setupFeeCents: 0 }
      ]
    }),
    findDomainProductPrice: async (_productId, billingCycle) => ({ id: `p-${billingCycle}`, billingCycle, amountCents: 1200, setupFeeCents: 0 })
  };
}

const domainPricing = { priceFor: async (_domain, amountCents) => ({ amountCents }) };

function ordersServiceWith(orders) {
  return new OrdersService(orders, {}, {}, {}, domainPricing);
}

test("priceItem applies an admin custom price + cycle and carries it to renewals by default", async () => {
  const service = ordersServiceWith(hostingOrdersRepo());
  const priced = await service.priceItem({
    productId: "host",
    quantity: 1,
    customAmountCents: 2500,
    customBillingCycle: "YEAR_1",
    applyCustomToRenewals: true,
    configuration: {}
  });
  assert.equal(priced.unitAmountCents, 2500);
  assert.equal(priced.billingCycle, "YEAR_1");
  assert.equal(priced.recurringAmountCents, 2500);
  assert.equal(priced.totalCents, 2500);
  // No divergence between first-invoice and renewal price → nothing stashed on the configuration.
  assert.equal(priced.configuration.renewalAmountCents, undefined);
});

test("priceItem keeps renewals at the list price when the custom price opts out of renewals", async () => {
  const service = ordersServiceWith(hostingOrdersRepo());
  const priced = await service.priceItem({
    productId: "host",
    quantity: 1,
    customAmountCents: 2500,
    customBillingCycle: "MONTHLY",
    applyCustomToRenewals: false,
    configuration: {}
  });
  assert.equal(priced.unitAmountCents, 2500);
  // Renewals fall back to the product list price, stashed for createPendingEntitiesForOrder to read.
  assert.equal(priced.recurringAmountCents, 1000);
  assert.equal(priced.configuration.renewalAmountCents, 1000);
});

test("priceItem without custom pricing leaves the list price untouched", async () => {
  const service = ordersServiceWith(hostingOrdersRepo());
  const priced = await service.priceItem({ productId: "host", productPriceId: "p-month", quantity: 1, configuration: {} });
  assert.equal(priced.unitAmountCents, 1000);
  assert.equal(priced.recurringAmountCents, 1000);
  assert.equal(priced.billingCycle, "MONTHLY");
});

test("priceItem never applies custom pricing to a domain item (domains are priced live)", async () => {
  const service = ordersServiceWith(domainOrdersRepo());
  const priced = await service.priceItem({
    productId: "dom",
    domainName: "example.com",
    customAmountCents: 999,
    customBillingCycle: "MONTHLY",
    configuration: { domainAction: "register" }
  });
  assert.notEqual(priced.unitAmountCents, 999);
  assert.equal(priced.billingCycle, "YEAR_1");
  assert.equal(priced.recurringAmountCents, priced.unitAmountCents);
});

// With custom pricing the form sends no productPriceId, so the item used to anchor to an arbitrary
// first price. The item (and its subscription's product price) must anchor to the list price matching
// the custom cycle, so a renewals opt-out falls back to the RIGHT list amount.
test("priceItem anchors custom pricing to the list price matching the custom cycle", async () => {
  const service = ordersServiceWith({
    findProduct: async () => ({
      id: "host",
      name: "Web Hosting M",
      slug: "web-hosting-m",
      type: "SHARED_HOSTING",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      // prices[0] is deliberately MONTHLY — the renewals opt-out must NOT fall back to it.
      prices: [
        { id: "p-month", billingCycle: "MONTHLY", amountCents: 1000, setupFeeCents: 0 },
        { id: "p-year1", billingCycle: "YEAR_1", amountCents: 10000, setupFeeCents: 0 }
      ]
    })
  });
  const priced = await service.priceItem({
    productId: "host",
    quantity: 1,
    customAmountCents: 2500,
    customBillingCycle: "YEAR_1",
    applyCustomToRenewals: false,
    configuration: {}
  });
  assert.equal(priced.productPriceId, "p-year1"); // cycle-matched, not prices[0]
  assert.equal(priced.unitAmountCents, 2500);
  assert.equal(priced.recurringAmountCents, 10000); // the YEAR_1 list price, not the MONTHLY one
  assert.equal(priced.configuration.renewalAmountCents, 10000);
});

// "Apply custom price to all future renewal invoices" — regression for the activation path. The order's
// pending-entities step already created the item's service (carrying the custom recurring amount) +
// subscription; activateItem must reuse them. Creating a second service dropped recurringAmountCents
// (renewals silently billed the list price) and double-billed via a duplicate subscription.
test("activateItem reuses the pending-entities service instead of creating a duplicate", async () => {
  const calls = { createService: 0, createSubscription: 0, markedActive: [] };
  const orders = {
    createServiceForItem: async () => {
      calls.createService += 1;
      return { id: "svc-dup" };
    },
    markItemActive: async (id) => {
      calls.markedActive.push(id);
      return {};
    }
  };
  const billing = {
    createSubscription: async () => {
      calls.createSubscription += 1;
    }
  };
  const service = new OrdersService(orders, billing, {}, {}, domainPricing);
  const result = await service.activateItem("user-1", {
    billingCycle: "MONTHLY",
    configuration: {},
    id: "item-1",
    productId: null,
    productPriceId: "p-month",
    serviceId: "svc-pending",
    type: "MANAGED_SERVICE"
  });
  assert.equal(result.service.id, "svc-pending");
  assert.equal(calls.createService, 0);
  assert.equal(calls.createSubscription, 0);
  assert.deepEqual(calls.markedActive, ["item-1"]);
});

// Legacy path (no pending service yet): the service created at activation must capture the renewal
// amount — it used to default recurringAmountCents to 0, so renewals fell back to the list price.
test("createServiceForItem captures the renewal amount and billing cycle on the service", async () => {
  let captured;
  const prisma = {
    service: { create: async ({ data }) => { captured = data; return { id: "svc-1", ...data }; } },
    orderItem: { update: async () => ({}) }
  };
  const repo = new OrdersRepository(prisma);

  // Custom price applying to renewals: the item's unit amount recurs.
  await repo.createServiceForItem(
    { id: "item-1", billingCycle: "YEAR_1", configuration: {}, productPriceId: "p-year1", setupFeeCents: 0, unitAmountCents: 2500 },
    "user-1",
    "ACTIVE"
  );
  assert.equal(captured.recurringAmountCents, 2500);
  assert.equal(captured.billingCycle, "YEAR_1");

  // Renewals opt-out: the stashed list amount recurs instead of the custom first-invoice price.
  await repo.createServiceForItem(
    { id: "item-2", billingCycle: "MONTHLY", configuration: { renewalAmountCents: 1000 }, productPriceId: "p-month", setupFeeCents: 0, unitAmountCents: 2500 },
    "user-1",
    "ACTIVE"
  );
  assert.equal(captured.recurringAmountCents, 1000);
});
