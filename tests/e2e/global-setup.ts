/**
 * Global setup (runs once before the suite):
 *   1. Validate credentials early with a clear error.
 *   2. Sweep any Virtualmin accounts orphaned by a previously crashed run.
 *   3. Enable the SANDBOX gateway for deterministic payments, recording its prior
 *      state so global-teardown can restore it (production left as found).
 */
import { request } from "@playwright/test";
import { env, requireCredentials } from "./config/env";
import { ApiClient } from "./helpers/api-client";
import { ensureSandboxEnabled } from "./helpers/gateways";
import { deleteVirtualminDomains } from "./helpers/virtualmin";
import { listCreatedHostingDomains, resetRegistry } from "./helpers/teardown-registry";
import { resetProvisionGate } from "./helpers/provision-gate";

export default async function globalSetup(): Promise<void> {
  requireCredentials();
  resetProvisionGate();

  // Best-effort sweep of leftovers from a prior crashed run, then start clean.
  const orphans = listCreatedHostingDomains();
  if (orphans.length && env.flags.teardownHosting) {
    console.log(`[global-setup] Sweeping ${orphans.length} orphaned Virtualmin account(s) from a previous run...`);
    await deleteVirtualminDomains(orphans).catch(() => undefined);
  }
  resetRegistry();

  const context = await request.newContext();
  try {
    const adminApi = new ApiClient(context);
    await adminApi.login(env.admin.email, env.admin.password);

    if (env.flags.enableSandbox) {
      const { wasEnabled } = await ensureSandboxEnabled(adminApi);
      console.log(`[global-setup] SANDBOX gateway ${wasEnabled ? "already enabled" : "enabled for this run (will be restored)"}.`);
    }
  } finally {
    await context.dispose();
  }
}
