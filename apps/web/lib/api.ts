import { formatCustomerNumber } from "@dezhost/shared";
import { CURRENCY_COOKIE, LOCALE_COOKIE, browserLocale, type Currency, type Locale } from "./i18n";

export { formatCustomerNumber };

export type ApiProduct = {
  category?: ApiProductCategory | null;
  categoryId?: string | null;
  id: string;
  name: string;
  slug: string;
  type: "DOMAIN" | "SHARED_HOSTING" | "VPS" | string;
  description: string;
  homepageVisible?: boolean;
  minimumPriceCents?: number;
  provisioningModule?: string | null;
  sortOrder?: number;
  prices: Array<{
    id: string;
    billingCycle: string;
    amountCents: number;
    setupFeeCents: number;
    currency: string;
  }>;
  configs?: Array<{ key: string; label: string; values: unknown[]; required: boolean }>;
};

export type ApiProductCategory = {
  active?: boolean;
  description?: string | null;
  id: string;
  name: string;
  products?: ApiProduct[];
  provisioningModule?: string | null;
  slug: string;
  sortOrder?: number;
};

export type ApiPaymentGateway = {
  config?: {
    accountHolder?: string;
    bankName?: string;
    bic?: string;
    clientId?: string;
    iban?: string;
    mode?: string;
    referenceNote?: string;
  };
  method: "CREDIT_CARD" | "PAYPAL" | "SEPA" | "BANK_TRANSFER" | string;
  title: string;
};

export type ApiModule = {
  name: string;
  label: string;
  description: string;
  active: boolean;
  config: Record<string, unknown>;
};

export type ApiOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  placedAt: string;
  user?: { email: string; name: string };
  invoice?: {
    finalInvoiceNumber?: string | null;
    id: string;
    invoiceNumber: string;
    status: string;
    tempInvoiceNumber?: string | null;
    totalCents: number;
  };
  items: Array<{
    id: string;
    description: string;
    domainName?: string | null;
    provisioningStatus: string;
    providerReference?: string | null;
    type: string;
  }>;
};

export type ApiDomainSearch = {
  action: "register" | "transfer";
  available: boolean;
  domain: string;
  error?: string;
  price: { amountCents: number; error?: string; source: string; tld: string };
  productId?: string;
  source: string;
  suggestions: ApiDomainSearchResult[];
  tld: string;
};

export type ApiDomainSearchResult = Omit<ApiDomainSearch, "suggestions">;

export type ApiDomainPrice = {
  action: string;
  amountCents: number;
  currency: string;
  manual: boolean;
  suggested: boolean;
  tld: string;
  updatedAt: string;
  years: number;
};

export type ApiService = {
  configuration?: Record<string, unknown>;
  domainRecords?: Array<{ id?: string; domain: string; status: string; externalId?: string | null }>;
  externalId?: string | null;
  id: string;
  status: string;
  renewsAt?: string | null;
  product: { name: string; type: string };
  productPrice: { amountCents: number; billingCycle: string; currency: string };
};

export type ApiInvoice = {
  customerSnapshot?: {
    address?: { city?: string; line1?: string; postalCode?: string; state?: string };
    companyName?: string;
    countryCode?: string;
    customerNumber?: number | string | null;
    email?: string;
    name?: string;
    phone?: string;
    vatId?: string;
  };
  discountCents?: number;
  footerLines?: string[];
  id: string;
  invoiceNumber: string;
  tempInvoiceNumber?: string | null;
  finalInvoiceNumber?: string | null;
  sellerSnapshot?: {
    address?: string;
    bankDetails?: string;
    city?: string;
    companyName?: string;
    country?: string;
    email?: string;
    logoUrl?: string;
    paymentInstructions?: string;
    phone?: string;
    vatNumber?: string;
    zip?: string;
  };
  items?: Array<{
    billingCycle?: string | null;
    description: string;
    discountCents: number;
    quantity: number;
    subtotalCents: number;
    taxAmountCents: number;
    taxRate: number;
    totalCents: number;
    unitAmountCents: number;
    servicePeriodEnd?: string | null;
    servicePeriodStart?: string | null;
  }>;
  transactions?: Array<{
    createdAt: string;
    method: string;
    providerReference: string;
    status: string;
  }>;
  user?: { customerNumber?: number | null };
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string | null;
  subtotalCents?: number;
  taxAmountCents?: number;
  taxReason?: string | null;
  totalCents: number;
  currency: string;
};

