import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ControlPlanePrismaClient, type Tenant } from "./control-plane-prisma";

export interface CreateTenantRecord {
  subdomain: string;
  dbName: string;
  dbUrl: string;
  brand?: string | null;
  plan?: string | null;
  modules?: unknown;
}

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
