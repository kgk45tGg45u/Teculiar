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
    return this.db().tenantDomain.upsert({
      where: { host },
      update: { tenantId: input.tenantId, ...data },
      create: { host, tenantId: input.tenantId, ...data }
    });
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