export type ApiClient = {
  balanceCents?: number;
  contacts?: Array<{ address?: { city?: string; line1?: string; postalCode?: string; state?: string }; phone?: string | null }>;
  countryCode: string;
  customerNumber?: number | null;
  customerType: string;
  domainRecords?: Array<{ id: string; domain: string; status: string }>;
  email: string;
  id: string;
  invoices?: ApiInvoice[];
  name: string;
  orders?: ApiOrder[];
  segment: string;
  services?: ApiService[];
  vatId?: string | null;
};

export type ApiTicket = {
  id: string;
  publicId?: string;
  createdAt?: string;
  department: string;
  priority?: string;
  subject: string;
  status: string;
  updatedAt: string;
  user?: { email?: string; name?: string } | null;
  service?: { id?: string; product?: { name: string } } | null;
  replies?: Array<{
    attachments?: ApiTicketAttachment[];
    body: string;
    createdAt: string;
    id: string;
    internal?: boolean;
    user?: { email?: string; name?: string } | null;
    userId?: string;
  }>;
  attachments?: ApiTicketAttachment[];
};

export type ApiTicketAttachment = {
  fileName: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

export type ApiKnowledgebaseArticle = {
  body: string;
  createdAt?: string;
  excerpt?: string | null;
  id: string;
  images?: string[] | unknown;
  keywords?: string[];
  published?: boolean;
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug: string;
  title: string;
  updatedAt?: string;
};

export type ApiActionLog = {
  action: string;
  actor?: { email: string; id: string; name: string } | null;
  createdAt: string;
  id: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  source: "audit" | "module" | string;
  status: string;
  subject: string;
  subjectId?: string | null;
};

export type ApiEmailLog = {
  createdAt: string;
  id: string;
  payload?: {
    from?: string;
    html?: string;
    recipientType?: "admin" | "client" | string;
    smtpDelivery?: { error?: string; mode?: string; response?: string; status?: string };
    text?: string;
  } | null;
  sentAt?: string | null;
  status: string;
  subject: string;
  template?: string | null;
  to: string;
  user?: { email?: string; id: string; name?: string } | null;
};

export type ApiEmailLayoutBlock = {
  columns?: string[];
  content?: string;
  href?: string;
  id: string;
  rows?: Array<{ cells?: string[]; label?: string; value?: string }>;
  title?: string;
  tone?: "danger" | "default" | "success" | "warning";
  type: "button" | "divider" | "invoiceTable" | "keyValueTable" | "notice" | "text";
};

export type ApiEmailAdminSettings = {
  blockLibrary?: Array<{ description: string; label: string; type: ApiEmailLayoutBlock["type"] }>;
  events: Array<{
    body: string;
    defaultRecipients: Array<"admin" | "client">;
    enabled: boolean;
    key: string;
    layoutBlocks: ApiEmailLayoutBlock[];
    recipients: Array<"admin" | "client">;
    subject: string;
    trigger: string;
  }>;
  logs: ApiEmailLog[];
  placeholders: Array<{ description: string; key: string }>;
  smtp: {
    adminEmails?: string[];
    enabled?: boolean;
    fromEmail?: string;
    fromName?: string;
    host?: string;
    password?: string;
    port?: number;
    replyTo?: string;
    secure?: boolean;
    username?: string;
  };
  templateHtml: string;
  testVariables: Record<string, unknown>;
};

export type ApiAnnouncement = {
  body?: string;
  id: string;
  hiddenAt?: string | null;
  isRead?: boolean;
  locale?: string;
  publishedAt?: string;
  readAt?: string | null;
  title: string;
  excerpt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type ApiBlogPost = {
  category?: string | null;
  categories?: string[];
  categoryIds?: string[];
  content?: {
    aiBrief?: Record<string, unknown>;
    body?: string;
    category?: string;
    featureImage?: string;
    images?: string[];
    keywords?: string[];
    postType?: "manual" | "ai_generated" | string;
    published?: boolean;
    tags?: string[];
  };
  excerpt?: string | null;
  featureImage?: string | null;
  id: string;
  locale: string;
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  slug: string;
  tagIds?: string[];
  tags?: string[];
  title: string;
  updatedAt?: string;
};

export type ApiBlogCategory = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type ApiBlogTag = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

// Exchange rate cache populated from storefront settings
let _usdExchangeRate = 1.0;
let _usdBufferCents = 0;

export function initExchangeRate(rate: number, bufferCents: number) {
  _usdExchangeRate = rate;
  _usdBufferCents = bufferCents;
}

export function convertEurToUsd(eurCents: number): number {
  if (eurCents === 0) return 0;
  return Math.round(eurCents * _usdExchangeRate) + _usdBufferCents;
}

export function money(cents: number, _currency = "EUR", locale: Locale = currentLocale()) {
  const displayCurrency = currentCurrency();
  const displayLocale = locale === "en" ? "en-US" : "de-DE";
  // Prices are always stored in EUR; convert to USD if customer selected USD
  const displayCents = displayCurrency === "USD" ? convertEurToUsd(cents) : cents;
  return new Intl.NumberFormat(displayLocale, {
    currency: displayCurrency,
    style: "currency"
  }).format(displayCents / 100);
}

/**
 * Display a frozen/locked invoice amount — always shows in the stored currency
 * regardless of the user's current currency preference. For paid invoices.
 */
export function frozenMoney(cents: number, currency: string, locale: Locale = currentLocale()): string {
  const displayLocale = locale === "en" ? "en-US" : "de-DE";
  const safeCurrency = currency || "EUR";
  return new Intl.NumberFormat(displayLocale, {
    currency: safeCurrency,
    style: "currency"
  }).format(cents / 100);
}

/** Server-safe money formatter — takes explicit display params instead of reading window/localStorage */
export function serverMoney(
  cents: number,
  displayCurrency: Currency,
  exchangeRate: number,
  bufferCents: number,
  locale: Locale
): string {
  const displayLocale = locale === "en" ? "en-US" : "de-DE";
  const displayCents = displayCurrency === "USD" ? Math.round(cents * exchangeRate) + bufferCents : cents;
  return new Intl.NumberFormat(displayLocale, {
    currency: displayCurrency,
    style: "currency"
  }).format(displayCents / 100);
}

export function invoiceDisplayNumber(invoice: Pick<ApiInvoice, "finalInvoiceNumber" | "tempInvoiceNumber" | "invoiceNumber" | "status">) {
  return invoice.status === "PAID" ? invoice.finalInvoiceNumber ?? invoice.invoiceNumber : invoice.tempInvoiceNumber ?? invoice.invoiceNumber;
}

/** @deprecated Use currentCurrency() directly; currency is now stored independently of locale */
export function displayCurrencyForLocale(_currency = "EUR", _locale: Locale = currentLocale()): Currency {
  return currentCurrency();
}

export function cycleLabel(cycle: string, locale: Locale = currentLocale()) {
  const labels = {
    de: {
      ONE_TIME: "Einmalig",
      MONTHLY: "Monatlich",
      QUARTERLY: "Vierteljährlich",
      SEMI_ANNUAL: "Halbjährlich",
      YEAR_1: "Jährlich",
      YEAR_2: "2 Jahre",
      YEAR_3: "3 Jahre",
      YEAR_4: "4 Jahre"
    },
    en: {
      ONE_TIME: "One time",
      MONTHLY: "Monthly",
      QUARTERLY: "Quarterly",
      SEMI_ANNUAL: "Semi-annual",
      YEAR_1: "Yearly",
      YEAR_2: "2 years",
      YEAR_3: "3 years",
      YEAR_4: "4 years"
    }
  } as const;
  return labels[locale][cycle as keyof typeof labels.en] ?? cycle.toLowerCase().replaceAll("_", " ");
}

export function dateLabel(value?: string | null, locale: Locale = currentLocale(), options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return value ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", options).format(new Date(value)) : "-";
}

export function currentLocale(): Locale {
  if (typeof window === "undefined") {
    return "de";
  }
  const saved = window.localStorage.getItem(LOCALE_COOKIE) ?? readCookie(LOCALE_COOKIE);
  if (saved === "de" || saved === "en") {
    return saved;
  }
  return browserLocale(window.navigator.language);
}

export function storeLocale(locale: Locale) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCALE_COOKIE, locale);
  setCookie(LOCALE_COOKIE, locale);
}

