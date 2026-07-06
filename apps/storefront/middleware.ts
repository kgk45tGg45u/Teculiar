import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, localeFromAcceptLanguage, getLocale } from "@dezhost/web-core/lib/i18n";
import { isLocaleCode } from "@dezhost/web-core/lib/supported-locales";

const PUBLIC_FILE = /\.(.*)$/;
const LOCALE_COOKIE_OPTS = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

// Paths proxied to the hosted Teculiar upstream (see next.config.mjs `rewrites`). The middleware
// leaves them untouched so the reverse-proxy handles them — the storefront never renders them.
const PROXIED_PREFIXES = ["/api", "/uploads", "/admin", "/client", "/login", "/reset-password"];

// Server-side (middleware) API base — the hosted upstream, never same-origin. Prefers an explicit
// API upstream (local dev, where API and dashboards run on different ports), then the tenant origin.
function apiBase(): string {
  const upstream = process.env.TECULIAR_API_UPSTREAM ?? process.env.TECULIAR_UPSTREAM;
  if (upstream) {
    return `${upstream.replace(/\/+$/, "")}/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";
}

// ── Per-locale slug routing (Phase 2 flip stage B) ────────────────────────────
// Maps the public, per-locale slug a visitor types to the physical storefront route that renders it,
// and 301s old/other paths to the current localized slug. Theme page data is cached briefly so this
// costs ~1 API call/minute. With parity data (slug == component) every branch is a pass-through.
type ThemePage = { component: string; slug: Record<string, string> };
let themeCache: { at: number; pages: ThemePage[] } | null = null;

async function getThemePages(): Promise<ThemePage[]> {
  if (themeCache && Date.now() - themeCache.at < 60_000) {
    return themeCache.pages;
  }
  try {
    const res = await fetch(`${apiBase()}/storefront/theme`, { headers: { accept: "application/json" } });
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

// ── Admin-managed redirects (no hard-coded redirects) ─────────────────────────
type RedirectRule = { from: string; to: string; permanent: boolean };
let redirectCache: { at: number; rules: RedirectRule[] } | null = null;

async function getRedirects(): Promise<RedirectRule[]> {
  if (redirectCache && Date.now() - redirectCache.at < 60_000) {
    return redirectCache.rules;
  }
  try {
    const res = await fetch(`${apiBase()}/storefront/redirects`, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return redirectCache?.rules ?? [];
    }
    const data = (await res.json()) as Array<{ from?: string; to?: string; permanent?: boolean }>;
    const rules: RedirectRule[] = Array.isArray(data)
      ? data
          .filter((r) => r.from && r.to)
          .map((r) => ({ from: String(r.from), to: String(r.to), permanent: r.permanent !== false }))
      : [];
    redirectCache = { at: Date.now(), rules };
    return rules;
  } catch {
    return redirectCache?.rules ?? [];
  }
}

async function matchRedirect(pathname: string): Promise<RedirectRule | undefined> {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (await getRedirects()).find((rule) => rule.from === path);
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
  const current = pages.find((p) => p.slug[locale] === rest);
  if (current) {
    return current.component === rest ? { type: "pass" } : { type: "rewrite", to: current.component };
  }
  const physical = pages.find((p) => p.component === rest);
  const target = physical?.slug[locale];
  if (physical && typeof target === "string" && target && target !== rest) {
    return { type: "redirect", to: target };
  }
  return { type: "pass" }; // not a theme page (e.g. /order, /signup) — leave it alone
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Hosted parts are reverse-proxied (next.config rewrites) — don't touch them here. /sso is the
  // locale-less session-handoff utility page (Phase 4.6e), never locale-redirected.
  if (
    PROXIED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/sso/") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Admin-defined redirects win over locale/slug routing for any public path they match.
  const redirect = await matchRedirect(pathname);
  if (redirect) {
    const dest = /^https?:\/\//i.test(redirect.to)
      ? redirect.to
      : new URL(redirect.to, request.nextUrl.origin).toString();
    return NextResponse.redirect(dest, redirect.permanent ? 301 : 302);
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
    // Expose the visitor-facing path to server components (hreflang/canonical in the [locale] layout).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", `${pathname}${request.nextUrl.search}`);
    if (action.type === "rewrite") {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/${action.to}`;
      const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      response.cookies.set(LOCALE_COOKIE, localeCode, LOCALE_COOKIE_OPTS);
      return response;
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
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
