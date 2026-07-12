/**
 * Typed API client for the Dezhost backend (NestJS, /api/v1).
 *
 * Wraps a Playwright APIRequestContext and models the exact endpoints used by
 * the storefront and client portal, discovered in apps/api. Tokens are cached
 * per-email at module scope to avoid tripping the production login rate limiter.
 */
import type { APIRequestContext } from "@playwright/test";
import { env } from "../config/env";

export type ApiResponse<T> = { status: number; ok: boolean; body: T };

export type Product = {
  id: string;
  name: string;
  type: "SHARED_HOSTING" | "DOMAIN" | "VPS" | "DEDICATED_SERVER" | string;
  active: boolean;
  slug?: string;
  prices: Array<{ id: string; billingCycle: string; amountCents: number; setupFeeCents?: number }>;
  configs?: Array<{ key: string; label: string; required?: boolean; values?: unknown[] }>;
};

export type Gateway = { method: string; title: string; enabled?: boolean; config?: Record<string, unknown> };

export type Invoice = {
  id: string;
  userId?: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "FAILED" | "CANCELLED" | "REFUNDED";
  totalCents: number;
  subtotalCents?: number;
  taxAmountCents?: number;
  invoiceNumber?: string;
  tempInvoiceNumber?: string;
  finalInvoiceNumber?: string;
  transactions?: Array<{ id: string; method: string; status: string; amountCents: number; providerReference?: string }>;
  orderSnapshot?: { accountCreditCents?: number } & Record<string, unknown>;
  paymentRedirectUrl?: string;
  providerReference?: string;
  accessToken?: string;
  refreshToken?: string;
};

export type CheckoutResult = { invoice: Invoice; order: { id: string } };

export type ServiceRecord = {
  id: string;
  status: string;
  externalId?: string | null;
  userId?: string;
  configuration?: Record<string, unknown>;
  product?: { type?: string; name?: string } | null;
  productSnapshot?: { type?: string; name?: string } | null;
  domainRecords?: Array<{ id: string; domain: string; status: string; expiresAt?: string | null }>;
  subscriptions?: Array<{ billingCycle: string; status: string }>;
};

export type OrderItem = { productId: string; productPriceId: string; quantity?: number; domainName?: string; configuration?: Record<string, unknown> };
export type CheckoutCustomer = Record<string, unknown> & { email: string; name: string };

export class ApiClient {
  private token?: string;

  constructor(private readonly request: APIRequestContext, readonly apiURL: string = env.apiURL) {}

  withToken(token: string): this {
    this.token = token;
    return this;
  }

