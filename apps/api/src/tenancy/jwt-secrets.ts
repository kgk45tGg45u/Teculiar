import { getTenantContext } from "./tenant-context";

/**
 * Tenant-aware JWT secret accessors. Inside a request they return the active tenant's
 * secrets (resolved from that tenant's own DB by TenantMiddleware); outside a request,
 * or in single-tenant fallback mode, they fall back to the process env — so today's
 * single-tenant deploy signs/verifies with exactly the same secret as before.
 */
export function accessSecret(): string | undefined {
  return getTenantContext()?.jwtSecrets.access || process.env.JWT_ACCESS_SECRET;
}

export function refreshSecret(): string | undefined {
  return getTenantContext()?.jwtSecrets.refresh || process.env.JWT_REFRESH_SECRET;
}
