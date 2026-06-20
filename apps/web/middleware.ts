import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, localeFromAcceptLanguage, getLocale } from "./lib/i18n";
import { isLocaleCode } from "./lib/supported-locales";

const PUBLIC_FILE = /\.(.*)$/;
const CLIENT_AUTH_COOKIE = "dezhost_client_access_token";
const ADMIN_AUTH_COOKIE = "dezhost_admin_access_token";

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

  // Payment return pages must be accessible without a session so new customers
  // can complete the auto-login flow after paying with PayPal / Mollie.
  // This MUST come before the /client block, otherwise the /client guard redirects
  // unauthenticated visitors to /login before this exception is ever evaluated.
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

  const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = savedLocale ? getLocale(savedLocale) : localeFromAcceptLanguage(request.headers.get("accept-language"));

  // The first path segment is a locale if it is a well-formed code (any 2-letter language,
  // optional region) — this covers admin-added languages the build-time manifest can't list.
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isLocaleCode(firstSegment)) {
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, firstSegment.toLowerCase(), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
