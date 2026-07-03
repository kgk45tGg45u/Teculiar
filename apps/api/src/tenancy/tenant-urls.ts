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
