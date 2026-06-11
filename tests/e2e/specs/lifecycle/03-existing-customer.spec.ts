/**
 * Category 2 — Existing customer orders. The reusable E2E client purchases hosting,
 * VPS, and a hosted-existing-domain combo; we then confirm the items appear in the
 * client's own service/domain listings (the dashboard data source).
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { env } from "../../config/env";
import { hostingOrder, vpsOrder, domainOnlyOrder, type Buyer } from "../../flows/checkout.flow";
import { matchHostingService, matchVpsService, findDomainRecord, serviceType } from "../../helpers/records";

test.describe("Category 2 — Existing customer orders", () => {
  const buyer = (clientApi: import("../../helpers/api-client").ApiClient): Buyer => ({
    kind: "existing",
    api: clientApi,
    email: env.client.email
  });

  test("existing client buys hosting (no domain) → service visible with correct product/status", async ({ checkoutDeps, clientApi, catalog }) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "none", hostingProduct: catalog.hosting });
    expect(result.paidInvoice.status).toBe("PAID");

    const services = await clientApi.listServices(true);
    const hosting = matchHostingService(services, result.hostingDomain);
    expect(hosting, "hosting service should be visible to the client").toBeTruthy();
    expect(serviceType(hosting!)).toBe("SHARED_HOSTING");
    expect(["PENDING", "PROVISIONING", "ACTIVE"]).toContain(hosting!.status);
  });

  test("existing client buys hosting + registered domain → service and domain both visible", async ({ checkoutDeps, clientApi }) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "register" });
    expect(result.paidInvoice.status).toBe("PAID");

    const services = await clientApi.listServices(true);
    expect(matchHostingService(services, result.hostingDomain), "hosting service visible").toBeTruthy();
    expect(findDomainRecord(services, result.hostingDomain), "domain record visible").toBeTruthy();
  });

  test("existing client buys VPS → service appears in dashboard list", async ({ checkoutDeps, clientApi, catalog }) => {
    test.skip(!catalog.vps, "No VPS product");
    const result = await vpsOrder(checkoutDeps, { buyer: buyer(clientApi) });
    expect(result.paidInvoice.status).toBe("PAID");
    expect(matchVpsService(await clientApi.listServices(true)), "VPS service visible").toBeTruthy();
  });

  test("add existing domain and host it: register a domain, then host the same name", async ({ checkoutDeps, clientApi }) => {
    // Step 1 — bring the domain into the system via a domain-only registration.
    const domainResult = await domainOnlyOrder(checkoutDeps, { buyer: buyer(clientApi), action: "register" });
    expect(domainResult.paidInvoice.status).toBe("PAID");
    const domainName = domainResult.domain.name;

    // Step 2 — host that already-registered domain (the platform allows one domain
    // + one hosting service per name; apps/api assertOrderItemsAvailable).
    const hostingResult = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "external", hostingDomain: domainName });
    expect(hostingResult.paidInvoice.status).toBe("PAID");

    const services = await clientApi.listServices(true);
    expect(findDomainRecord(services, domainName), "domain record for the name should exist").toBeTruthy();
    expect(matchHostingService(services, domainName), "hosting service for the same name should exist").toBeTruthy();
  });
});
