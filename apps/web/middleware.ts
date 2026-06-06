import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, localeFromAcceptLanguage, getLocale } from "./lib/i18n";

const PUBLIC_FILE = /\.(.*)$/;
const locales = ["de", "en"];
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

  if (pathname.startsWith("/client")) {
    if (!hasClientToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
    return nextWithPath(request);
  }

  // Payment return pages must be accessible without a session so new customers
  // can complete the auto-login flow after paying with PayPal / Mollie.
  if (
    pathname === "/login" ||
    pathname === "/admin/login" ||
    pathname === "/reset-password" ||
    pathname === "/client/billing/payment-return" ||
    pathname === "/client/billing/payment-method-return"
  ) {
    return NextResponse.next();
  }

  const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = savedLocale ? getLocale(savedLocale) : localeFromAcceptLanguage(request.headers.get("accept-language"));

  const pathLocale = locales.find((item) => pathname === `/${item}` || pathname.startsWith(`/${item}/`));
  if (pathLocale) {
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, pathLocale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
