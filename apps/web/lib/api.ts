export type ApiProduct = {
  id: string;
  name: string;
  slug: string;
  type: "DOMAIN" | "SHARED_HOSTING" | "VPS" | string;
  description: string;
  homepageVisible?: boolean;
  minimumPriceCents?: number;
  provisioningModule?: string | null;
  prices: Array<{
    id: string;
    billingCycle: string;
    amountCents: number;
    setupFeeCents: number;
    currency: string;
  }>;
  configs?: Array<{ key: string; label: string; values: unknown[]; required: boolean }>;
};

export type ApiPaymentGateway = {
  method: "CREDIT_CARD" | "PAYPAL" | "SEPA" | string;
  title: string;
};

export type ApiOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  user?: { email: string; name: string };
  invoice?: { id: string; invoiceNumber: string; status: string; totalCents: number };
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
  }>;
  transactions?: Array<{
    createdAt: string;
    method: string;
    providerReference: string;
    status: string;
  }>;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string | null;
  subtotalCents?: number;
  taxAmountCents?: number;
  totalCents: number;
  currency: string;
};

export type ApiClient = {
  balanceCents?: number;
  contacts?: Array<{ address?: { city?: string; line1?: string; postalCode?: string; state?: string }; phone?: string | null }>;
  countryCode: string;
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
  department: string;
  subject: string;
  status: string;
  updatedAt: string;
  service?: { product?: { name: string } } | null;
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
  content?: {
    aiBrief?: Record<string, unknown>;
    body?: string;
    category?: string;
    featureImage?: string;
    images?: string[];
    keywords?: string[];
    postType?: "manual" | "ai" | string;
    published?: boolean;
    tags?: string[];
  };
  excerpt?: string | null;
  featureImage?: string | null;
  id: string;
  locale: string;
  publishedAt?: string | null;
  slug: string;
  tags?: string[];
  title: string;
  updatedAt?: string;
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

export function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { currency, style: "currency" }).format(cents / 100);
}

export function cycleLabel(cycle: string) {
  return {
    MONTHLY: "monthly",
    QUARTERLY: "3 months",
    SEMI_ANNUAL: "6 months",
    YEAR_1: "yearly",
    YEAR_2: "2 years",
    YEAR_3: "3 years",
    YEAR_4: "4 years"
  }[cycle] ?? cycle.toLowerCase();
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
  const token = browserToken(scope);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeAuth(payload: AuthPayload, scope: AuthScope = "client") {
  if (typeof window === "undefined") {
    return;
  }

  const names = authCookieNames(scope);
  window.localStorage.setItem(names.auth, payload.accessToken);
  window.localStorage.setItem(names.refresh, payload.refreshToken);
  window.localStorage.setItem(`${scope}_dezhost_roles`, payload.user.roles.join(","));
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
    expireCookie(names.auth);
    expireCookie(names.refresh);
  }
  window.localStorage.removeItem("dezhost_roles");
  expireCookie(LEGACY_AUTH_COOKIE);
  expireCookie(LEGACY_REFRESH_COOKIE);
}

function browserToken(scope: AuthScope) {
  if (typeof window === "undefined") {
    return undefined;
  }
  const names = authCookieNames(scope);
  return window.localStorage.getItem(names.auth) ?? readCookie(names.auth);
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
