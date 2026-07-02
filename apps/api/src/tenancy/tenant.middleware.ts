import { Injectable, NestMiddleware } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ConnectionRegistry } from "./connection-registry.service";
import { ControlPlaneService } from "./control-plane.service";
import { runWithTenant, type JwtSecrets, type TenantContext } from "./tenant-context";

function envSecrets(): JwtSecrets {
  return {
    access: process.env.JWT_ACCESS_SECRET ?? "",
    refresh: process.env.JWT_REFRESH_SECRET ?? ""
  };
}

/**
 * Resolve the tenant subdomain from a Host header.
 *  - `dezhost.teculiar.net`   → "dezhost"   (tenant subdomain of a 3+ label host)
 *  - `t1.localhost`           → "t1"        (local dev / tests)
 *  - `teculiar.net`, `www.*`  → null        (apex / no tenant)
 */
export function subdomainFromHost(host: string | undefined): string | null {
  if (!host) {
    return null;
  }
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) {
    return null;
  }
  const first = labels[0]!;
  if (first === "www") {
    return null;
  }
  const tld = labels[labels.length - 1]!;
  if (labels.length >= 3) {
    return first;
  }
  // Two labels: only treat as a tenant for local dev (`<sub>.localhost`).
  if (tld === "localhost") {
    return first;
  }
  return null;
}

/**
 * A Prisma stand-in used when the control-plane is enabled but no tenant could be
 * resolved (unknown/absent subdomain). Non-DB routes (health, CORS preflight) never
 * touch it; any tenant-scoped query fails loudly instead of silently hitting the
 * wrong database.
 */
function unresolvedTenantClient(host: string | undefined): PrismaClient {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`No tenant resolved for request host "${host ?? "?"}" — unknown subdomain.`);
      }
    }
  ) as PrismaClient;
}

/**
 * The tenant choke point (Phase 4.1). Reads the request Host, resolves the tenant in
 * the control-plane, binds that tenant's Prisma client + JWT secrets into an
 * AsyncLocalStorage context, and runs the rest of the pipeline inside it. When the
 * control-plane is not configured it establishes a single-tenant fallback context so
 * existing single-tenant deploys behave exactly as before.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly controlPlane: ControlPlaneService,
    private readonly registry: ConnectionRegistry
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const context = await this.resolve(req);
    runWithTenant(context, () => next());
  }

  private async resolve(req: Request): Promise<TenantContext> {
    // Single-tenant fallback: no control-plane → today's behaviour, unchanged.
    if (!this.controlPlane.enabled) {
      return { tenant: null, prisma: this.registry.defaultClient(), jwtSecrets: envSecrets() };
    }

    const host = this.hostHeader(req);
    const subdomain = subdomainFromHost(host);
    const tenant = subdomain ? await this.controlPlane.findBySubdomain(subdomain) : null;
    if (!tenant) {
      return { tenant: null, prisma: unresolvedTenantClient(host), jwtSecrets: envSecrets() };
    }

    const prisma = this.registry.clientFor(tenant.dbUrl);
    const jwtSecrets = await this.registry.secretsFor(tenant.id, prisma);
    return { tenant, prisma, jwtSecrets };
  }

  private hostHeader(req: Request): string | undefined {
    if (process.env.TRUST_FORWARDED_HOST === "true") {
      const forwarded = req.headers["x-forwarded-host"];
      const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      if (value) {
        return value;
      }
    }
    return req.headers.host;
  }
}
