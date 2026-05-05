import { ResellBizApiError } from "./resellbiz-http";
import type { ResellBizDomainSummary } from "./resellbiz-types";

export function normalizeDomainSummary(
  orderId: number,
  fallbackDomainName: string,
  raw: Record<string, unknown>
): ResellBizDomainSummary {
  return {
    createdAt: dateFromOrderBox(raw.creationtime),
    currentStatus: asOptionalString(raw.currentstatus),
    domainName: asOptionalString(raw.domainname) ?? fallbackDomainName,
    domainStatus: asStringList(raw.domainstatus),
    expiresAt: dateFromOrderBox(raw.endtime),
    nameServers: nameServersFrom(raw),
    orderId,
    orderStatus: asStringList(raw.orderstatus),
    raw,
    transferCode: asOptionalString(raw.domsecret)
  };
}

export function asPositiveInteger(value: unknown, label: string): number {
  const numberValue = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ResellBizApiError(`Invalid ${label} returned by Resell.biz.`, value);
  }

  return numberValue;
}

export function assertOrderId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Order and contact IDs must be positive integers.");
  }

  return value;
}

export function assertDomainName(domainName: string): void {
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z0-9.-]+$/i.test(domainName)) {
    throw new Error("Domain name must look like example.com.");
  }
}

export function assertNameServers(nameServers: string[]): void {
  if (nameServers.length < 2 || nameServers.length > 13) {
    throw new Error("Provide between 2 and 13 name servers.");
  }

  for (const nameServer of nameServers) {
    assertDomainName(nameServer);
  }
}

export function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new ResellBizApiError("Resell.biz boolean response was not true or false.", value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

function dateFromOrderBox(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function nameServersFrom(raw: Record<string, unknown>): string[] {
  const nameServers: string[] = [];

  for (let index = 1; index <= 13; index += 1) {
    const nameServer = raw[`ns${index}`];
    if (typeof nameServer === "string" && nameServer.length > 0) {
      nameServers.push(nameServer);
    }
  }

  return nameServers;
}