export function currentCurrency(): Currency {
  if (typeof window === "undefined") {
    return "EUR";
  }
  const saved = window.localStorage.getItem(CURRENCY_COOKIE) ?? readCookie(CURRENCY_COOKIE);
  if (saved === "EUR" || saved === "USD") {
    return saved;
  }
  return currentLocale() === "en" ? "USD" : "EUR";
}

export function storeCurrency(currency: Currency) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CURRENCY_COOKIE, currency);
  setCookie(CURRENCY_COOKIE, currency);
}

export type AuthUser = {
  email: string;
  id: string;
  roles: string[];
};

export type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  user: AuthUser;
};

export type AuthScope = "admin" | "client";

export const CLIENT_AUTH_COOKIE = "dezhost_client_access_token";
export const CLIENT_REFRESH_COOKIE = "dezhost_client_refresh_token";
export const ADMIN_AUTH_COOKIE = "dezhost_admin_access_token";
export const ADMIN_REFRESH_COOKIE = "dezhost_admin_refresh_token";
const LEGACY_AUTH_COOKIE = "dezhost_access_token";
const LEGACY_REFRESH_COOKIE = "dezhost_refresh_token";

export function authHeaders(scope: AuthScope = currentScope()): Record<string, string> {
  const token = authToken(scope);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function authToken(scope: AuthScope = currentScope()) {
  return browserToken(scope);
}

export function storeAuth(payload: AuthPayload, scope: AuthScope = "client", remember = true) {
  if (typeof window === "undefined") {
    return;
  }

  const names = authCookieNames(scope);
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(names.auth, payload.accessToken);
  storage.setItem(names.refresh, payload.refreshToken);
  storage.setItem(`${scope}_dezhost_roles`, payload.user.roles.join(","));
  if (!remember) {
    window.localStorage.removeItem(names.auth);
    window.localStorage.removeItem(names.refresh);
    window.localStorage.removeItem(`${scope}_dezhost_roles`);
  }
  setCookie(names.auth, payload.accessToken);
  setCookie(names.refresh, payload.refreshToken);
  expireCookie(LEGACY_AUTH_COOKIE);
  expireCookie(LEGACY_REFRESH_COOKIE);
}

export function clearAuth(scope?: AuthScope) {
  if (typeof window === "undefined") {
    return;
  }
  const scopes = scope ? [scope] : ["admin", "client"] as AuthScope[];
  for (const item of scopes) {
    const names = authCookieNames(item);
    window.localStorage.removeItem(names.auth);
    window.localStorage.removeItem(names.refresh);
    window.localStorage.removeItem(`${item}_dezhost_roles`);
    window.sessionStorage.removeItem(names.auth);
    window.sessionStorage.removeItem(names.refresh);
    window.sessionStorage.removeItem(`${item}_dezhost_roles`);
    expireCookie(names.auth);
    expireCookie(names.refresh);
  }
  window.localStorage.removeItem("dezhost_roles");
  window.sessionStorage.removeItem("dezhost_roles");
  expireCookie(LEGACY_AUTH_COOKIE);
  expireCookie(LEGACY_REFRESH_COOKIE);
}

function browserToken(scope: AuthScope) {
  if (typeof window === "undefined") {
    return undefined;
  }
  const names = authCookieNames(scope);
  return (
    window.localStorage.getItem(names.auth) ??
    window.sessionStorage.getItem(names.auth) ??
    readCookie(names.auth)
  );
}

function currentScope(): AuthScope {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    return "admin";
  }
  return "client";
}

function authCookieNames(scope: AuthScope) {
  return scope === "admin"
    ? { auth: ADMIN_AUTH_COOKIE, refresh: ADMIN_REFRESH_COOKIE }
    : { auth: CLIENT_AUTH_COOKIE, refresh: CLIENT_REFRESH_COOKIE };
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=2592000; samesite=lax`;
}

function expireCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function readCookie(name: string) {
  const part = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}
