import type { Tenant } from "./control-plane-prisma";
import { ConnectionRegistry } from "./connection-registry.service";
import { ControlPlaneService } from "./control-plane.service";
import type { Surface, TenantContext } from "./tenant-context";

/**
 * Build the full TenantContext for a resolved tenant — Prisma client, JWT secrets and the
 * white-label base URLs every generated link is built from. Shared by the request path
 * (TenantMiddleware) and the scheduled path (CronService), so cron-generated emails carry
 * exactly the same tenant links as request-generated ones.
 */
export async function buildTenantContext(
  tenant: Tenant,
  controlPlane: ControlPlaneService,
  registry: ConnectionRegistry,
  surface: Surface | null = null
): Promise<TenantContext> {
  const prisma = registry.clientFor(tenant.dbUrl);
  const jwtSecrets = await registry.secretsFor(tenant.id, prisma);
  const hosts = await controlPlane.surfaceHosts(tenant.id);
  const webBaseUrl = `https://${hosts.apex ?? `${tenant.subdomain}.teculiar.net`}`;
  const surfaceBaseUrls = {
    admin: hosts.admin ? `https://${hosts.admin}` : null,
    client: hosts.client ? `https://${hosts.client}` : null
  };
  return { tenant, prisma, jwtSecrets, surface, webBaseUrl, surfaceBaseUrls };
}
