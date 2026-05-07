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

export type ApiOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  user?: { email: string; name: string };
  invoice?: { invoiceNumber: string; status: string; totalCents: number };
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
  domainRecords?: Array<{ domain: string; status: string; externalId?: string | null }>;
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
  items?: Array<{
    description: string;
    discountCents: number;
    quantity: number;
    subtotalCents: number;
    taxAmountCents: number;
    taxRate: number;
    totalCents: number;
    unitAmountCents: number;
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

export type ApiTicket = {
  id: string;
  department: string;
  subject: string;
  status: string;
  updatedAt: string;
  service?: { product?: { name: string } } | null;
};

export type ApiAnnouncement = {
  id: string;
  title: string;
  excerpt?: string | null;
  createdAt: string;
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
const AUTH_COOKIE = "dezhost_access_token";
const REFRESH_COOKIE = "dezhost_refresh_token";

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

export function authHeaders(): Record<string, string> {
  const token = browserToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeAuth(payload: AuthPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_COOKIE, payload.accessToken);
  window.localStorage.setItem(REFRESH_COOKIE, payload.refreshToken);
  window.localStorage.setItem("dezhost_roles", payload.user.roles.join(","));
  setCookie(AUTH_COOKIE, payload.accessToken);
  setCookie(REFRESH_COOKIE, payload.refreshToken);
}

export function clearAuth() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_COOKIE);
  window.localStorage.removeItem(REFRESH_COOKIE);
  window.localStorage.removeItem("dezhost_roles");
  expireCookie(AUTH_COOKIE);
  expireCookie(REFRESH_COOKIE);
}

function browserToken() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage.getItem(AUTH_COOKIE) ?? readCookie(AUTH_COOKIE);
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
