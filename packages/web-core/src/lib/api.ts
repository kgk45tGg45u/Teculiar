import { formatCustomerNumber } from "@dezhost/shared";
import { loadDictionary, getMeta } from "@dezhost/locales";
import { ADMIN_CURRENCY_COOKIE, ADMIN_LOCALE_COOKIE, CURRENCY_COOKIE, LOCALE_COOKIE, browserLocale, type Currency, type Locale } from "./i18n";

// Fired whenever the visitor changes their display language/currency, so live client consumers
// (the header toggle, every <Price>) re-read the preference instead of showing a stale snapshot.
export const PREFS_CHANGED_EVENT = "dezhost:prefs";

function notifyPrefsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
  }
}
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocaleCode } from "./supported-locales";

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
  featured?: boolean;
  minimumPriceCents?: number;
  provisioningModule?: string | null;
  domainRequirement?: "NECESSARY" | "OPTIONAL" | "NOT_NEEDED" | string;
  freeDomainBillingCycle?: string | null;
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
  kind?: string;
  label: string;
  description: string;
  active: boolean;
  config: Record<string, unknown>;
  fields?: Array<{
    key: string;
    label: string;
    type: "text" | "secret" | "boolean" | "select";
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
    help?: string;
  }>;
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
    discountCents?: number;
    finalInvoiceNumber?: string | null;
    id: string;
    invoiceNumber: string;
    items?: Array<{ description: string; type?: string | null; totalCents: number }>;
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
  domainRecords?: Array<{ id?: string; domain: string; status: string; externalId?: string | null; firstPaymentAmountCents?: number; recurringAmountCents?: number }>;
  externalId?: string | null;
  id: string;
  status: string;
  renewsAt?: string | null;
  recurringAmountCents?: number;
  product: { name: string; type: string };
  productPrice: { amountCents: number; billingCycle: string; currency: string };
};

// The price shown for a service/domain is the captured *order* price (`recurringAmountCents`), not the
// generic product list price. Domain products carry a 0 list price because every TLD/term is priced
// live from resell.biz at checkout, so reading `productPrice.amountCents` always shows €0 for domains.
// Fall back to the list price only for legacy records created before the order price was captured.
export function serviceUnitPriceCents(service: { productPrice: { amountCents: number }; recurringAmountCents?: number }): number {
  return service.recurringAmountCents && service.recurringAmountCents > 0 ? service.recurringAmountCents : service.productPrice.amountCents;
}

export function domainUnitPriceCents(
  record: { recurringAmountCents?: number } | undefined,
  service: { productPrice: { amountCents: number }; recurringAmountCents?: number }
): number {
  return record?.recurringAmountCents && record.recurringAmountCents > 0 ? record.recurringAmountCents : serviceUnitPriceCents(service);
}

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
  paymentMethodLabel?: string | null;
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

export type ApiTicketUser = {
  id?: string;
  email?: string;
  name?: string;
  avatarUrl?: string | null;
  isGuest?: boolean;
} | null;

export type ApiTicketInvoice = {
  id: string;
  invoiceNumber?: string;
  tempInvoiceNumber?: string | null;
  finalInvoiceNumber?: string | null;
  status: string;
  totalCents: number;
  currency: string;
  dueAt?: string;
} | null;

export type ApiDepartmentRef = { id: string; slug: string; name: string; color?: string | null } | null;

export type ApiTicketReply = {
  attachments?: ApiTicketAttachment[];
  body: string;
  createdAt: string;
  id: string;
  internal?: boolean;
  system?: boolean;
  invoiceId?: string | null;
  invoice?: ApiTicketInvoice;
  user?: ApiTicketUser;
  userId?: string;
};

export type ApiTicket = {
  id: string;
  publicId?: string;
  userId?: string;
  createdAt?: string;
  department?: ApiDepartmentRef;
  departmentId?: string;
  priority?: string;
  subject: string;
  status: string;
  updatedAt: string;
  user?: ApiTicketUser;
  assignee?: ApiTicketUser;
  service?: { id?: string; product?: { name: string } } | null;
  replies?: ApiTicketReply[];
  attachments?: ApiTicketAttachment[];
};

