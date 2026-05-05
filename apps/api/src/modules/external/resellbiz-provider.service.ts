import { Injectable } from "@nestjs/common";
import { ResellBizClient, credentialsFromEnv, ResellBizApiError } from "../resellbiz-client/resellbiz-api";
import type { DomainProvider, DomainRegistrationRequest } from "./provider.types";

@Injectable()
export class ResellBizProviderService implements DomainProvider {
  async search(domain: string) {
    return {
      domain,
      available: !domain.startsWith("taken-"),
      premium: domain.endsWith(".io")
    };
  }

  async register(request: DomainRegistrationRequest) {
    const client = new ResellBizClient(
      credentialsFromEnv({
        ...process.env,
        RESELLBIZ_API_BASE_URL: process.env.RESELLBIZ_API_BASE_URL ?? "https://test.httpapi.com"
      })
    );
    const contacts = registrationContacts(request.contactId);
    const payload = await client.registerDomain({
      ...contacts,
      autoRenew: request.autoRenew ?? true,
      domainName: request.domain,
      extraAttributes: request.extraAttributes,
      invoiceOption: "NoInvoice",
      nameServers: request.nameServers ?? defaultNameServers(),
      protectPrivacy: false,
      purchasePrivacy: false,
      years: request.years
    });
    const externalId = externalReference(payload) ?? `resellbiz_${request.domain}`;

    return {
      externalId,
      status: mapDomainActionStatus(payload),
      metadata: { raw: payload, testApi: true }
    };
  }

  async transfer(domain: string, authCode: string, contactId: string) {
    return {
      externalId: `resellbiz_transfer_${domain}`,
      status: "QUEUED" as const,
      metadata: { authCodePresent: Boolean(authCode), contactId }
    };
  }
}

function registrationContacts(contactId?: string) {
  const fallbackContactId = numberFromEnv("RESELLBIZ_TEST_CONTACT_ID") ?? parsePositiveInteger(contactId, "contactId");
  const customerId = numberFromEnv("RESELLBIZ_TEST_CUSTOMER_ID") ?? numberFromEnv("RESELLBIZ_CUSTOMER_ID");

  if (!customerId) {
    throw new ResellBizApiError("Missing RESELLBIZ_TEST_CUSTOMER_ID for test domain registrations.");
  }
  if (!fallbackContactId) {
    throw new ResellBizApiError("Missing RESELLBIZ_TEST_CONTACT_ID for test domain registrations.");
  }

  return {
    adminContactId: numberFromEnv("RESELLBIZ_TEST_ADMIN_CONTACT_ID") ?? fallbackContactId,
    billingContactId: numberFromEnv("RESELLBIZ_TEST_BILLING_CONTACT_ID") ?? fallbackContactId,
    customerId,
    registrantContactId: numberFromEnv("RESELLBIZ_TEST_REG_CONTACT_ID") ?? fallbackContactId,
    technicalContactId: numberFromEnv("RESELLBIZ_TEST_TECH_CONTACT_ID") ?? fallbackContactId
  };
}

function defaultNameServers() {
  const combined = process.env.RESELLBIZ_DEFAULT_NS?.split(",").map((value) => value.trim()).filter(Boolean);
  if (combined && combined.length > 0) {
    return combined;
  }

  return [
    process.env.RESELLBIZ_DEFAULT_NS1 ?? "ns1.dezhost.test",
    process.env.RESELLBIZ_DEFAULT_NS2 ?? "ns2.dezhost.test"
  ];
}

function numberFromEnv(key: string) {
  return parsePositiveInteger(process.env[key], key);
}

function parsePositiveInteger(value: string | undefined, label: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ResellBizApiError(`${label} must be a positive integer.`);
  }

  return parsed;
}

function externalReference(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const reference = payload.entityid ?? payload.orderid ?? payload.eaqid;
  return typeof reference === "string" || typeof reference === "number" ? String(reference) : undefined;
}

function mapDomainActionStatus(payload: unknown) {
  if (!isRecord(payload)) {
    return "QUEUED" as const;
  }

  const status = String(payload.actionstatus ?? payload.status ?? "").toLowerCase();
  if (["success", "successful", "active"].includes(status)) {
    return "ACTIVE" as const;
  }
  if (["failed", "error"].includes(status)) {
    return "FAILED" as const;
  }

  return "QUEUED" as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
