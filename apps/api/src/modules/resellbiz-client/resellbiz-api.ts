import { callResellBiz, ResellBizApiError } from "./resellbiz-http";
import {
  asBoolean,
  asPositiveInteger,
  assertDomainName,
  assertNameServers,
  assertOrderId,
  normalizeDomainSummary
} from "./resellbiz-normalize";
import type {
  FetchLike,
  ParamValue,
  ResellBizCredentials,
  ResellBizDomainSummary,
  ResellBizDomainTarget,
  ResellBizMethod,
  RegisterDomainInput,
  TransferDomainInput
} from "./resellbiz-types";
import { DEFAULT_DETAIL_OPTIONS } from "./resellbiz-types";

export {
  buildResellBizRequest,
  callResellBiz,
  credentialsFromEnv,
  ResellBizApiError,
  resolveResellBizBaseUrl
} from "./resellbiz-http";
export type {
  FetchLike,
  ParamPrimitive,
  ParamValue,
  ResellBizCredentials,
  ResellBizDomainSummary,
  ResellBizDomainTarget,
  ResellBizMethod,
  ResellBizRequest,
  RegisterDomainInput,
  TransferDomainInput
} from "./resellbiz-types";

export class ResellBizClient {
  constructor(
    private readonly credentials: ResellBizCredentials,
    private readonly fetcher: FetchLike = globalThis.fetch
  ) {}

  async getOrderId(domainName: string): Promise<number> {
    assertDomainName(domainName);
    const payload = await this.call<unknown>("GET", "/api/domains/orderid.json", {
      "domain-name": domainName
    });

    return asPositiveInteger(payload, "order id");
  }

  async getDomainDetailsByOrderId(
    orderId: number,
    options: string[] = DEFAULT_DETAIL_OPTIONS
  ): Promise<Record<string, unknown>> {
    const payload = await this.call<unknown>("GET", "/api/domains/details.json", {
      "order-id": assertOrderId(orderId),
      options
    });

    if (!isRecord(payload)) {
      throw new ResellBizApiError("Resell.biz details response was not an object.", payload);
    }

    return payload;
  }

  async getDomainSummary(domainName: string): Promise<ResellBizDomainSummary> {
    const orderId = await this.getOrderId(domainName);
    const details = await this.getDomainDetailsByOrderId(orderId);

    return normalizeDomainSummary(orderId, domainName, details);
  }

  async getTransferCode(target: ResellBizDomainTarget): Promise<string | undefined> {
    const orderId = await this.resolveOrderId(target);
    const details = await this.getDomainDetailsByOrderId(orderId, ["OrderDetails"]);
    const code = details.domsecret;

    return typeof code === "string" && code.length > 0 ? code : undefined;
  }

  async changeNameServers(
    target: ResellBizDomainTarget,
    nameServers: string[],
    auth?: { otp?: number; twoFactorType?: "email" }
  ): Promise<unknown> {
    assertNameServers(nameServers);
    const orderId = await this.resolveOrderId(target);

    return this.call("POST", "/api/domains/modify-ns.json", {
      "2fa-type": auth?.twoFactorType,
      ns: nameServers,
      "order-id": orderId,
      otp: auth?.otp
    });
  }

  async validateTransfer(domainName: string): Promise<boolean> {
    assertDomainName(domainName);
    const payload = await this.call<unknown>("GET", "/api/domains/validate-transfer.json", {
      "domain-name": domainName
    });

    return asBoolean(payload);
  }

  async registerDomain(input: RegisterDomainInput): Promise<unknown> {
    assertDomainName(input.domainName);
    assertNameServers(input.nameServers);

    const params: Record<string, ParamValue> = {
      "admin-contact-id": assertOrderId(input.adminContactId),
      "auto-renew": input.autoRenew,
      "billing-contact-id": assertOrderId(input.billingContactId),
      "customer-id": assertOrderId(input.customerId),
      "domain-name": input.domainName,
      "invoice-option": input.invoiceOption,
      ns: input.nameServers,
      "protect-privacy": input.protectPrivacy,
      "purchase-privacy": input.purchasePrivacy,
      "reg-contact-id": assertOrderId(input.registrantContactId),
      "tech-contact-id": assertOrderId(input.technicalContactId),
      years: assertOrderId(input.years)
    };

    let attrIndex = 1;
    for (const [name, value] of Object.entries(input.extraAttributes ?? {})) {
      params[`attr-name${attrIndex}`] = name;
      params[`attr-value${attrIndex}`] = value;
      attrIndex += 1;
    }

    return this.call("POST", "/api/domains/register.json", params);
  }

  async transferDomain(input: TransferDomainInput): Promise<unknown> {
    assertDomainName(input.domainName);
    if (input.nameServers) {
      assertNameServers(input.nameServers);
    }

    const params: Record<string, ParamValue> = {
      "admin-contact-id": assertOrderId(input.adminContactId),
      "auth-code": input.authCode,
      "auto-renew": input.autoRenew,
      "billing-contact-id": assertOrderId(input.billingContactId),
      "customer-id": assertOrderId(input.customerId),
      "domain-name": input.domainName,
      "invoice-option": input.invoiceOption,
      ns: input.nameServers,
      "protect-privacy": input.protectPrivacy,
      "purchase-premium-dns": input.purchasePremiumDns,
      "purchase-privacy": input.purchasePrivacy,
      "reg-contact-id": assertOrderId(input.registrantContactId),
      "tech-contact-id": assertOrderId(input.technicalContactId)
    };

    let attrIndex = 1;
    for (const [name, value] of Object.entries(input.extraAttributes ?? {})) {
      params[`attr-name${attrIndex}`] = name;
      params[`attr-value${attrIndex}`] = value;
      attrIndex += 1;
    }

    return this.call("POST", "/api/domains/transfer.json", params);
  }

  private async resolveOrderId(target: ResellBizDomainTarget): Promise<number> {
    if ("orderId" in target) {
      return assertOrderId(target.orderId);
    }

    return this.getOrderId(target.domainName);
  }

  private call<T>(method: ResellBizMethod, path: string, params?: Record<string, ParamValue>): Promise<T> {
    return callResellBiz<T>(this.credentials, method, path, params, this.fetcher);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
