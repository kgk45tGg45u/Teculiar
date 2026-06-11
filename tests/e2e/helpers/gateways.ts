/**
 * Sandbox gateway control. The SANDBOX storefront gateway gives deterministic,
 * synchronous "payment succeeded" without touching real money — essential for
 * full-lifecycle tests. We enable it for the run and restore its prior state on
 * teardown so production is left exactly as we found it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../config/env";
import type { ApiClient } from "./api-client";

const stateFile = resolve(process.cwd(), env.artifacts.gatewayStateFile);

function persistPriorState(enabled: boolean): void {
  const dir = dirname(stateFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ sandboxEnabled: enabled }), "utf8");
}

function readPriorState(): boolean | undefined {
  if (!existsSync(stateFile)) return undefined;
  try {
    return Boolean((JSON.parse(readFileSync(stateFile, "utf8")) as { sandboxEnabled?: boolean }).sandboxEnabled);
  } catch {
    return undefined;
  }
}

/** Enable the SANDBOX gateway, recording its prior enabled state for restoration. */
export async function ensureSandboxEnabled(adminApi: ApiClient): Promise<{ wasEnabled: boolean }> {
  const gateways = await adminApi.adminGateways();
  const sandbox = gateways.find((g) => g.method === "SANDBOX");
  const wasEnabled = Boolean(sandbox?.enabled);
  persistPriorState(wasEnabled);
  if (!wasEnabled) {
    await adminApi.updateGateways([{ method: "SANDBOX", enabled: true }]);
  }
  return { wasEnabled };
}

/** Restore the SANDBOX gateway to the state captured by {@link ensureSandboxEnabled}. */
export async function restoreSandbox(adminApi: ApiClient): Promise<void> {
  const prior = readPriorState();
  if (prior === undefined) return; // never toggled — leave as-is
  await adminApi.updateGateways([{ method: "SANDBOX", enabled: prior }]);
}
