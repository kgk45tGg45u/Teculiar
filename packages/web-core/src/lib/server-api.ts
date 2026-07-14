import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_AUTH_COOKIE, API_BASE_URL, OLD_ADMIN_AUTH_COOKIE } from "./api";
import { hrefForSurface } from "./surface";

/**
 * SSR API base — resolved PER REQUEST from the Host header (Phase 4.6 multi-tenant fix).
 *
 * The API selects the tenant DB AND the per-tenant JWT signing secret from the request Host, so
 * server-side fetches must arrive AS the tenant the browser is on. A static env upstream
 * (TECULIAR_UPSTREAM) pins every tenant's SSR to ONE tenant: dashboards then verify tokens against the
 * wrong tenant's secret → 401 → login bounce for every tenant except the pinned one. Fetching
 * `https://<request-host>/api/v1` routes through the same proxy the browser uses (Apache/Caddy), which
 * preserves Host → right tenant, right secret. Outside a request scope or on local hosts we fall back
 * to the env-derived base (single-tenant/local behaviour unchanged).
 */
export async function serverApiBase(): Promise<string> {
  try {
    const hostname = ((await headers()).get("host") ?? "").split(":")[0]!.trim().toLowerCase();
    if (hostname && hostname !== "localhost" && !hostname.startsWith("127.") && hostname.includes(".")) {
      return `https://${hostname}/api/v1`;
    }
  } catch {
    // outside a request (build-time) → env base
  }
  return API_BASE_URL;
}

/** Server-component GET without auth (public storefront/settings data), tenant-correct via Host. */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  try {
    const base = await serverApiBase();
    const response = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** apiGetAuth with the failure detail preserved — lets SSR callers tell "suspended" from "unauthorized". */
export type ApiAuthResult<T> = {
  data: T | null;
  status: number;
  /** True when the API refused with 403 code TENANT_SUSPENDED (Phase 3.4 licensing enforcement). */
  suspended: boolean;
  /** Where the outstanding Teculiar invoice lives (from the 403 payload), when configured. */
  billingUrl: string | null;
};

export async function apiGetAuthResult<T>(path: string): Promise<ApiAuthResult<T>> {
  try {
    const base = await serverApiBase();
    const store = await cookies();
    // Old dezhost_* name still read (Phase 9.1 dual-read) so pre-rename admin sessions keep
    // working server-side until web-core rewrites them under the new name.
    const token = store.get(ADMIN_AUTH_COOKIE)?.value ?? store.get(OLD_ADMIN_AUTH_COOKIE)?.value;
    const response = await fetch(`${base}${path}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      let suspended = false;
      let billingUrl: string | null = null;
      if (response.status === 403) {
        const body = (await response.json().catch(() => null)) as { code?: string; billingUrl?: string | null } | null;
        suspended = body?.code === "TENANT_SUSPENDED";
        billingUrl = body?.billingUrl ?? null;
      }
      return { data: null, status: response.status, suspended, billingUrl };
    }

    return { data: (await response.json()) as T, status: response.status, suspended: false, billingUrl: null };
  } catch {
    return { data: null, status: 0, suspended: false, billingUrl: null };
  }
}

export async function apiGetAuth<T>(path: string): Promise<T | null> {
  return (await apiGetAuthResult<T>(path)).data;
}

export async function redirectToAdminLogin(): Promise<never> {
  const requestHeaders = await headers();
  const currentPath = requestHeaders.get("x-pathname") ?? "/admin";
  // On a per-surface host (admin.<domain>, Phase 2.2) the /admin segment is implied by the host:
  // the login page sits at the host root and the next target stays the clean browser path.
  if (requestHeaders.get("x-teculiar-surface") === "admin") {
    const next = currentPath.replace(/^\/admin(?=\/|\?|$)/, "") || "/";
    redirect(`/login?next=${encodeURIComponent(next)}` as never);
  }
  redirect(`/admin/login?next=${encodeURIComponent(currentPath)}` as never);
}

/** The X-Teculiar-Surface header the edge tags per-surface hosts with (Phase 2.2), if any. */
export async function requestSurface(): Promise<"admin" | "client" | null> {
  try {
    const value = (await headers()).get("x-teculiar-surface");
    return value === "admin" || value === "client" ? value : null;
  } catch {
    return null; // outside a request (build-time)
  }
}

/**
 * Server-component href mapper (Phase 2.2): internal /admin|/client targets → hrefs matching the
 * request's URL shape (section segment stripped on a per-surface host, kept on apex-path hosts).
 */
export async function surfaceHrefMapper(): Promise<(target: string) => string> {
  const surface = await requestSurface();
  return (target: string) => hrefForSurface(surface, target);
}
