import { getTenantContext } from "./tenant-context";

/**
 * Single-tenant fallback base (today's behaviour): the site ROOT url from the process env. Used when
 * there is no tenant context (single-tenant deploys, background jobs without a request). Trailing
 * slashes are stripped so callers can safely append a path (`${base}/client/...`).
 */
export function envWebBaseUrl(): string {
  return (
    process.env.PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/**
 * The white-label ROOT url for the CURRENT request's tenant (Phase 4.6). Callers append the surface
 * path exactly as before (`${base}/client/invoices/…`, `${base}/reset-password?…`). In multi-tenant mode
 * this is the tenant's registered apex host (resolved once at middleware time and stashed on the context),
 * so a reset/invoice/payment link points at the tenant's OWN domain instead of a single global host. In
 * single-tenant fallback it is the env base — byte-for-byte today's behaviour, so existing deploys are
 * unaffected.
 */
export function tenantWebBaseUrl(): string {
  return getTenantContext()?.webBaseUrl ?? envWebBaseUrl();
}

/**
 * The ORIGIN serving a dashboard surface for the current tenant (Phase 2.3): the dedicated
 * per-surface host (`https://client.<domain>`) when registered, else the apex base. For root-level
 * pages that live outside the /admin|/client sections (`/reset-password`, `/sso/...`) — they keep
 * the same path on either origin, only the host differs.
 */
export function tenantSurfaceOrigin(surface: "admin" | "client"): string {
  return getTenantContext()?.surfaceBaseUrls?.[surface] ?? tenantWebBaseUrl();
}

/**
 * A full URL into a dashboard SECTION for the current tenant (Phase 2.3). `sectionPath` is relative
 * to the section root (e.g. `/invoices/42`, `""` for the section home). On a dedicated per-surface
 * host the section segment is implied by the host (clean URLs, Phase 2.2); on apex-path tenants the
 * historical `/admin|/client` segment is kept — byte-for-byte today's links.
 */
export function tenantSurfaceUrl(surface: "admin" | "client", sectionPath = ""): string {
  const dedicated = getTenantContext()?.surfaceBaseUrls?.[surface];
  if (dedicated) {
    return `${dedicated}${sectionPath || "/"}`;
  }
  return `${tenantWebBaseUrl()}/${surface}${sectionPath}`;
}

/** Client-area URL shorthand — the one every invoice/service/ticket/payment link goes through. */
export function tenantClientUrl(sectionPath = ""): string {
  return tenantSurfaceUrl("client", sectionPath);
}
