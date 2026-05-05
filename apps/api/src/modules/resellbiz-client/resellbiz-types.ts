export type ResellBizMethod = "GET" | "POST";

export type ParamPrimitive = boolean | number | string;
export type ParamValue = ParamPrimitive | ParamPrimitive[] | null | undefined;
export type FetchLike = (url: URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_DETAIL_OPTIONS = ["OrderDetails", "NsDetails", "DomainStatus", "StatusDetails"];

export type ResellBizRequest = {
  body?: URLSearchParams;
  headers: Record<string, string>;
  method: ResellBizMethod;
  url: URL;
};

export type ResellBizCredentials = {
  apiKey: string;
  baseUrl?: string;
  resellerId: string;
};

export type ResellBizDomainTarget = { domainName: string } | { orderId: number };

export type ResellBizDomainSummary = {
  createdAt?: string;
  currentStatus?: string;
  domainName: string;
  domainStatus: string[];
  expiresAt?: string;
  nameServers: string[];
  orderId: number;
  orderStatus: string[];
  raw: Record<string, unknown>;
  transferCode?: string;
};

export type ResellBizDomainPriceAction = "register" | "transfer" | "renew";

export type ResellBizDomainPrice = {
  action: ResellBizDomainPriceAction;
  amountCents: number;
  tld: string;
  years: number;
};

export type ResellBizCustomerInput = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  company?: string;
  country: string;
  email: string;
  name: string;
  password: string;
  phone: string;
  phoneCountryCode: string;
  state?: string;
  vatId?: string;
  zipCode: string;
};

export type ResellBizContactInput = Omit<ResellBizCustomerInput, "password" | "vatId"> & {
  customerId: number;
  type?: string;
};

export type TransferDomainInput = {
  adminContactId: number;
  authCode?: string;
  autoRenew: boolean;
  billingContactId: number;
  customerId: number;
  domainName: string;
  extraAttributes?: Record<string, ParamPrimitive>;
  invoiceOption: "KeepInvoice" | "NoInvoice" | "OnlyAdd" | "PayInvoice";
  nameServers?: string[];
  protectPrivacy?: boolean;
  purchasePremiumDns?: boolean;
  purchasePrivacy?: boolean;
  registrantContactId: number;
  technicalContactId: number;
};

export type RegisterDomainInput = {
  adminContactId: number;
  autoRenew: boolean;
  billingContactId: number;
  customerId: number;
  domainName: string;
  extraAttributes?: Record<string, ParamPrimitive>;
  invoiceOption: "KeepInvoice" | "NoInvoice" | "OnlyAdd" | "PayInvoice";
  nameServers: string[];
  protectPrivacy?: boolean;
  purchasePrivacy?: boolean;
  registrantContactId: number;
  technicalContactId: number;
  years: number;
};