export type ApiDepartment = {
  id: string;
  slug: string;
  name: string;
  email?: string | null;
  color?: string | null;
  active: boolean;
  isDefault: boolean;
  sortOrder: number;
  members?: Array<{ id: string; user: { id: string; name: string; email: string; avatarUrl?: string | null } }>;
};

export type ApiAdminUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  createdAt?: string;
  userRoles?: Array<{ role: { slug: string; name: string } }>;
  departmentMemberships?: Array<{ department: { id: string; name: string; slug: string; color?: string | null } }>;
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
  type: "button" | "divider" | "invoiceTable" | "keyValueTable" | "link" | "notice" | "text";
};

export type ApiEmailAdminSettings = {
  blockLibrary?: Array<{ description: string; label: string; type: ApiEmailLayoutBlock["type"] }>;
  brandLogoUrl?: string;
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
  placeholders: Array<{ description: string; group?: string; key: string }>;
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

// API base URL — resolved at runtime, never baked at build time (one artifact serves every tenant).
// • In the browser we always call our OWN origin (`/api/v1`): the downloaded storefront proxies that
//   to the tenant's hosted API, and the hosted dashboards are served same-origin with the API.
// • On the server (SSR / middleware) we call the upstream directly — TECULIAR_UPSTREAM for the
//   downloaded storefront, else the legacy NEXT_PUBLIC_API_URL / local default (single-tenant fallback).
function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  const upstream = process.env.TECULIAR_UPSTREAM;
  if (upstream) {
    return `${upstream.replace(/\/+$/, "")}/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
}

export const API_BASE_URL = resolveApiBaseUrl();

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

// ── Currency config (injected from /storefront/settings via the config provider) ──
export type CurrencyRate = { rate: number; buffer: number; bufferEnabled: boolean };
export type CurrencyConfig = { main: string; currencies: string[]; rates: Record<string, CurrencyRate> };

// Prices are always stored in the main currency (EUR); other currencies are converted for
// display only. Defaults to a 1:1 EUR/USD until the config provider injects the real config.
let _currencyConfig: CurrencyConfig = {
  main: "EUR",
  currencies: ["EUR", "USD"],
  rates: { USD: { rate: 1, buffer: 0, bufferEnabled: false } }
};

export function initCurrencyConfig(config: CurrencyConfig) {
  _currencyConfig = config;
}

export function currentCurrencyConfig(): CurrencyConfig {
  return _currencyConfig;
}

/** @deprecated legacy USD-only shim; prefer initCurrencyConfig. */
export function initExchangeRate(rate: number, bufferCents: number) {
  initCurrencyConfig({ main: "EUR", currencies: ["EUR", "USD"], rates: { USD: { rate, buffer: bufferCents, bufferEnabled: true } } });
}

/** The currency config as stored/returned by the backend ({ main, others, rates }). */
export type StoredCurrencyConfig = { main?: string; others?: string[]; currencies?: string[]; rates?: Record<string, CurrencyRate> };

/** Build the web currency config from /storefront/settings (new currencyConfig, else legacy USD fields). */
export function currencyConfigFromSettings(
  settings: { currencyConfig?: StoredCurrencyConfig; usdExchangeRate?: number; usdBufferCents?: number } | null | undefined
): CurrencyConfig {
  const config = settings?.currencyConfig;
  if (config?.main) {
    const currencies = config.currencies?.length
      ? config.currencies
      : [config.main, ...(Array.isArray(config.others) ? config.others : [])];
    return { main: config.main, currencies, rates: config.rates ?? {} };
  }
  const rate = settings?.usdExchangeRate ?? 1.0;
  const buffer = settings?.usdBufferCents ?? 0;
  return { main: "EUR", currencies: ["EUR", "USD"], rates: { USD: { rate, buffer, bufferEnabled: true } } };
}

// ── Language config (which languages are enabled + the main one) ──
export type I18nConfig = { main: string; languages: string[] };

/** Build the web language config from /storefront/settings, defaulting to the shipped packs. */
export function i18nConfigFromSettings(
  settings: { languages?: { main?: string; others?: string[] } } | null | undefined
): I18nConfig {
  const languages = settings?.languages;
  if (languages?.main) {
    return { main: languages.main, languages: [languages.main, ...(Array.isArray(languages.others) ? languages.others : [])] };
  }
  return { main: DEFAULT_LOCALE, languages: SUPPORTED_LOCALES };
}

/** Convert a main-currency amount (in cents) to the target currency for display. */
export function convert(cents: number, target: string, config: CurrencyConfig = _currencyConfig): number {
  if (cents === 0 || target === config.main) {
    return cents;
  }
  const rate = config.rates[target];
  if (!rate) {
    return cents;
  }
  return Math.round(cents * rate.rate) + (rate.bufferEnabled ? rate.buffer : 0);
}

/** @deprecated use convert(cents, "USD"). */
export function convertEurToUsd(eurCents: number): number {
  return convert(eurCents, "USD");
}

function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(getMeta(locale).numberFormat, { currency, style: "currency" }).format(cents / 100);
}

export function money(cents: number, _currency = _currencyConfig.main, locale: Locale = currentLocale()) {
  const target = currentCurrency();
  return formatMoney(convert(cents, target), target, locale);
}

/**
 * Display a frozen/locked invoice amount — always shows in the stored currency
 * regardless of the user's current currency preference. For issued/paid invoices.
 */
export function frozenMoney(cents: number, currency: string, locale: Locale = currentLocale()): string {
  return formatMoney(cents, currency || _currencyConfig.main, locale);
}

/** Server-safe money formatter — takes an explicit currency config instead of reading window/localStorage. */
export function serverMoney(cents: number, displayCurrency: string, config: CurrencyConfig, locale: Locale): string {
  return formatMoney(convert(cents, displayCurrency, config), displayCurrency, locale);
}

export function invoiceDisplayNumber(invoice: Pick<ApiInvoice, "finalInvoiceNumber" | "tempInvoiceNumber" | "invoiceNumber" | "status">) {
  return invoice.status === "PAID" ? invoice.finalInvoiceNumber ?? invoice.invoiceNumber : invoice.tempInvoiceNumber ?? invoice.invoiceNumber;
}

/** @deprecated Use currentCurrency() directly; currency is now stored independently of locale */
export function displayCurrencyForLocale(_currency = "EUR", _locale: Locale = currentLocale()): Currency {
  return currentCurrency();
}

export function cycleLabel(cycle: string, locale: Locale = currentLocale()) {
  const labels = loadDictionary(locale).common.billingCycle as Record<string, string>;
  return labels[cycle] ?? cycle.toLowerCase().replaceAll("_", " ");
}

export function dateLabel(value?: string | null, locale: Locale = currentLocale(), options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return value ? new Intl.DateTimeFormat(getMeta(locale).dateFormat, options).format(new Date(value)) : "-";
}

// Locale is scoped like the auth tokens: the admin panel reads/writes its own cookie so its language
// is independent of the client/storefront one (a dual-account admin can run each in a different one).
function localeCookieForScope(scope: AuthScope = currentScope()): string {
  return scope === "admin" ? ADMIN_LOCALE_COOKIE : LOCALE_COOKIE;
}

export function currentLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }
  // Prefer the cookie so the client matches the server (requestLocale) and the visible language
  // toggle. localStorage is only a fallback — otherwise a stale localStorage value can override a
  // newer cookie (e.g. set by visiting /de), showing a DE toggle but an EN dashboard.
  const cookie = localeCookieForScope();
  const saved = readCookie(cookie) ?? window.localStorage.getItem(cookie);
  if (isLocaleCode(saved)) {
    return saved!.toLowerCase();
  }
  return browserLocale(window.navigator.language);
}

export function storeLocale(locale: Locale) {
  if (typeof window === "undefined") {
    return;
  }
  const cookie = localeCookieForScope();
  window.localStorage.setItem(cookie, locale);
  setCookie(cookie, locale);
  notifyPrefsChanged();
}

// Persist a signed-in user's effective language to their account (User.locale) so server-rendered
// surfaces and transactional emails follow the up-to-date preference. Scope-aware: on /admin it
// updates the admin account, elsewhere the client account; a no-op for guests (no token for the scope).
export function persistClientLocale(locale: Locale) {
  const scope = currentScope();
  if (typeof window === "undefined" || !browserToken(scope)) {
    return;
  }
  void authFetch(
    `${API_BASE_URL}/users/me`,
    { body: JSON.stringify({ locale }), headers: { "Content-Type": "application/json" }, method: "PATCH" },
    scope
  ).catch(() => undefined);
}

// Currency is scoped like the locale/auth cookies: the admin panel reads/writes its own cookie so its
// display currency is independent of the client/storefront one (and admin choices never leak to the
// public site).
function currencyCookieForScope(scope: AuthScope = currentScope()): string {
  return scope === "admin" ? ADMIN_CURRENCY_COOKIE : CURRENCY_COOKIE;
}

export function currentCurrency(): Currency {
  if (typeof window === "undefined") {
    return _currencyConfig.main;
  }
  const cookie = currencyCookieForScope();
  const saved = readCookie(cookie) ?? window.localStorage.getItem(cookie);
  if (saved && _currencyConfig.currencies.includes(saved)) {
    return saved;
  }
  // No saved choice: prefer the language's natural currency (meta.defaultCurrency) when it is
  // configured, otherwise the main currency.
  const metaDefault = getMeta(currentLocale()).defaultCurrency;
  return _currencyConfig.currencies.includes(metaDefault) ? metaDefault : _currencyConfig.main;
}

export function storeCurrency(currency: Currency) {
  if (typeof window === "undefined") {
    return;
  }
  const cookie = currencyCookieForScope();
  window.localStorage.setItem(cookie, currency);
  setCookie(cookie, currency);
  notifyPrefsChanged();
}

export type AuthUser = {
  email: string;
  id: string;
  roles: string[];
};

/**
 * Roles that may reach the admin dashboard (front-end gate). Single source of truth so the login
 * gate, the SSR page guards and the dashboard shell never drift — `super_admin` was missing from
 * several of them, locking the new super-admin out. `staff` is a legacy slug kept for safety.
 */
export const ADMIN_ROLES = ["admin", "staff", "super_admin"] as const;

export function isAdminRole(roles: readonly string[] | undefined | null): boolean {
  return !!roles?.some((role) => (ADMIN_ROLES as readonly string[]).includes(role));
}

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

// The access token lives ~15 min. Long-lived admin pages (e.g. the departments panel) regularly
// outlast it, so a write that fires after the token expired used to fail with "Invalid access
// token". `authFetch` transparently refreshes the token once on a 401 and retries the request.
export async function refreshAccessToken(scope: AuthScope = currentScope()): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }
  const names = authCookieNames(scope);
  const refreshToken =
    window.localStorage.getItem(names.refresh) ??
    window.sessionStorage.getItem(names.refresh) ??
    readCookie(names.refresh);
  if (!refreshToken) {
    return false;
  }
  // Remember whether the session was "remembered" (localStorage) so the refreshed tokens land in
  // the same storage rather than silently downgrading to session-only.
  const remember = window.localStorage.getItem(names.auth) !== null || window.localStorage.getItem(names.refresh) !== null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      body: JSON.stringify({ refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as AuthPayload;
    if (!payload?.accessToken || !payload?.refreshToken || !payload?.user?.roles) {
      return false;
    }
    storeAuth(payload, scope, remember);
    return true;
  } catch {
    return false;
  }
}

export async function authFetch(input: string, init: RequestInit = {}, scope: AuthScope = currentScope()): Promise<Response> {
  const build = (): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders(scope) }
  });
  const response = await fetch(input, build());
  if (response.status !== 401) {
    return response;
  }
  const refreshed = await refreshAccessToken(scope);
  return refreshed ? fetch(input, build()) : response;
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
