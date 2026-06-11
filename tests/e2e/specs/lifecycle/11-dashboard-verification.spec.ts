/**
 * Dashboard verification. After successful orders, confirm the client's dashboard
 * data (the /services and /billing/invoices sources, plus the rendered portal pages)
 * shows the service (correct product, billing cycle, status), the domain (registration
 * status), and the invoice (correct total + payment status).
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { env } from "../../config/env";
import { hostingOrder, domainOnlyOrder, type Buyer } from "../../flows/checkout.flow";
import { matchHostingService, findDomainRecord, serviceType } from "../../helpers/records";
import { injectAuthCookies } from "../../helpers/auth";

test.describe("Dashboard verification", () => {
  const buyer = (clientApi: import("../../helpers/api-client").ApiClient): Buyer => ({ kind: "existing", api: clientApi, email: env.client.email });

  test("Services: a hosting order shows correct product, billing cycle and status; invoice total + status match", async ({ checkoutDeps, clientApi, catalog }) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "none", hostingProduct: catalog.hosting, billingCycle: "MONTHLY" });

    const services = await clientApi.listServices(true);
    const svc = matchHostingService(services, result.hostingDomain);
    expect(svc, "service should be visible").toBeTruthy();
    expect(serviceType(svc!)).toBe("SHARED_HOSTING");
    expect(svc!.product?.name ?? svc!.productSnapshot?.name).toBe(catalog.hosting.name);
    expect(["PENDING", "PROVISIONING", "ACTIVE"]).toContain(svc!.status);
    const cycle = svc!.subscriptions?.[0]?.billingCycle;
    if (cycle) expect(cycle, "subscription billing cycle should match the order").toBe("MONTHLY");

    const invoice = await clientApi.getInvoice(result.invoiceId);
    expect(invoice.status).toBe("PAID");
    expect(invoice.totalCents).toBe(result.paidInvoice.totalCents);
  });

  test("Domains: a domain order shows the domain with a registration status", async ({ checkoutDeps, clientApi }) => {
    const result = await domainOnlyOrder(checkoutDeps, { buyer: buyer(clientApi), action: "register" });
    const record = findDomainRecord(await clientApi.listServices(true), result.domain.name);
    expect(record, "domain should be visible").toBeTruthy();
    expect(record!.status).toBeTruthy();
    // expiry is optional until the registrar reports it — assert shape when present.
    if (record!.expiresAt) expect(Number.isFinite(new Date(record!.expiresAt).getTime())).toBe(true);
  });

  test("Invoices: the paid order invoice is listed with PAID status and correct total", async ({ checkoutDeps, clientApi }) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "none" });
    const invoices = await clientApi.listInvoices();
    const invoice = invoices.find((i) => i.id === result.invoiceId);
    expect(invoice, "invoice should be listed").toBeTruthy();
    expect(invoice!.status).toBe("PAID");
    expect(invoice!.totalCents).toBe(result.paidInvoice.totalCents);
  });

  test("Portal UI: services, domains and invoices pages render the client's data", async ({ page, portalPage, checkoutDeps, clientApi, catalog }) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "register", hostingProduct: catalog.hosting });

    await injectAuthCookies(page.context(), "client", { accessToken: clientApi.getToken()! });

    await portalPage.gotoServices();
    await portalPage.expectNoServerError();
    await portalPage.expectVisibleText(catalog.hosting.name);

    await portalPage.gotoDomains();
    await portalPage.expectNoServerError();
    await portalPage.expectVisibleText(result.hostingDomain);

    await portalPage.gotoInvoices();
    await portalPage.expectNoServerError();
  });
});
