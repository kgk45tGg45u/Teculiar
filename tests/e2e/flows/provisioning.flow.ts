/**
 * Provisioning waits. After payment, hosting provisions on Virtualmin and domains
 * on Resell.biz in the background; the client portal's /services?refresh=1 endpoint
 * re-checks the provider on read. We poll that until ACTIVE (or a target status),
 * never sleeping blindly. On timeout the last service snapshot is attached so the
 * failure is diagnosable (Category 4/5 requirement).
 */
import type { ApiClient, ServiceRecord } from "../helpers/api-client";
import { env } from "../config/env";
import { pollUntil } from "../helpers/polling";
import { findDomainRecord, matchDomainService, matchHostingService, matchVpsService } from "../helpers/records";

const ACTIVE = new Set(["ACTIVE"]);
const SETTLED = new Set(["ACTIVE", "FAILED", "PROVISIONING_FAILED"]);

export type ProvisioningWaitResult = { service?: ServiceRecord; status: string; timedOut: boolean; snapshot: ServiceRecord[] };

async function waitForService(
  api: ApiClient,
  match: (services: ServiceRecord[]) => ServiceRecord | undefined,
  accept: Set<string>,
  description: string
): Promise<ProvisioningWaitResult> {
  let snapshot: ServiceRecord[] = [];
  try {
    const services = await pollUntil(
      () => api.listServices(true),
      (list) => {
        snapshot = list;
        const svc = match(list);
        return Boolean(svc && accept.has(svc.status));
      },
      { description }
    );
    const service = match(services);
    return { service, status: service?.status ?? "UNKNOWN", timedOut: false, snapshot: services };
  } catch {
    const service = match(snapshot);
    return { service, status: service?.status ?? "MISSING", timedOut: true, snapshot };
  }
}

/** Wait until the hosting service for `domain` is ACTIVE (up to the provisioning timeout). */
export function waitForHostingActive(api: ApiClient, domain: string): Promise<ProvisioningWaitResult> {
  return waitForService(api, (s) => matchHostingService(s, domain), ACTIVE, `hosting service ${domain} ACTIVE`);
}

/** Wait until the hosting service for `domain` settles (ACTIVE or FAILED), for diagnostics. */
export function waitForHostingSettled(api: ApiClient, domain: string): Promise<ProvisioningWaitResult> {
  return waitForService(api, (s) => matchHostingService(s, domain), SETTLED, `hosting service ${domain} settled`);
}

/**
 * Confirm a hosting account has FINISHED provisioning on the server (ACTIVE or FAILED).
 * Used inside the provisioning gate so the next Virtualmin create-domain only begins once
 * this one is fully done — preventing concurrent Apache-config rebuilds.
 */
export function confirmHostingProvisioned(api: ApiClient, domain: string): Promise<ProvisioningWaitResult> {
  return waitForService(api, (s) => matchHostingService(s, domain), SETTLED, `hosting service ${domain} finished provisioning`);
}

/** Wait until the domain-type service for `domain` is ACTIVE. */
export function waitForDomainActive(api: ApiClient, domain: string): Promise<ProvisioningWaitResult> {
  return waitForService(api, (s) => matchDomainService(s, domain), ACTIVE, `domain service ${domain} ACTIVE`);
}

/** Poll until a VPS service appears and reaches one of `accept` (default PROVISIONING/ACTIVE). */
export function waitForVps(api: ApiClient, accept = new Set(["PROVISIONING", "ACTIVE"])): Promise<ProvisioningWaitResult> {
  return waitForService(api, (s) => matchVpsService(s), accept, "VPS service present");
}

/** Read the current DomainRecord status for `domain` (single fetch). */
export async function domainRecordStatus(api: ApiClient, domain: string): Promise<string | undefined> {
  const services = await api.listServices(true);
  return findDomainRecord(services, domain)?.status;
}

/** Diagnostic bundle captured on provisioning failures (logs/screenshots companion). */
export function provisioningDiagnostics(result: ProvisioningWaitResult): Record<string, unknown> {
  return {
    timedOut: result.timedOut,
    observedStatus: result.status,
    timeoutMs: env.timeouts.provisioningMs,
    matchedService: result.service ? { id: result.service.id, status: result.service.status, externalId: result.service.externalId } : null,
    serviceCount: result.snapshot.length
  };
}
