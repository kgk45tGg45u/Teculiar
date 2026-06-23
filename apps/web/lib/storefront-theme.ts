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
