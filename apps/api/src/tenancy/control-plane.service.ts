import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ControlPlanePrismaClient, type Tenant, type TenantDomain } from "./control-plane-prisma";

export interface CreateTenantRecord {
  subdomain: string;
  dbName: string;
  dbUrl: string;
  brand?: string | null;
  plan?: string | null;
  modules?: unknown;
}

export interface RegisterDomainInput {
  host: string;
  tenantId: string;
  surface?: string; // admin | client | api | apex
  status?: string; // pending | verified | active | disabled
  tlsMode?: string; // edge | external
  verifyToken?: string | null;
}

/** A resolved TenantDomain row with its tenant eagerly loaded (for per-request routing). */
export type TenantDomainWithTenant = TenantDomain & { tenant: Tenant };

/**
 * Thin wrapper over the CONTROL-PLANE database (the tenant registry). It is the ONLY
 * place that talks to the control-plane; the client is created lazily and only when
 * CONTROL_PLANE_DATABASE_URL is configured. When it is not, `enabled` is false and the
 * API runs in single-tenant fallback mode — exactly today's behaviour.
 */
@Injectable()
export class ControlPlaneService implements OnModuleDestroy {
  private client?: ControlPlanePrismaClient;

  get enabled(): boolean {
    return Boolean(process.env.CONTROL_PLANE_DATABASE_URL);
  }

  private db(): ControlPlanePrismaClient {
    if (!this.enabled) {
      throw new Error("Control-plane is not configured (CONTROL_PLANE_DATABASE_URL is unset).");
    }
    if (!this.client) {
      this.client = new ControlPlanePrismaClient();
    }
    return this.client;
  }

  async findBySubdomain(subdomain: string): Promise<Tenant | null> {
    if (!this.enabled) {
      return null;
    }
    return this.db().tenant.findUnique({ where: { subdomain } });
  }

  /**
   * Resolve a full hostname to its tenant + surface (Phase 4.6). This is the primary
   * resolution path for custom domains; the caller only routes when `status === "active"`.
   * Returns null (not throwing) when the control-plane is off OR the `tenant_domains` table
   * does not exist yet — so a partially-migrated rollout degrades to the subdomain fallback
   * instead of 500-ing every request.
   */
  async findDomainByHost(host: string): Promise<TenantDomainWithTenant | null> {
    if (!this.enabled) {
      return null;
    }
    try {
      return await this.db().tenantDomain.findUnique({
        where: { host: host.toLowerCase() },
        include: { tenant: true }
      });
    } catch (error) {
      console.warn(
        `[control-plane] findDomainByHost("${host}") failed; falling back to subdomain resolution:`,
        (error as Error).message
      );
      return null;
    }
  }

  /** Upsert a hostname → tenant/surface routing record (used by the register-domain CLI + wizard). */
  async registerDomain(input: RegisterDomainInput): Promise<TenantDomain> {
    const data = {
      surface: input.surface ?? "apex",
      status: input.status ?? "active",
      tlsMode: input.tlsMode ?? "edge",
      verifyToken: input.verifyToken ?? null
    };
    const host = input.host.toLowerCase();
    this.apexCache.delete(input.tenantId); // routing changed → drop the cached base url
    this.activeHostCache.delete(host); // …and the cached CORS allow-decision for this host
    return this.db().tenantDomain.upsert({
      where: { host },
      update: { tenantId: input.tenantId, ...data },
      create: { host, tenantId: input.tenantId, ...data }
    });
  }

  // Cache of "is this a known ACTIVE tenant host?" for the CORS allowlist (Phase 4.6). Short TTL;
  // invalidated on registerDomain. Deny-on-miss, so it only ever WIDENS access to confirmed hosts.
  private readonly activeHostCache = new Map<string, { ok: boolean; exp: number }>();

  /** True when `hostname` is a registered ACTIVE tenant domain — used to allow a cross-origin request. */
  async isActiveTenantHost(hostname: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    const key = hostname.toLowerCase();
    const now = Date.now();
    const cached = this.activeHostCache.get(key);
    if (cached && cached.exp > now) {
      return cached.ok;
    }
    let ok = false;
    try {
      const row = await this.db().tenantDomain.findUnique({ where: { host: key } });
      ok = row?.status === "active";
    } catch {
      ok = false; // table not pushed yet / lookup failed → deny (safe)
    }
    this.activeHostCache.set(key, { ok, exp: now + 60_000 });
    return ok;
  }

  // Per-tenant apex-host cache so building a link (reset/invoice/…) doesn't hit the control-plane on
  // every email. Short TTL; invalidated on registerDomain. Keyed by tenant id.
  private readonly apexCache = new Map<string, { host: string | null; exp: number }>();

  /**
   * The tenant's primary (apex) white-label host — the ACTIVE `apex` TenantDomain, else the first
   * active host, else null. Cached ~60s. Null when the control-plane is off or the table is absent,
   * so callers fall back to <subdomain>.teculiar.net / the env base.
   */
  async primaryApexHost(tenantId: string): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }
    const now = Date.now();
    const cached = this.apexCache.get(tenantId);
    if (cached && cached.exp > now) {
      return cached.host;
    }
    let host: string | null = null;
    try {
      const domains = await this.db().tenantDomain.findMany({
        where: { tenantId, status: "active" },
        orderBy: { createdAt: "asc" }
      });
      host = (domains.find((d) => d.surface === "apex") ?? domains[0])?.host ?? null;
    } catch {
      host = null; // table not pushed yet → fall back
    }
    this.apexCache.set(tenantId, { host, exp: now + 60_000 });
    return host;
  }

  async listDomains(tenantId?: string): Promise<TenantDomain[]> {
    if (!this.enabled) {
      return [];
    }
    return this.db().tenantDomain.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "asc" }
    });
  }

  async list(): Promise<Tenant[]> {
    if (!this.enabled) {
      return [];
    }
    return this.db().tenant.findMany({ orderBy: { createdAt: "asc" } });
  }

  async register(record: CreateTenantRecord): Promise<Tenant> {
    return this.db().tenant.create({
      data: {
        subdomain: record.subdomain,
        dbName: record.dbName,
        dbUrl: record.dbUrl,
        brand: record.brand ?? null,
        plan: record.plan ?? null,
        modules: (record.modules as object | null) ?? undefined,
        status: "active"
      }
    });
  }

  async setStatus(subdomain: string, status: string): Promise<Tenant> {
    return this.db().tenant.update({ where: { subdomain }, data: { status } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect().catch(() => undefined);
  }
}
