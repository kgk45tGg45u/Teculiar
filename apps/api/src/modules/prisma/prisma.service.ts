import { PrismaClient } from "@prisma/client";
import { ConnectionRegistry } from "../../tenancy/connection-registry.service";
import { getTenantContext } from "../../tenancy/tenant-context";

/**
 * DI token + type for the tenant-aware Prisma client. It is never instantiated
 * directly — PrismaModule provides a Proxy (see `createTenantAwarePrisma`) under this
 * token. Keeping `extends PrismaClient` gives services the full Prisma type while every
 * `this.prisma.*` call is routed to the current request's tenant database.
 */
export class PrismaService extends PrismaClient {}

/**
 * The single choke point for per-tenant routing. Every property access resolves the
 * current request's Prisma client from AsyncLocalStorage (set by TenantMiddleware),
 * falling back to the default DATABASE_URL client outside a request or in single-tenant
 * mode. Services keep calling `this.prisma.user.findMany()` unchanged.
 */
export function createTenantAwarePrisma(registry: ConnectionRegistry): PrismaService {
  const current = (): PrismaClient => getTenantContext()?.prisma ?? registry.defaultClient();
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const client = current();
        const value = Reflect.get(client as object, prop);
        return typeof value === "function" ? value.bind(client) : value;
      }
    }
  ) as unknown as PrismaService;
}
