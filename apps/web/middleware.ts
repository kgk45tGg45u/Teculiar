import { NextRequest, NextResponse } from "next/server";

// Hosted dashboards app (admin + client). This middleware is auth-guard only — the storefront app
// owns locale/slug routing + redirects. Marketing routes are not served here.
const CLIENT_AUTH_COOKIE = "dezhost_client_access_token";
const ADMIN_AUTH_COOKIE = "dezhost_admin_access_token";
const PUBLIC_FILE = /\.(.*)$/;

function nextWithPath(request: NextRequest) {
  const pathnameHeader = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathnameHeader);
  return NextResponse.next({ request: { headers } });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads/") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasClientToken = Boolean(request.cookies.get(CLIENT_AUTH_COOKIE)?.value);
  const hasAdminToken = Boolean(request.cookies.get(ADMIN_AUTH_COOKIE)?.value);

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!hasAdminToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
    return nextWithPath(request);
  }

  // Payment return pages must be accessible without a session so new customers can complete the
  // auto-login flow after paying. This MUST precede the /client block below.
  if (
    pathname === "/login" ||
    pathname === "/admin/login" ||
    pathname === "/reset-password" ||
    pathname === "/client/billing/payment-return" ||
    pathname === "/client/billing/payment-method-return"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/client")) {
    if (!hasClientToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
    return nextWithPath(request);
  }

  return nextWithPath(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
