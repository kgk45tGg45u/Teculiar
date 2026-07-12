import { NextRequest, NextResponse } from "next/server";
import { internalPath, type SurfaceSection } from "@dezhost/web-core/lib/surface";

// Hosted dashboards app (admin + client). This middleware is auth-guard only — the storefront app
// owns locale/slug routing + redirects. Marketing routes are not served here.
//
// Per-surface hosts (Phase 2.2): when the edge tags the request with X-Teculiar-Surface
// ("admin" for admin.<domain>, "client" for the tenant's client-label host), the section segment
// is implied by the host and absent from the browser URL. We map the clean path to the internal
// /admin|/client route with a Next rewrite (URL bar untouched), run the auth guards against the
// INTERNAL path, and keep login redirects surface-relative so the segment never leaks into the URL.
// Without the header (apex-path hosts, local dev, single-tenant) behaviour is unchanged.
const CLIENT_AUTH_COOKIE = "dezhost_client_access_token";
const ADMIN_AUTH_COOKIE = "dezhost_admin_access_token";
const PUBLIC_FILE = /\.(.*)$/;

// Pages that live at the app ROOT (outside /admin and /client) — never surface-prefixed.
// /login is only root-level for the CLIENT section; on an admin host it maps to /admin/login.
const ROOT_PAGES = ["/reset-password", "/sso"];

function surfaceOf(request: NextRequest): SurfaceSection | null {
  const value = request.headers.get("x-teculiar-surface");
  return value === "admin" || value === "client" ? value : null;
}

function toInternal(pathname: string, surface: SurfaceSection | null): string {
  if (!surface) {
    return pathname;
  }
  if (ROOT_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
    return pathname;
  }
  if (surface === "client" && (pathname === "/login" || pathname.startsWith("/login/"))) {
    return pathname;
  }
  return internalPath(pathname, surface);
}

/** Serve `internal` (rewrite when it differs from the browser path) with x-pathname set for SSR. */
function forward(request: NextRequest, internal: string) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", `${internal}${request.nextUrl.search}`);
  if (internal === request.nextUrl.pathname) {
    return NextResponse.next({ request: { headers } });
  }
  const url = request.nextUrl.clone();
  url.pathname = internal;
  return NextResponse.rewrite(url, { request: { headers } });
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads/") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const surface = surfaceOf(request);
  const internal = toInternal(pathname, surface);

  // On a surface host the login page sits at the host root and `next` stays the clean browser
  // path; on apex-path hosts both keep the section segment, exactly as before.
  function loginRedirect(loginPath: "/login" | "/admin/login") {
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = surface ? "/login" : loginPath;
    url.searchParams.set("next", surface ? `${pathname}${search}` : `${internal}${search}`);
    return NextResponse.redirect(url);
  }

  const hasClientToken = Boolean(request.cookies.get(CLIENT_AUTH_COOKIE)?.value);
  const hasAdminToken = Boolean(request.cookies.get(ADMIN_AUTH_COOKIE)?.value);

  if (internal.startsWith("/admin") && internal !== "/admin/login") {
    if (!hasAdminToken) {
      return loginRedirect("/admin/login");
    }
    return forward(request, internal);
  }

  // Payment return pages must be accessible without a session so new customers can complete the
  // auto-login flow after paying. This MUST precede the /client block below.
  if (
    internal === "/login" ||
    internal === "/admin/login" ||
    internal === "/reset-password" ||
    internal === "/client/billing/payment-return" ||
    internal === "/client/billing/payment-method-return"
  ) {
    return forward(request, internal);
  }

  if (internal.startsWith("/client")) {
    if (!hasClientToken) {
      return loginRedirect("/login");
    }
    return forward(request, internal);
  }

  return forward(request, internal);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
