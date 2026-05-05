export type ApiProduct = {
  id: string;
  name: string;
  slug: string;
  type: "DOMAIN" | "SHARED_HOSTING" | "VPS" | string;
  description: string;
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
  id: string;
  status: string;
  renewsAt?: string | null;
  product: { name: string; type: string };
  productPrice: { amountCents: number; billingCycle: string; currency: string };
};

export type ApiInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string | null;
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
