import { Injectable } from "@nestjs/common";
import { ResellBizClient, credentialsFromEnv, ResellBizApiError } from "../resellbiz-client/resellbiz-api";
import type {
  DomainCustomerContactRequest,
  DomainProvider,
  DomainRegistrationRequest,
  DomainTransferRequest
} from "./provider.types";

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
    const client = resellBizClient();
    const contacts = await registrationContacts(client, request);
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

  async transfer(request: DomainTransferRequest) {
    const client = resellBizClient();
    const contacts = await registrationContacts(client, request);
    const payload = await client.transferDomain({
      ...contacts,
      authCode: request.authCode,
      autoRenew: request.autoRenew ?? true,
      domainName: request.domain,
      extraAttributes: request.extraAttributes,
      invoiceOption: "NoInvoice",
      nameServers: request.nameServers ?? defaultNameServers(),
      protectPrivacy: false,
      purchasePrivacy: false
    });
    const externalId = externalReference(payload) ?? `resellbiz_transfer_${request.domain}`;

    return {
      externalId,
      status: mapDomainActionStatus(payload),
      metadata: { authCodePresent: Boolean(request.authCode), raw: payload, testApi: true }
    };
  }

  async ensureCustomerContact(request: DomainCustomerContactRequest) {
    const client = resellBizClient();
    const customerId = await ensureCustomer(client, request);
    const contactId = await client.addContact({
      ...request,
      company: request.company || "N/A",
      customerId,
      type: "Contact"
    });

    return { contactId, customerId, metadata: { createdContact: true } };
  }
}

async function registrationContacts(client: ResellBizClient, request: DomainRegistrationRequest) {
  if (request.customerContact) {
    const ensured = await ensureCustomerContact(client, request.customerContact);
    return {
      adminContactId: ensured.contactId,
      billingContactId: ensured.contactId,
      customerId: ensured.customerId,
      registrantContactId: ensured.contactId,
      technicalContactId: ensured.contactId
    };
  }

  const fallbackContactId =
    numberFromEnv("RESELLBIZ_TEST_CONTACT_ID") ??
    numberFromEnv("RESELLBIZ_CONTACT_ID") ??
    parsePositiveInteger(request.contactId, "contactId");
  const customerId =
    numberFromEnv("RESELLBIZ_TEST_CUSTOMER_ID") ??
    numberFromEnv("RESELLBIZ_CUSTOMER_ID") ??
    parsePositiveInteger(request.customerId, "customerId");

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

async function ensureCustomerContact(client: ResellBizClient, request: DomainCustomerContactRequest) {
  const customerId = await ensureCustomer(client, request);
  const contactId = await client.addContact({
    ...request,
    company: request.company || "N/A",
    customerId,
    type: "Contact"
  });

  return { contactId, customerId };
}

async function ensureCustomer(client: ResellBizClient, request: DomainCustomerContactRequest) {
  const existingCustomerId = await client.getCustomerIdByEmail(request.email).catch(() => undefined);
  if (existingCustomerId) {
    return existingCustomerId;
  }

  return client.addCustomer({
    ...request,
    company: request.company || request.name,
    password: temporaryCustomerPassword()
  });
}

function resellBizClient() {
  return new ResellBizClient(
    credentialsFromEnv({
      ...process.env,
      RESELLBIZ_API_BASE_URL: process.env.RESELLBIZ_API_BASE_URL ?? "https://test.httpapi.com"
    })
  );
}

function temporaryCustomerPassword() {
  return `Dz${Math.random().toString(36).slice(2, 8)}!9Aa`.slice(0, 16);
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
