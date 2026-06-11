/**
 * Matchers for locating services/domains the suite created, used by both the
 * provisioning flows and the dashboard-verification specs. Hosting services key
 * off configuration.domainName / externalId; domains off their DomainRecord.
 */
import type { ServiceRecord } from "./api-client";

export function serviceType(service: ServiceRecord): string | undefined {
  return service.product?.type ?? service.productSnapshot?.type;
}

function configDomain(service: ServiceRecord): string | undefined {
  const value = service.configuration?.domainName;
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

/** A hosting service provisioned under `domain` (SHARED_HOSTING). */
export function matchHostingService(services: ServiceRecord[], domain: string): ServiceRecord | undefined {
  const target = domain.toLowerCase();
  return services.find(
    (s) => serviceType(s) === "SHARED_HOSTING" && (configDomain(s) === target || s.externalId?.toLowerCase() === target)
  );
}

/** A VPS service (matched by product type; VPS has no domain). */
export function matchVpsService(services: ServiceRecord[], productName?: string): ServiceRecord | undefined {
  return services.find((s) => serviceType(s) === "VPS" && (!productName || s.product?.name === productName || s.productSnapshot?.name === productName));
}

/** A domain-type service backing `domain`. */
export function matchDomainService(services: ServiceRecord[], domain: string): ServiceRecord | undefined {
  const target = domain.toLowerCase();
  return services.find((s) => serviceType(s) === "DOMAIN" && (s.domainRecords ?? []).some((r) => r.domain.toLowerCase() === target));
}

/** The DomainRecord for `domain` across any service. */
export function findDomainRecord(
  services: ServiceRecord[],
  domain: string
): { id: string; domain: string; status: string; expiresAt?: string | null } | undefined {
  const target = domain.toLowerCase();
  for (const service of services) {
    const record = (service.domainRecords ?? []).find((r) => r.domain.toLowerCase() === target);
    if (record) return record;
  }
  return undefined;
}
