import type { NextFunction, Request, Response } from "express";
import type { ControlPlaneService } from "../tenancy/control-plane.service";
import { hostnameOf, subdomainFromHost } from "../tenancy/tenant.middleware";

// Phase 8.2 — multi-tenant upload isolation. Files are written tenant-scoped at
// /uploads/<tenant>/<subdir>/<file> (see common/uploads.ts + tickets/ticket-files.ts). This guard
// authorizes /uploads serving so one tenant can never read another tenant's files by URL:
//  - 3+ path segments (/uploads/<tenant>/<subdir>/<file>) → the request's own tenant MUST equal
//    <tenant>, else 404 (never leak that the file exists).
//  - 2 segments (/uploads/<subdir>/<file>) → legacy flat layout written before 8.2; served as-is so
//    existing attachments/logos keep loading (migration approach: read-only legacy coexistence).
// The guard runs BEFORE useStaticAssets, resolving the tenant from the request Host itself (it cannot
// rely on TenantMiddleware's AsyncLocalStorage, which — being module-configured — registers after the
// main.ts static/guard middleware).

/** Bare hostname from the request, honouring TRUST_FORWARDED_HOST like TenantMiddleware does. */
function hostHeader(req: Request): string | undefined {
  if (process.env.TRUST_FORWARDED_HOST === "true") {
    const forwarded = req.headers["x-forwarded-host"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value) {
      return value;
    }
  }
  return req.headers.host;
}

/** The tenant subdomain that owns the request's host — custom domain match, else the <sub>.* heuristic. */
export async function tenantSubdomainForHost(
  host: string | undefined,
  controlPlane: ControlPlaneService | null
): Promise<string | null> {
  const hostname = hostnameOf(host);
  if (!hostname) {
    return null;
  }
  if (controlPlane?.enabled) {
    const domain = await controlPlane.findDomainByHost(hostname);
    if (domain && domain.status === "active" && domain.tenant) {
      return domain.tenant.subdomain.toLowerCase();
    }
  }
  return subdomainFromHost(host)?.toLowerCase() ?? null;
}

/** Decide whether a request may read a given (mount-relative) /uploads path, given the owning tenant. */
export function uploadPathAllowed(relativePath: string, requestTenant: string | null): boolean {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length < 3) {
    return true; // legacy flat /uploads/<subdir>/<file>
  }
  const scope = decodeURIComponent(segments[0]!).toLowerCase();
  return requestTenant !== null && requestTenant === scope;
}

/** Express guard mounted at /uploads, in front of useStaticAssets. */
export function uploadsTenantGuard(controlPlane: ControlPlaneService | null) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Mounted at /uploads, so req.path is already relative (e.g. /<tenant>/<subdir>/<file>).
    if (req.path.split("/").filter(Boolean).length < 3) {
      next();
      return;
    }
    try {
      const owner = await tenantSubdomainForHost(hostHeader(req), controlPlane);
      if (uploadPathAllowed(req.path, owner)) {
        next();
        return;
      }
    } catch {
      // Fall through to deny — a scoped path we couldn't authorize is never served.
    }
    res.status(404).end();
  };
}
