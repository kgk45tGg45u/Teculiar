/**
 * Category 1 — Hosting orders (new customer, deterministic sandbox payment).
 *
 * A randomly-selected hosting tier is ordered with each domain scenario. We assert
 * invoice creation + PAID status, order placement, and that the hosting service is
 * created. Every successful order's Virtualmin account is torn down by the fixture.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { hostingOrder } from "../../flows/checkout.flow";
import { OrderFactory } from "../../factories/order.factory";
import { DomainFactory, type DomainScenario } from "../../factories/domain.factory";
import { matchHostingService } from "../../helpers/records";
import { pickPrice } from "../../helpers/catalog";
import type { Catalog } from "../../flows/catalog.flow";

function randomTier(catalog: Catalog) {
  const tiers = catalog.hostingTiers.length ? catalog.hostingTiers : [catalog.hosting];
  return tiers[Math.floor(Math.random() * tiers.length)];
}

const scenarios: { scenario: DomainScenario; label: string }[] = [
  { scenario: "none", label: "no domain" },
  { scenario: "external", label: "existing domain (no transfer)" },
  { scenario: "register", label: "register new domain" },
  { scenario: "transfer", label: "transfer domain" }
];

test.describe("Category 1 — Hosting orders", () => {
  for (const { scenario, label } of scenarios) {
    test(`random hosting tier + ${label}`, async ({ checkoutDeps, catalog }) => {
      const hostingProduct = randomTier(catalog);
      const result = await hostingOrder(checkoutDeps, { buyer: { kind: "new" }, scenario, hostingProduct });

      // Invoice creation + payment success
      expect(result.checkout.invoice.id).toBeTruthy();
      expect(result.paidInvoice.status, "sandbox payment should mark the invoice PAID").toBe("PAID");

      // Order placed (provisioning runs async; never FAILED right after payment)
      const order = await result.clientApi.getOrder(result.orderId);
      expect(["PENDING", "PROVISIONING", "COMPLETE"]).toContain(order.status);

      // Hosting service exists for the provisioned domain
      const services = await result.clientApi.listServices(false);
      const hosting = matchHostingService(services, result.hostingDomain);
      expect(hosting, `hosting service for ${result.hostingDomain} should exist`).toBeTruthy();
    });
  }

  test("free-domain-with-annual-hosting rule is applied at preview", async ({ api, catalog }) => {
    // Annual hosting + a domain triggers the free-domain discount branch
    // (apps/api orders.service.ts applyFreeDomainDiscount).
    const annual = pickPrice(catalog.hosting, "YEAR_1");
    const domain = DomainFactory.build("register");
    const items = [
      ...OrderFactory.hosting({
        hostingProduct: catalog.hosting,
        billingCycle: "YEAR_1",
        hostingDomain: domain.name,
        scenario: "register",
        domainProduct: catalog.domain
      })
    ];
    const preview = await api.postOk<{ items: Array<{ type: string; unitAmountCents: number; configuration?: Record<string, unknown> }> }>(
      "/orders/preview",
      { items }
    );
    expect(annual.billingCycle).toBe("YEAR_1");
    const domainLine = preview.items.find((i) => i.type === "DOMAIN");
    expect(domainLine, "preview should include the domain line").toBeTruthy();
    const cfg = domainLine?.configuration ?? {};
    // Either the discount applied (cheap domain) or it was evaluated and rejected (>15 EUR).
    const evaluated = "freeDomainApplied" in cfg || "freeDomainEligible" in cfg || "freeDomainReason" in cfg;
    expect(evaluated, "the free-domain rule should have been evaluated for annual hosting").toBe(true);
  });
});