  getToken(): string | undefined {
    return this.token;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra
    };
  }

  // ── Low-level verbs (return status + parsed body, never throw on 4xx/5xx) ──

  async get<T = unknown>(path: string, opts: { timeout?: number } = {}): Promise<ApiResponse<T>> {
    const res = await this.request.get(`${this.apiURL}${path}`, { headers: this.headers(), timeout: opts.timeout ?? env.timeouts.apiMs });
    return { status: res.status(), ok: res.ok(), body: (await res.json().catch(() => ({}))) as T };
  }

  async post<T = unknown>(path: string, data?: unknown, opts: { timeout?: number } = {}): Promise<ApiResponse<T>> {
    const res = await this.request.post(`${this.apiURL}${path}`, { headers: this.headers(), data: data ?? {}, timeout: opts.timeout ?? env.timeouts.apiMs });
    return { status: res.status(), ok: res.ok(), body: (await res.json().catch(() => ({}))) as T };
  }

  async patch<T = unknown>(path: string, data?: unknown, opts: { timeout?: number } = {}): Promise<ApiResponse<T>> {
    const res = await this.request.patch(`${this.apiURL}${path}`, { headers: this.headers(), data: data ?? {}, timeout: opts.timeout ?? env.timeouts.apiMs });
    return { status: res.status(), ok: res.ok(), body: (await res.json().catch(() => ({}))) as T };
  }

  /** Like {@link post} but throws a rich error on non-2xx. */
  async postOk<T = unknown>(path: string, data?: unknown, opts: { timeout?: number } = {}): Promise<T> {
    const res = await this.post<T>(path, data, opts);
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body;
  }

  async getOk<T = unknown>(path: string): Promise<T> {
    const res = await this.get<T>(path);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string, scope: "admin" | "client" = "client"): Promise<{ accessToken: string; refreshToken?: string; roles?: string[] }> {
    const cached = tokenCache.get(email);
    if (cached) {
      this.token = cached.accessToken;
      return cached;
    }
    const res = await this.post<{ accessToken?: string; refreshToken?: string; user?: { roles?: string[] }; roles?: string[] }>(
      "/auth/login",
      { email, password, scope }
    );
    if (!res.ok || !res.body.accessToken) {
      throw new Error(`Login failed for ${email} -> ${res.status}: ${JSON.stringify(res.body)}`);
    }
    const result = { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, roles: res.body.user?.roles ?? res.body.roles };
    tokenCache.set(email, result);
    this.token = result.accessToken;
    return result;
  }

  // ── Storefront / catalogue (public) ────────────────────────────────────────

  products(): Promise<Product[]> {
    return this.getOk<Product[]>("/products");
  }

  storefrontGateways(): Promise<Gateway[]> {
    return this.getOk<Gateway[]>("/storefront/payment-gateways");
  }

  searchDomain(domain: string, years = 1): Promise<{ available: boolean; action: string; price?: { amountCents: number }; productId?: string }> {
    return this.getOk(`/domains/search?domain=${encodeURIComponent(domain)}&years=${years}`);
  }

  // ── Checkout & payment ──────────────────────────────────────────────────────

  /** Storefront checkout. Pass a logged-in token for an existing customer; omit for a new one. */
  checkout(items: OrderItem[], customer: CheckoutCustomer): Promise<CheckoutResult> {
    return this.postOk<CheckoutResult>("/orders/checkout", { items, customer });
  }

  /** Pay a deferred checkout (orderId === invoiceId until paid). */
  payOrder(orderId: string, method: string, paymentMethodId: string, iban?: string): Promise<{ invoice: Invoice; order: { id: string } }> {
    return this.postOk("/orders/" + orderId + "/pay", { method, paymentMethodId, ...(iban ? { iban } : {}) });
  }

  confirmPayment(invoiceId: string): Promise<{ status: string; invoice?: Invoice; accessToken?: string; refreshToken?: string }> {
    return this.postOk(`/billing/invoices/${invoiceId}/confirm-payment`, {});
  }

  getOrder(orderId: string): Promise<Record<string, unknown> & { status?: string; items?: unknown[] }> {
    return this.getOk(`/orders/${orderId}`);
  }

  // ── Client portal (authenticated) ──────────────────────────────────────────

  me(): Promise<{ id: string; email: string; balanceCents?: number; roles?: string[] }> {
    return this.getOk("/users/me");
  }

  listServices(refresh = true): Promise<ServiceRecord[]> {
    return this.getOk<ServiceRecord[]>(`/services${refresh ? "?refresh=1" : ""}`);
  }

  getService(id: string, refresh = true): Promise<ServiceRecord> {
    return this.getOk<ServiceRecord>(`/services/${id}${refresh ? "?refresh=1" : ""}`);
  }

  listInvoices(): Promise<Invoice[]> {
    return this.getOk<Invoice[]>("/billing/invoices");
  }

  getInvoice(id: string): Promise<Invoice> {
    return this.getOk<Invoice>(`/billing/invoices/${id}`);
  }

  addFunds(amountCents: number, method = "SANDBOX"): Promise<{ amountCents: number; invoiceId: string; invoiceNumber: string; status: string; paymentRedirectUrl?: string }> {
    return this.postOk("/billing/add-funds", { amountCents, method });
  }

  listPaymentMethods(): Promise<Array<{ id: string; type: string; status: string; automatic?: boolean; default?: boolean }>> {
    return this.getOk("/billing/payment-methods");
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  listUsers(): Promise<Array<{ id: string; email: string }>> {
    return this.getOk("/users");
  }

  createAdminOrder(userId: string, items: OrderItem[], opts: { runModules?: boolean; skipEmail?: boolean } = {}): Promise<{ invoice: Invoice; order: { id: string; orderNumber?: string } }> {
    return this.postOk("/orders/admin", { userId, items, runModules: opts.runModules ?? false, skipEmail: opts.skipEmail ?? true });
  }

  createInvoice(input: { userId: string; dueAt: string; lines: Array<Record<string, unknown>>; status?: string; buyerCountryCode?: string }): Promise<Invoice> {
    return this.postOk("/billing/invoices", { buyerCountryCode: "DE", status: "PENDING", ...input });
  }

  adminGateways(): Promise<Gateway[]> {
    return this.getOk("/admin/dev/billing/payment-gateways");
  }

  updateGateways(gateways: Array<{ method: string; enabled: boolean; config?: Record<string, unknown> }>): Promise<unknown> {
    return this.patch("/admin/dev/billing/payment-gateways", { gateways }).then((r) => r.body);
  }

  /**
   * Run the cron. The server returns `{ running: true }` when another run is already
   * in progress (a real possibility under parallel execution), so we retry until we
   * get an actual run rather than letting a collision corrupt assertions.
   */
  async runCron(): Promise<CronResult> {
    const cron = { timeout: env.timeouts.cronMs };
    const deadline = Date.now() + 90_000;
    let last: CronResult = await this.postOk<CronResult>("/cron/admin/run", {}, cron);
    while (last.running === true && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3_000));
      last = await this.postOk<CronResult>("/cron/admin/run", {}, cron);
    }
    return last;
  }
}

export type CronResult = {
  ok: boolean;
  ran: Array<{ name: string; status: "ran" | "failed"; result?: unknown }>;
  skipped: Array<{ name: string; nextAt: string }>;
  running?: boolean;
};

// Per-email token cache shared across all clients in the worker process.
const tokenCache = new Map<string, { accessToken: string; refreshToken?: string; roles?: string[] }>();

export function clearTokenCache(): void {
  tokenCache.clear();
}
