import { Injectable } from "@nestjs/common";
import { ResellBizClient, ResellBizApiError } from "../resellbiz-client/resellbiz-api";
import { ModuleRegistryService, resolveNameServers, ResellbizConfig } from "../module-registry/module-registry.service";
import type {
  DomainCustomerContactRequest,
  DomainProvider,
  DomainRenewalRequest,
  DomainRegistrationRequest,
  DomainTransferRequest
} from "./provider.types";

@Injectable()
export class ResellBizProviderService implements DomainProvider {
  constructor(private readonly modules: ModuleRegistryService) {}

  async search(domain: string) {
    return {
      domain,
      available: !domain.startsWith("taken-"),
      premium: domain.endsWith(".io")
    };
  }

  // Build a client from the admin-configured Resell.biz module credentials (API key, Reseller ID,
  // Test/Live base URL). The prod/dev .env is consulted only as a fallback inside the registry.
  private async config(): Promise<ResellbizConfig> {
    return this.modules.resellbiz();
  }

  private clientFrom(config: ResellbizConfig): ResellBizClient {
    if (!config.resellerId) {
      throw new ResellBizApiError("Resell.biz Reseller ID is not configured. Set it in Admin → Products → Modules.");
    }
    if (!config.apiKey) {
      throw new ResellBizApiError("Resell.biz API key is not configured. Set it in Admin → Products → Modules.");
    }
    return new ResellBizClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, resellerId: config.resellerId });
  }

  async register(request: DomainRegistrationRequest) {
    const config = await this.config();
    const client = this.clientFrom(config);
    const contacts = await registrationContacts(client, request);
    const payload = await client.registerDomain({
      ...contacts,
      autoRenew: request.autoRenew ?? true,
      discountAmount: 0,
      domainName: request.domain,
      extraAttributes: request.extraAttributes,
      invoiceOption: "NoInvoice",
      nameServers: resolveNameServers(request.nameServers, config.defaultNs),
      protectPrivacy: false,
      purchasePrivacy: false,
      years: request.years
    });
    const externalId = externalReference(payload) ?? `resellbiz_${request.domain}`;

    return {
      externalId,
      status: mapDomainActionStatus(payload),
      metadata: { raw: payload, testApi: config.mode === "test" }
    };
  }

  async transfer(request: DomainTransferRequest) {
    const config = await this.config();
    const client = this.clientFrom(config);
    const contacts = await registrationContacts(client, request);
    const payload = await client.transferDomain({
      ...contacts,
      authCode: request.authCode,
      autoRenew: request.autoRenew ?? true,
      domainName: request.domain,
      extraAttributes: request.extraAttributes,
      invoiceOption: "NoInvoice",
      nameServers: resolveNameServers(request.nameServers, config.defaultNs),
      protectPrivacy: false,
      purchasePrivacy: false
    });
    const externalId = externalReference(payload) ?? `resellbiz_transfer_${request.domain}`;

    return {
      externalId,
      status: mapDomainActionStatus(payload),
      metadata: { authCodePresent: Boolean(request.authCode), raw: payload, testApi: config.mode === "test" }
    };
  }

  async renew(request: DomainRenewalRequest) {
    const client = this.clientFrom(await this.config());
    const payload = await client.renewDomain({
      autoRenew: request.autoRenew ?? true,
      expDate: request.expDate,
      extraAttributes: request.extraAttributes,
      invoiceOption: "NoInvoice",
      orderId: request.orderId,
      purchasePremiumDns: false,
      purchasePrivacy: false,
      years: request.years
    });
    const externalId = externalReference(payload) ?? `resellbiz_renew_${request.orderId}`;

    return {
      externalId,
      status: mapDomainActionStatus(payload),
      metadata: { domain: request.domain, raw: payload }
    };
  }

  async renewDomain(domain: string, years: number) {
    const client = this.clientFrom(await this.config());
    const summary = await client.getDomainSummary(domain);
    return this.renew({
      domain,
      expDate: expiryAsUnix(summary.expiresAt),
      orderId: summary.orderId,
      years
    });
  }

  async ensureCustomerContact(request: DomainCustomerContactRequest) {
    const client = this.clientFrom(await this.config());
    const customerId = await ensureCustomer(client, request);
    const contactId = await client.addContact({
      ...request,
      company: request.company || "N/A",
      customerId,
      type: "Contact"
    });

    return { contactId, customerId, metadata: { createdContact: true } };
  }

  async status(domain: string) {
    const client = this.clientFrom(await this.config());
    let summary;
    try {
      summary = await client.getDomainSummary(domain);
    } catch (error) {
      // Resell.biz returns {status:"ERROR","message":"Website doesn't exist for <domain>"} when the
      // domain/order is no longer on the panel. That is a DEFINITIVE "gone" signal → CANCELLED.
      // Any other error (HTTP/network/auth) is inconclusive and must be re-thrown so the cron skips
      // the domain instead of wrongly cancelling everything during an outage.
      const message = error instanceof Error ? error.message : String(error);
      if (/does ?n'?t exist|does not exist|no order|not found|no such/i.test(message)) {
        return { externalId: "", expiresAt: undefined as string | undefined, status: "CANCELLED" as const, metadata: { reason: "not_found_on_panel", message } };
      }
      throw error;
    }
    const statusText = [summary.currentStatus, ...summary.domainStatus, ...summary.orderStatus].join(" ").toLowerCase();

    return {
      externalId: String(summary.orderId),
      expiresAt: summary.expiresAt,
      status: /active|invoicepaid|transfer complete/.test(statusText) ? ("ACTIVE" as const) : /failed|deleted|expired/.test(statusText) ? ("FAILED" as const) : ("QUEUED" as const),
      metadata: { expiresAt: summary.expiresAt, raw: summary.raw, status: statusText }
    };
  }
}

function expiryAsUnix(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Math.floor(date.getTime() / 1000);
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

function temporaryCustomerPassword() {
  return `Dz${Math.random().toString(36).slice(2, 8)}!9Aa`.slice(0, 16);
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
