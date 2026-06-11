/**
 * Category 4 — Service provisioning. After a paid order, hosting starts PENDING/
 * PROVISIONING and should reach ACTIVE once Virtualmin finishes (the platform's
 * first-activation logic). We poll /services?refresh=1 (which re-checks the panel)
 * for up to 4 minutes and only fail after the deadline, attaching diagnostics.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { env } from "../../config/env";
import { hostingOrder, vpsOrder, type Buyer } from "../../flows/checkout.flow";
import { matchHostingService, matchVpsService } from "../../helpers/records";
import { waitForHostingActive, waitForHostingSettled, provisioningDiagnostics, waitForVps } from "../../flows/provisioning.flow";
import { attachJson } from "../../helpers/diagnostics";

test.describe("Category 4 — Service provisioning", () => {
  const buyer = (clientApi: import("../../helpers/api-client").ApiClient): Buyer => ({ kind: "existing", api: clientApi, email: env.client.email });

  test("hosting (no domain) provisions: PENDING/PROVISIONING → ACTIVE within 4 minutes", async ({ checkoutDeps, clientApi }, testInfo) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "none" });
    expect(result.paidInvoice.status).toBe("PAID");

    // Initial state right after payment.
    const initial = matchHostingService(await clientApi.listServices(true), result.hostingDomain);
    expect(initial, "service should exist immediately after payment").toBeTruthy();
    expect(["PENDING", "PROVISIONING", "ACTIVE"]).toContain(initial!.status);

    // Poll up to the full provisioning timeout before deciding.
    const wait = await waitForHostingActive(clientApi, result.hostingDomain);
    if (wait.timedOut) {
      await attachJson(testInfo, "provisioning-diagnostics", provisioningDiagnostics(wait));
      await attachJson(testInfo, "service-snapshot", wait.snapshot);
    }
    expect(wait.timedOut, `hosting ${result.hostingDomain} did not reach ACTIVE within ${env.timeouts.provisioningMs}ms`).toBe(false);
    expect(wait.status).toBe("ACTIVE");
  });

  test("hosting + registered domain provisions to ACTIVE", async ({ checkoutDeps, clientApi }, testInfo) => {
    const result = await hostingOrder(checkoutDeps, { buyer: buyer(clientApi), scenario: "register" });
    expect(result.paidInvoice.status).toBe("PAID");

    const wait = await waitForHostingActive(clientApi, result.hostingDomain);
    if (wait.timedOut) {
      const settled = await waitForHostingSettled(clientApi, result.hostingDomain);
      await attachJson(testInfo, "provisioning-diagnostics", provisioningDiagnostics(settled));
      await attachJson(testInfo, "service-snapshot", settled.snapshot);
    }
    expect(wait.timedOut, `hosting ${result.hostingDomain} did not reach ACTIVE in time`).toBe(false);
    expect(wait.status).toBe("ACTIVE");
  });

  test("VPS does not auto-activate (Hetzner module is a stub) — stays PROVISIONING", async ({ checkoutDeps, clientApi, catalog }, testInfo) => {
    test.skip(!catalog.vps, "No VPS product");
    const result = await vpsOrder(checkoutDeps, { buyer: buyer(clientApi) });
    expect(result.paidInvoice.status).toBe("PAID");

    // VPS should settle at PENDING/PROVISIONING (Hetzner stub never activates), never FAILED.
    const wait = await waitForVps(clientApi, new Set(["PENDING", "PROVISIONING", "ACTIVE"]));
    const vps = matchVpsService(wait.snapshot);
    await attachJson(testInfo, "vps-service", vps ?? {});
    expect(vps, "VPS service should exist").toBeTruthy();
    expect(["PENDING", "PROVISIONING"]).toContain(vps!.status);
  });
});
