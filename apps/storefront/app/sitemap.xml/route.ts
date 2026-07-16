import { NextResponse } from "next/server";
import { SUPPORTED_LOCALES } from "@teculiar/web-core/lib/supported-locales";
import { pagePath, type ThemePage } from "@teculiar/web-core/lib/storefront-theme";

const FALLBACK_SITE_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? process.env.SITE_URL ?? "https://www.teculiar.com").replace(/\/$/, "");
// Server-side (this route runs on the storefront host): reach the hosted API directly at the tenant
// upstream, never same-origin. Mirrors the storefront middleware's `apiBase()`.
const UPSTREAM = process.env.TECULIAR_API_UPSTREAM ?? process.env.TECULIAR_UPSTREAM;
const API_URL = (UPSTREAM ? `${UPSTREAM.replace(/\/+$/, "")}/api/v1` : process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");

// Public pages that aren't theme pages (sub-routes / index pages). Their slugs are NOT localized,
// so each locale just swaps the prefix; they're grouped by hreflang the same way theme pages are.
const EXTRA_PATHS = ["/domains/pricing", "/knowledgebase"];

// Used only if the theme can't be fetched: today's hard-coded paths, no hreflang grouping.
const FALLBACK_PATHS = [
  "",
  "/webhosting",
  "/virtual-servers",
  "/reseller",
  "/domains",
  "/it-losungen",
  "/webdesign",
  "/blog",
  "/uber-uns",
  "/kontakt",
  "/legal/impressum",
  "/legal/datenschutz",
  "/legal/agb",
  ...EXTRA_PATHS
];

export const revalidate = 3600;

type Alt = { hreflang: string; href: string };

async function fetchSiteUrl(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/storefront/settings`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      if (data?.siteUrl) return String(data.siteUrl).replace(/\/$/, "");
      if (data?.storefrontBaseUrl) return String(data.storefrontBaseUrl).replace(/\/$/, "");
    }
  } catch {
    // fall through to env fallback
  }
  return FALLBACK_SITE_URL;
}

async function fetchTheme(): Promise<{ pages: ThemePage[]; languages: string[] } | null> {
  try {
    const res = await fetch(`${API_URL}/storefront/theme`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { pages?: ThemePage[]; languages?: string[] };
    const pages = Array.isArray(data?.pages) ? data.pages : [];
    const languages = Array.isArray(data?.languages) && data.languages.length ? data.languages : [];
    return pages.length && languages.length ? { pages, languages } : null;
  } catch {
    return null;
  }
}

function urlEntry(loc: string, lastmod: string, priority: string, alternates: Alt[] = []): string {
  const links = alternates
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`)
    .join("\n");
  return (
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>` +
    `\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>` +
    `${links ? `\n${links}` : ""}\n  </url>`
  );
}

export async function GET() {
  const [SITE_URL, theme] = await Promise.all([fetchSiteUrl(), fetchTheme()]);
  const now = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];

  // Locale list: the runtime-configured languages from the theme, falling back to the build manifest.
  const locales = theme?.languages ?? SUPPORTED_LOCALES;
  const main = locales[0] ?? "de";

  if (theme) {
    // Per-locale slug entries, each carrying hreflang alternates for every configured language + x-default.
    const altsForPaths = (paths: Record<string, string>): Alt[] => [
      ...locales.map((loc) => ({ hreflang: loc, href: `${SITE_URL}${paths[loc]}` })),
      { hreflang: "x-default", href: `${SITE_URL}${paths[main]}` }
    ];
    for (const page of theme.pages) {
      const paths: Record<string, string> = {};
      for (const loc of locales) paths[loc] = pagePath(page, loc, main);
      const alts = altsForPaths(paths);
      const priority = page.component === "home" ? "1.0" : "0.8";
      for (const loc of locales) {
        urls.push(urlEntry(`${SITE_URL}${paths[loc]}`, now, priority, alts));
      }
    }
    for (const path of EXTRA_PATHS) {
      const paths: Record<string, string> = {};
      for (const loc of locales) paths[loc] = `/${loc}${path}`;
      const alts = altsForPaths(paths);
      for (const loc of locales) {
        urls.push(urlEntry(`${SITE_URL}${paths[loc]}`, now, "0.7", alts));
      }
    }
  } else {
    // Theme unavailable — emit today's flat paths per locale (no hreflang grouping).
    for (const locale of locales) {
      for (const path of FALLBACK_PATHS) {
        urls.push(urlEntry(`${SITE_URL}/${locale}${path}`, now, path === "" ? "1.0" : "0.8"));
      }
    }
  }

  // Blog posts (per-locale data; slugs differ per locale, so no cross-locale hreflang grouping).
  const localePosts = await Promise.all(locales.map((locale) => fetchPosts(locale)));
  locales.forEach((locale, index) => {
    for (const post of localePosts[index] ?? []) {
      const lastmod = post.publishedAt ? String(post.publishedAt).slice(0, 10) : now;
      urls.push(
        `  <url><loc>${SITE_URL}/${locale}/blog/${post.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
      );
    }
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>"
  ].join("\n");

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
    }
  });
}

async function fetchPosts(locale: string): Promise<Array<{ slug: string; publishedAt?: string | null }>> {
  try {
    const res = await fetch(`${API_URL}/cms/posts?locale=${locale}`, {
      next: { revalidate: 3600 }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
