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
  ResellBizContactInput,
  ResellBizCustomerInput,
  ResellBizDomainPrice,
  ResellBizDomainPriceAction,
  ResellBizDomainSummary,
  ResellBizDomainTarget,
  ResellBizMethod,
  RegisterDomainInput,
  RenewDomainInput,
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
  ResellBizContactInput,
  ResellBizCustomerInput,
  ResellBizDomainPrice,
  ResellBizDomainPriceAction,
  ResellBizDomainSummary,
  ResellBizDomainTarget,
  ResellBizMethod,
  ResellBizRequest,
  RegisterDomainInput,
  RenewDomainInput,
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

  async getCustomerDomainPrices(customerId?: number): Promise<ResellBizDomainPrice[]> {
    const payload = await this.call<unknown>("GET", "/api/products/customer-price.json", {
      "customer-id": customerId
    });

    return parseCustomerDomainPrices(payload);
  }

  async addCustomer(input: ResellBizCustomerInput): Promise<number> {
    const payload = await this.call<unknown>("POST", "/api/customers/signup.json", {
      "address-line-1": input.addressLine1,
      "address-line-2": input.addressLine2,
      city: input.city,
      company: input.company,
      country: input.country,
      "lang-pref": "en",
      name: input.name,
      passwd: input.password,
      phone: input.phone,
      "phone-cc": input.phoneCountryCode,
      state: input.state,
      username: input.email,
      "vat-id": input.vatId,
      zipcode: input.zipCode
    });

    return asPositiveInteger(payload, "customer id");
  }

  async getCustomerIdByEmail(email: string): Promise<number | undefined> {
    const payload = await this.call<unknown>("GET", "/api/customers/details.json", {
      username: email
    });
    if (!isRecord(payload)) {
      return undefined;
    }

    const id = payload.customerid ?? payload["customer-id"] ?? payload.entityid;
    return typeof id === "number" || typeof id === "string" ? asPositiveInteger(id, "customer id") : undefined;
  }

  async addContact(input: ResellBizContactInput): Promise<number> {
    const payload = await this.call<unknown>("POST", "/api/contacts/add.json", {
      "address-line-1": input.addressLine1,
      "address-line-2": input.addressLine2,
      city: input.city,
      company: input.company ?? "N/A",
      country: input.country,
      "customer-id": input.customerId,
      email: input.email,
      name: input.name,
      phone: input.phone,
      "phone-cc": input.phoneCountryCode,
      state: input.state,
      type: input.type ?? "Contact",
      zipcode: input.zipCode
    });

    return asPositiveInteger(payload, "contact id");
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

  async renewDomain(input: RenewDomainInput): Promise<unknown> {
    const params: Record<string, ParamValue> = {
      "auto-renew": input.autoRenew,
      "discount-amount": input.discountAmount,
      "exp-date": assertOrderId(input.expDate),
      "invoice-option": input.invoiceOption,
      "order-id": assertOrderId(input.orderId),
      "purchase-premium-dns": input.purchasePremiumDns,
      "purchase-privacy": input.purchasePrivacy,
      years: assertOrderId(input.years)
    };

    let attrIndex = 1;
    for (const [name, value] of Object.entries(input.extraAttributes ?? {})) {
      params[`attr-name${attrIndex}`] = name;
      params[`attr-value${attrIndex}`] = value;
      attrIndex += 1;
    }

    return this.call("POST", "/api/domains/renew.json", params);
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

export function parseCustomerDomainPrices(payload: unknown): ResellBizDomainPrice[] {
  if (!isRecord(payload)) {
    return [];
  }

  const prices: ResellBizDomainPrice[] = [];
  for (const [productKey, value] of Object.entries(payload)) {
    const tld = productKeyToTld(productKey);
    if (!tld || !isRecord(value)) {
      continue;
    }

    collectTenurePrices(prices, tld, "register", value.addnewdomain);
    collectTenurePrices(prices, tld, "transfer", value.addtransferdomain);
    collectTenurePrices(prices, tld, "renew", value.renewdomain);
  }

  return prices.sort(
    (a, b) => a.tld.localeCompare(b.tld) || actionOrder(a.action) - actionOrder(b.action) || a.years - b.years
  );
}

function collectTenurePrices(
  prices: ResellBizDomainPrice[],
  tld: string,
  action: ResellBizDomainPriceAction,
  value: unknown
) {
  if (!isRecord(value)) {
    return;
  }

  for (const [years, amount] of Object.entries(value)) {
    const parsedYears = Number.parseInt(years, 10);
    const amountCents = moneyToCents(amount);
    if (Number.isInteger(parsedYears) && parsedYears > 0 && amountCents !== undefined) {
      prices.push({ action, amountCents, tld, years: parsedYears });
    }
  }
}

function productKeyToTld(productKey: string) {
  const normalized = productKey.toLowerCase().trim();
  const knownProductKeys: Record<string, string> = {
    dombiz: "biz",
    domcno: "com",
    dominfo: "info",
    domorg: "org",
    domus: "us"
  };
  if (knownProductKeys[normalized]) {
    return knownProductKeys[normalized];
  }
  if (/^dot[a-z0-9]+$/.test(normalized)) {
    return normalized.slice(3);
  }
  if (/^\.[a-z0-9.-]+$/.test(normalized)) {
    return normalized.slice(1);
  }
  if (
    /^[a-z0-9-]{2,63}$/.test(normalized) &&
    !["hosting", "email", "mail", "server", "websitebuilder"].some((word) => normalized.includes(word))
  ) {
    return normalized;
  }

  return undefined;
}

function moneyToCents(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function actionOrder(action: ResellBizDomainPriceAction) {
  return { register: 1, transfer: 2, renew: 3 }[action];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
