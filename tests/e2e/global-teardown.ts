/**
 * Global teardown (runs once after the suite):
 *   1. Sweep every Virtualmin account recorded this run (backstop to per-test cleanup).
 *   2. Restore the SANDBOX gateway to the state captured during global-setup.
 */
import { request } from "@playwright/test";
import { env } from "./config/env";
import { ApiClient } from "./helpers/api-client";
import { restoreSandbox } from "./helpers/gateways";
import { deleteVirtualminDomains } from "./helpers/virtualmin";
import { listCreatedHostingDomains, snapshotRegistry } from "./helpers/teardown-registry";

export default async function globalTeardown(): Promise<void> {
  if (env.flags.teardownHosting) {
    const domains = listCreatedHostingDomains();
    if (domains.length) {
      console.log(`[global-teardown] Sweeping ${domains.length} Virtualmin account(s)...`);
      const results = await deleteVirtualminDomains(domains).catch(() => []);
      const remaining = results.filter((r) => !r.ok && !r.skipped).map((r) => r.domain);
      snapshotRegistry(remaining); // keep only what truly failed, for the next run's sweep
      if (remaining.length) console.warn(`[global-teardown] Could not delete: ${remaining.join(", ")}`);
    }
  }

  if (env.flags.enableSandbox) {
    const context = await request.newContext();
    try {
      const adminApi = new ApiClient(context);
      await adminApi.login(env.admin.email, env.admin.password);
      await restoreSandbox(adminApi);
      console.log("[global-teardown] SANDBOX gateway restored to prior state.");
    } catch (error) {
      console.warn(`[global-teardown] Failed to restore sandbox gateway: ${String(error)}`);
    } finally {
      await context.dispose();
    }
  }
}
