// Client/server helper for the data-driven storefront theme (Phase 2 flip). The storefront header,
// footer and (Stage B) router read their menus/pages/footer from GET /storefront/theme instead of
// hard-coded arrays. Per-locale text resolves to the active locale, falling back to the main language
// then any available value.
import { apiGet } from "./api";

export type LocaleMap = Record<string, string>;

export type ThemeMenuItem = {
  id: string;
  label: LocaleMap;
  newTab: boolean;
  externalUrl: string | null;
  pageKey: string | null;
  slug: LocaleMap | null;
  children: ThemeMenuItem[];
};

export type ThemePage = {
  key: string;
  component: string;
  name: LocaleMap;
  slug: LocaleMap;
  seoTitle: LocaleMap;
  seoDescription: LocaleMap;
};

export type StorefrontTheme = {
  theme: { key: string; name: string };
  languages: string[];
  menus: { main: ThemeMenuItem[]; legal: ThemeMenuItem[] };
  pages: ThemePage[];
  footer: Record<string, unknown> | null;
};

export type NavNode = { label: string; href: string | null; newTab: boolean; children: NavNode[] };

export function fetchStorefrontTheme(): Promise<StorefrontTheme | null> {
  return apiGet<StorefrontTheme>("/storefront/theme");
}

export function localized(map: LocaleMap | null | undefined, locale: string, mainLocale: string): string {
  if (!map) {
    return "";
  }
  return map[locale] || map[mainLocale] || Object.values(map).find(Boolean) || "";
}

function hrefFor(item: ThemeMenuItem, locale: string, mainLocale: string): string | null {
  if (item.externalUrl) {
    return item.externalUrl;
  }
  if (item.slug) {
    const slug = localized(item.slug, locale, mainLocale);
    return `/${locale}${slug ? `/${slug}` : ""}`;
  }
  return null; // parent-only item (e.g. "Cloud")
}

/** Build a nav tree for the active locale from theme menu items. */
export function toNav(items: ThemeMenuItem[], locale: string, mainLocale: string): NavNode[] {
  return items.map((item) => ({
    label: localized(item.label, locale, mainLocale),
    href: hrefFor(item, locale, mainLocale),
    newTab: item.newTab,
    children: toNav(item.children, locale, mainLocale)
  }));
}

/** Flatten a menu to its page links (promoting children of parent-only groups). Used by the footer. */
export function flattenLinks(items: ThemeMenuItem[], locale: string, mainLocale: string): NavNode[] {
  const out: NavNode[] = [];
  for (const node of toNav(items, locale, mainLocale)) {
    if (node.children.length) {
      out.push(...node.children);
    } else if (node.href) {
      out.push(node);
    }
  }
  return out;
}

/** A footer text field resolved for the active locale, with a provided fallback. */
export function footerText(footer: Record<string, unknown> | null, key: string, locale: string, mainLocale: string, fallback: string): string {
  const value = footer?.[key];
  if (value && typeof value === "object") {
    return localized(value as LocaleMap, locale, mainLocale) || fallback;
  }
  return typeof value === "string" && value ? value : fallback;
}

// ── Localized slugs / hreflang (Phase 2 follow-up) ─────────────────────────────
// Page detail roots whose per-locale slugs the theme doesn't model (blog posts, KB articles).
// Their localized slugs aren't a simple locale-swap, so we never emit hreflang for them — only a
// self-referencing canonical. Their index pages (/blog, /knowledgebase) ARE theme/static pages.
const DYNAMIC_CONTENT_ROOTS = new Set(["blog", "knowledgebase"]);

type SluggablePage = Pick<ThemePage, "slug" | "component">;

/** A page's slug in a locale, falling back to the main language then the physical component. */
export function pageSlug(page: SluggablePage, locale: string, mainLocale: string): string {
  // An intentionally-empty main-language slug marks the home page, whose path is the locale root
  // ("/en", not "/en/home"). Only one page can hold an empty slug (slugs are unique per locale).
  if (page.slug[mainLocale] === "") {
    return "";
  }
  return page.slug[locale] || page.slug[mainLocale] || page.component;
}

/** The public path for a page in a locale: "/<locale>" (home) or "/<locale>/<localized-slug>". */
export function pagePath(page: SluggablePage, locale: string, mainLocale: string): string {
  const slug = pageSlug(page, locale, mainLocale);
  return `/${locale}${slug ? `/${slug}` : ""}`;
}

/**
 * hreflang `languages` + a self-`canonical` for a storefront request, given the path after the
 * "/<locale>" prefix (`rest`). Relative paths are returned; Next resolves them against metadataBase.
 * - Single-language store → canonical only (mirrors the translate-UX "≥2 languages" rule: nothing to alternate).
 * - A theme page → each locale's localized slug, plus `x-default` (main language).
 * - A deep dynamic-content route (/blog/<post>, /knowledgebase/<article>) → canonical only (slug map unknown).
 * - Any other route (order, signup, pricing, …) isn't localized, so the alternates just swap the locale prefix.
 */
export function storefrontAlternates(
  theme: Pick<StorefrontTheme, "pages" | "languages"> | null,
  locale: string,
  mainLocale: string,
  rest: string
): { canonical: string; languages?: Record<string, string> } {
  const selfPath = `/${locale}${rest ? `/${rest}` : ""}`;
  const langs = theme?.languages ?? [];
  if (langs.length < 2) {
    return { canonical: selfPath };
  }
  const page = theme!.pages.find((p) => p.slug[locale] === rest) ?? theme!.pages.find((p) => p.component === rest);
  if (page) {
    const languages: Record<string, string> = {};
    for (const loc of langs) {
      languages[loc] = pagePath(page, loc, mainLocale);
    }
    languages["x-default"] = pagePath(page, mainLocale, mainLocale);
    return { canonical: pagePath(page, locale, mainLocale), languages };
  }
  if (rest.includes("/") && DYNAMIC_CONTENT_ROOTS.has(rest.split("/")[0] ?? "")) {
    return { canonical: selfPath };
  }
  const languages: Record<string, string> = {};
  for (const loc of langs) {
    languages[loc] = `/${loc}${rest ? `/${rest}` : ""}`;
  }
  languages["x-default"] = `/${mainLocale}${rest ? `/${rest}` : ""}`;
  return { canonical: selfPath, languages };
}
