/**
 * Category 5 — Domain provisioning. We verify the domain appears in the dashboard,
 * the registrar action progresses using the platform's own status checks
 * (/services?refresh=1 re-queries Resell.biz), and the status reaches ACTIVE or is
 * still legitimately in progress (never FAILED). ACTIVE may depend on registrar
 * propagation in the test API, so we accept in-progress states but fail on FAILED.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { env } from "../../config/env";
import { domainOnlyOrder, type Buyer } from "../../flows/checkout.flow";
import { findDomainRecord } from "../../helpers/records";
import { waitForDomainActive, domainRecordStatus } from "../../flows/provisioning.flow";
import { attachJson } from "../../helpers/diagnostics";

test.describe("Category 5 — Domain provisioning", () => {
  const buyer = (clientApi: import("../../helpers/api-client").ApiClient): Buyer => ({ kind: "existing", api: clientApi, email: env.client.email });

  test("registered domain appears and progresses toward ACTIVE", async ({ checkoutDeps, clientApi }, testInfo) => {
    const result = await domainOnlyOrder(checkoutDeps, { buyer: buyer(clientApi), action: "register" });
    expect(result.paidInvoice.status).toBe("PAID");

    // Domain visible in the dashboard data source.
    expect(findDomainRecord(await clientApi.listServices(true), result.domain.name), "domain should be visible").toBeTruthy();

    const wait = await waitForDomainActive(clientApi, result.domain.name);
    const status = wait.timedOut ? await domainRecordStatus(clientApi, result.domain.name) : "ACTIVE";
    await attachJson(testInfo, "domain-status", { domain: result.domain.name, status, timedOut: wait.timedOut });

    expect(status, "domain registration must not have FAILED").not.toBe("FAILED");
    expect(["ACTIVE", "PENDING", "TRANSFERRING", "PENDING_TRANSFER"]).toContain(status);
  });

  test("transferred domain appears with a valid transfer status", async ({ checkoutDeps, clientApi }, testInfo) => {
    const result = await domainOnlyOrder(checkoutDeps, { buyer: buyer(clientApi), action: "transfer" });
    expect(result.paidInvoice.status).toBe("PAID");

    const record = findDomainRecord(await clientApi.listServices(true), result.domain.name);
    expect(record, "domain should be visible").toBeTruthy();
    await attachJson(testInfo, "domain-status", { domain: result.domain.name, status: record?.status });
    expect(record!.status, "transfer must not have FAILED").not.toBe("FAILED");
    expect(["PENDING", "PENDING_TRANSFER", "TRANSFERRING", "ACTIVE"]).toContain(record!.status);
  });
});
