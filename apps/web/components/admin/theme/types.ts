// Shared shapes for the Admin > Theme tabs, mirroring GET /admin/dev/theme.
import type { Dictionary } from "@dezhost/web-core/lib/dictionary";

export type LocaleMap = Record<string, string>;

/** The admin.themeBuilder pack group, passed to every tab. */
export type TB = Dictionary["admin"]["themeBuilder"];

export type AdminPage = {
  id: string;
  key: string;
  component: string;
  name: LocaleMap;
  slug: LocaleMap;
  seoTitle: LocaleMap;
  seoDescription: LocaleMap;
  published: boolean;
  isSystem: boolean;
  order: number;
};

export type AdminRedirect = {
  id: string;
  fromPath: string;
  toPath: string;
  permanent: boolean;
  enabled: boolean;
};

export type AdminMenuItem = {
  id: string;
  menu: "MAIN" | "LEGAL";
  parentId: string | null;
  pageId: string | null;
  externalUrl: string | null;
  label: LocaleMap;
  newTab: boolean;
  order: number;
};

export type AdminThemeData = {
  theme: { id: string; key: string; name: string; thumbnail: string | null; active: boolean; footer: Record<string, unknown> | null };
  themes: Array<{ id: string; key: string; name: string; thumbnail: string | null; active: boolean }>;
  locales: string[];
  canTranslate: boolean;
  pages: AdminPage[];
  menuItems: AdminMenuItem[];
};

const LOCALE_NAME: Record<string, string> = { de: "Deutsch", en: "English", fr: "Français", es: "Español", it: "Italiano" };
export function localeName(code: string): string {
  return LOCALE_NAME[code] ?? code.toUpperCase();
}
