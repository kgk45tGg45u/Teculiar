// Per-surface subdomain white-label (Phase 2.2). A tenant can serve the dashboards on dedicated
// hosts (admin.<domain>, <clientLabel>.<domain>) with CLEAN URLs: the browser path never contains
// the /admin or /client segment — the host implies it. The edge classifies the host via the
// X-Teculiar-Surface request header ("admin" | "client"); the dashboards middleware maps the clean
// browser path to the app's internal /admin|/client route. These pure helpers keep hrefs, redirects
// and active-nav checks consistent across both URL shapes (apex-path host vs per-surface host).

export type SurfaceSection = "admin" | "client";

/** The dashboard section an internal path belongs to, or null for root-level pages (/login, /sso, …). */
export function sectionOf(path: string): SurfaceSection | null {
  if (path === "/admin" || path.startsWith("/admin/")) {
    return "admin";
  }
  if (path === "/client" || path.startsWith("/client/")) {
    return "client";
  }
  return null;
}

/** True when `pathname` carries the section segment (apex-path host, or a legacy prefixed URL). */
export function inSection(pathname: string, section: SurfaceSection): boolean {
  return pathname === `/${section}` || pathname.startsWith(`/${section}/`);
}

/**
 * Browser pathname → the app's internal route path for `section`. On a per-surface host the
 * segment is absent from the URL and gets prepended; already-prefixed paths pass through, so
 * legacy URLs keep working on surface hosts too.
 */
export function internalPath(pathname: string, section: SurfaceSection): string {
  if (sectionOf(pathname)) {
    return pathname;
  }
  return pathname === "/" ? `/${section}` : `/${section}${pathname}`;
}

/**
 * Internal /admin|/client target → href for the given surface: the section segment is stripped
 * when the host already implies it. For server components / root-level pages where the current
 * pathname cannot tell the URL shape — pass the X-Teculiar-Surface header value.
 */
export function hrefForSurface(surface: string | null | undefined, target: string): string {
  const section = sectionOf(target);
  if (!section || surface !== section) {
    return target;
  }
  return target.slice(section.length + 1) || "/";
}

/**
 * Internal /admin|/client target → href matching the CURRENT browser pathname's shape. For client
 * components rendered INSIDE their section (chrome, tables): a clean current path means a surface
 * host, a prefixed one means apex-path. Root-level pages (/login, /sso) can't infer the shape this
 * way — use `hrefForSurface` with a server-provided surface there.
 */
export function surfaceHref(currentPathname: string, target: string): string {
  const section = sectionOf(target);
  if (!section) {
    return target;
  }
  return inSection(currentPathname, section) ? target : target.slice(section.length + 1) || "/";
}
