import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { JwtSecrets } from "./tenant-context";

export const JWT_ACCESS_SECRET_KEY = "security.jwtAccessSecret";
export const JWT_REFRESH_SECRET_KEY = "security.jwtRefreshSecret";

function envSecrets(): JwtSecrets {
  return {
    access: process.env.JWT_ACCESS_SECRET ?? "",
    refresh: process.env.JWT_REFRESH_SECRET ?? ""
  };
}

/** Stored SystemSetting.value is Json; secrets are saved as plain strings. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Owns every live Prisma connection and caches per-tenant JWT secrets. One instance
 * for the whole process:
 *  - `defaultClient()` — the single-tenant DATABASE_URL client (fallback mode + boot).
 *  - `clientFor(dbUrl)` — a pooled client per tenant DB, created lazily and reused.
 *  - `secretsFor()`     — the tenant's JWT secrets read from its own DB, cached.
 *
 * Clients are never per-request; the per-request routing happens in the Prisma proxy
 * choke point via AsyncLocalStorage, so this stays a plain singleton.
 */
@Injectable()
export class ConnectionRegistry implements OnModuleDestroy {
  private defaultClientInstance?: PrismaClient;
  private readonly clients = new Map<string, PrismaClient>();
  private readonly secrets = new Map<string, JwtSecrets>();

  defaultClient(): PrismaClient {
    if (!this.defaultClientInstance) {
      this.defaultClientInstance = new PrismaClient();
    }
    return this.defaultClientInstance;
  }

  /** Get (or lazily create) the pooled client for a tenant's connection string. */
  clientFor(dbUrl: string): PrismaClient {
    const existing = this.clients.get(dbUrl);
    if (existing) {
      return existing;
    }
    const client = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    this.clients.set(dbUrl, client);
    return client;
  }

  /** Resolve a tenant's JWT secrets from its own DB (cached); env is the fallback. */
  async secretsFor(tenantId: string, prisma: PrismaClient): Promise<JwtSecrets> {
    const cached = this.secrets.get(tenantId);
    if (cached) {
      return cached;
    }
    const fallback = envSecrets();
    const rows = await prisma.systemSetting
      .findMany({ where: { key: { in: [JWT_ACCESS_SECRET_KEY, JWT_REFRESH_SECRET_KEY] } } })
      .catch(() => [] as { key: string; value: unknown }[]);
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const secrets: JwtSecrets = {
      access: asString(byKey.get(JWT_ACCESS_SECRET_KEY)) ?? fallback.access,
      refresh: asString(byKey.get(JWT_REFRESH_SECRET_KEY)) ?? fallback.refresh
    };
    this.secrets.set(tenantId, secrets);
    return secrets;
  }

  /** Drop cached secrets for a tenant (e.g. after a secret rotation). */
  invalidateSecrets(tenantId: string): void {
    this.secrets.delete(tenantId);
  }

  async onModuleDestroy(): Promise<void> {
    const clients = [this.defaultClientInstance, ...this.clients.values()].filter(
      (client): client is PrismaClient => Boolean(client)
    );
    await Promise.all(clients.map((client) => client.$disconnect().catch(() => undefined)));
  }
}
