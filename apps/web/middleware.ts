import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, localeFromAcceptLanguage, getLocale } from "./lib/i18n";
import { isLocaleCode } from "./lib/supported-locales";

const PUBLIC_FILE = /\.(.*)$/;
const CLIENT_AUTH_COOKIE = "dezhost_client_access_token";
const ADMIN_AUTH_COOKIE = "dezhost_admin_access_token";
const LOCALE_COOKIE_OPTS = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

function nextWithPath(request: NextRequest) {
  const pathnameHeader = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathnameHeader);
  return NextResponse.next({ request: { headers } });
}

// ── Per-locale slug routing (Phase 2 flip stage B) ────────────────────────────
// Maps the public, per-locale slug a visitor types to the physical storefront route that renders it,
// and 301s old/other paths to the current localized slug. Theme page data is cached briefly so this
// costs ~1 API call/minute. With parity data (slug == component) every branch is a pass-through, so
// today's URLs are unchanged; it only activates once an admin localizes a slug in Admin > Theme.
type ThemePage = { component: string; slug: Record<string, string> };
let themeCache: { at: number; pages: ThemePage[] } | null = null;

async function getThemePages(): Promise<ThemePage[]> {
  if (themeCache && Date.now() - themeCache.at < 60_000) {
    return themeCache.pages;
  }
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
    const res = await fetch(`${base}/storefront/theme`, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return themeCache?.pages ?? [];
    }
    const data = (await res.json()) as { pages?: Array<{ component?: string; slug?: Record<string, string> }> };
    const pages: ThemePage[] = Array.isArray(data?.pages)
      ? data.pages.map((p) => ({ component: String(p.component ?? ""), slug: p.slug ?? {} }))
      : [];
    themeCache = { at: Date.now(), pages };
    return pages;
  } catch {
    return themeCache?.pages ?? [];
  }
}

type SlugAction = { type: "pass" } | { type: "rewrite" | "redirect"; to: string };

async function resolveSlug(locale: string, rest: string): Promise<SlugAction> {
  if (!rest) {
    return { type: "pass" }; // home is served by [locale]/page.tsx
  }
  const pages = await getThemePages();
  if (!pages.length) {
    return { type: "pass" };
  }
  // The current localized slug for this locale → rewrite to the physical route (unless they're equal).
  const current = pages.find((p) => p.slug[locale] === rest);
  if (current) {
    return current.component === rest ? { type: "pass" } : { type: "rewrite", to: current.component };
  }
  // An old/physical path whose localized slug now differs → 301 to the current localized slug.
  const physical = pages.find((p) => p.component === rest);
  const target = physical?.slug[locale];
  if (physical && typeof target === "string" && target && target !== rest) {
    return { type: "redirect", to: target };
  }
  return { type: "pass" }; // not a theme page (e.g. /order, /signup) — leave it alone
}

export async function middleware(request: NextRequest) {
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
    const localeCode = firstSegment.toLowerCase();
    const rest = pathname.split("/").slice(2).join("/");
    const action = await resolveSlug(localeCode, rest);

    if (action.type === "redirect") {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/${action.to}`;
      const response = NextResponse.redirect(url, 301);
      response.cookies.set(LOCALE_COOKIE, localeCode, LOCALE_COOKIE_OPTS);
      return response;
    }
    if (action.type === "rewrite") {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/${action.to}`;
      const response = NextResponse.rewrite(url);
      response.cookies.set(LOCALE_COOKIE, localeCode, LOCALE_COOKIE_OPTS);
      return response;
    }
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, localeCode, LOCALE_COOKIE_OPTS);
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
