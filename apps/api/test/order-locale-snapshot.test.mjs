import assert from "node:assert/strict";
import { test } from "node:test";
import { OrdersService } from "../dist/modules/orders/orders.service.js";

// Phase 7.1: the invoice line description AND the service productSnapshot.name are snapshotted in the
// buyer's chosen locale at order time. priceItem takes an optional `locale`; when a per-locale name
// override exists it is used, otherwise it falls back to the plain (main-language) product name.

function hostingRepo() {
  return {
    findProduct: async () => ({
      id: "host",
      name: "Web Hosting M",
      nameTranslations: { de: "Webhosting M (DE)", es: "Alojamiento M" },
      slug: "web-hosting-m",
      type: "SHARED_HOSTING",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      prices: [{ id: "p-month", billingCycle: "MONTHLY", amountCents: 1000, setupFeeCents: 0 }]
    })
  };
}

function domainRepo() {
  return {
    findProduct: async () => ({
      id: "dom",
      name: "Domain .com",
      nameTranslations: { de: "Domain .com (DE)" },
      slug: "domain-com",
      type: "DOMAIN",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      prices: [{ id: "p-year1", billingCycle: "YEAR_1", amountCents: 1200, setupFeeCents: 0 }]
    }),
    findDomainProductPrice: async (_id, billingCycle) => ({ id: `p-${billingCycle}`, billingCycle, amountCents: 1200, setupFeeCents: 0 })
  };
}

const domainPricing = { priceFor: async (_domain, amountCents) => ({ amountCents }) };

function serviceWith(repo) {
  return new OrdersService(repo, {}, {}, {}, domainPricing);
}

test("priceItem snapshots the buyer-locale name onto the line + service when an override exists", async () => {
  const service = serviceWith(hostingRepo());
  const priced = await service.priceItem({ productId: "host", productPriceId: "p-month", quantity: 1, configuration: {} }, "de");
  assert.equal(priced.description, "Webhosting M (DE)");
  assert.equal(priced.productSnapshot.name, "Webhosting M (DE)");
});

test("priceItem falls back to the plain name when the locale has no override", async () => {
  const service = serviceWith(hostingRepo());
  const priced = await service.priceItem({ productId: "host", productPriceId: "p-month", quantity: 1, configuration: {} }, "fr");
  assert.equal(priced.description, "Web Hosting M");
  assert.equal(priced.productSnapshot.name, "Web Hosting M");
});

test("priceItem uses the plain name when no locale is passed (admin/preview path)", async () => {
  const service = serviceWith(hostingRepo());
  const priced = await service.priceItem({ productId: "host", productPriceId: "p-month", quantity: 1, configuration: {} });
  assert.equal(priced.description, "Web Hosting M");
  assert.equal(priced.productSnapshot.name, "Web Hosting M");
});

test("domain line description stays the domain-action label regardless of locale, but the snapshot localizes", async () => {
  const service = serviceWith(domainRepo());
  const priced = await service.priceItem({ productId: "dom", domainName: "example.com", configuration: { domainAction: "register" } }, "de");
  assert.equal(priced.description, "example.com domain register");
  assert.equal(priced.productSnapshot.name, "Domain .com (DE)");
});
