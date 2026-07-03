import type { ControlPlaneService } from "./tenancy/control-plane.service";

type OriginCallback = (err: Error | null, allow?: boolean) => void;

/** Static allow-list: explicit env origins + the local dev defaults. */
export function allowedOrigins(): string[] {
  const origins = [
    process.env.APP_URL,
    process.env.PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.CORS_ORIGINS,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return Array.from(new Set(origins));
}

// Domain suffixes whose subdomains are always allowed (multi-tenant, Phase 4.1). Every tenant lives at
// <subdomain>.teculiar.net; teculiar.com is the dogfood storefront. Extra buyer domains can be added via
// CORS_TENANT_SUFFIXES (comma-separated).
export function tenantOriginSuffixes(): string[] {
  const extra = (process.env.CORS_TENANT_SUFFIXES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return ["teculiar.net", "teculiar.com", ...extra];
}

/**
 * Sync CORS decision from static config + tenant suffixes. Returns `true`/`false` for a decided
 * request, or `"check"` when the origin is an unknown host that should be looked up in the
 * control-plane (a registered tenant custom domain — Phase 4.6). Same-origin / server-to-server
 * requests carry no Origin and are always allowed.
 */
export function corsStaticDecision(origin: string | undefined): boolean | "check" {
  if (!origin) {
    return true;
  }
  const normalized = origin.trim().replace(/\/$/, "");
  if (allowedOrigins().includes(normalized)) {
    return true;
  }
  let hostname = "";
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (tenantOriginSuffixes().some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    return true;
  }
  return "check";
}

/**
 * Build the CORS origin callback. Decides statically where possible; for an unknown host it asks the
 * control-plane whether that host is a registered ACTIVE tenant domain (Phase 4.6 — lets a self-hosted
 * storefront's `api.<domain>` or a future embeddable widget call the API cross-origin). Deny-on-error,
 * so an unknown origin is never allowed by accident.
 */
export function makeCorsOrigin(controlPlane: ControlPlaneService) {
  return (origin: string | undefined, callback: OriginCallback): void => {
    const decision = corsStaticDecision(origin);
    if (decision !== "check") {
      callback(null, decision);
      return;
    }
    let hostname = "";
    try {
      hostname = new URL(origin!).hostname.toLowerCase();
    } catch {
      callback(null, false);
      return;
    }
    controlPlane
      .isActiveTenantHost(hostname)
      .then((ok) => callback(null, ok))
      .catch(() => callback(null, false));
  };
}
