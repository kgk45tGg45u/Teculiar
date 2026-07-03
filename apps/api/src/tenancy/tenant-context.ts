import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";
import type { Tenant } from "./control-plane-prisma";

/**
 * Per-tenant JWT signing secrets. In single-tenant fallback mode these come from
 * the process env (today's behaviour); in multi-tenant mode each tenant's secret
 * lives in its OWN database (SystemSetting) so a leaked control-plane row cannot
 * forge another tenant's tokens.
 */
export interface JwtSecrets {
  access: string;
  refresh: string;
}

/** Which white-label surface a request's host serves (Phase 4.6). */
export type Surface = "ADMIN" | "CLIENT" | "API" | "APEX";

/**
 * The resolved identity + resources for a single in-flight request. Established by
 * TenantMiddleware and stashed in AsyncLocalStorage so every downstream service
 * (which keeps calling `this.prisma.*`) automatically hits the right tenant DB —
 * the single choke point described in docs/teculiar-architecture.md.
 */
export interface TenantContext {
  /** null in single-tenant fallback mode (no control-plane DB configured). */
  tenant: Tenant | null;
  /** Prisma client bound to this tenant's DB (or the default DB in fallback mode). */
  prisma: PrismaClient;
  /** JWT signing secrets for this tenant (env-derived in fallback mode). */
  jwtSecrets: JwtSecrets;
  /**
   * Which white-label surface the request host serves (Phase 4.6). Set from the matched
   * custom-domain record (admin./client./api./apex); null for the <subdomain>.teculiar.net
   * fallback or when no tenant resolved. Optional so existing single-tenant call-sites are unaffected.
   */
  surface?: Surface | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run `fn` (and everything it awaits) with `ctx` as the active tenant context. */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The active request's tenant context, or undefined outside a request (e.g. boot). */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
