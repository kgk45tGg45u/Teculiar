// Parity seed for the "Blue" theme — a faithful mirror of today's hard-coded storefront
// header (site-header.tsx), footer (site-footer.tsx) and pages. Per-locale labels are pulled
// straight from the @dezhost/locales packs so de/en (and any 3rd language) stay in sync with
// what the live site renders today. Slugs are seeded identical across locales because today's
// routes are NOT localized yet (both /en/it-losungen and /de/it-losungen share one path); the
// admin localizes them later via the Pages tab, and the routing flip serves them.
import { t } from "../../common/i18n";

export type LocaleMap = Record<string, string>;

type PageDef = {
  key: string; // stable identifier + maps to today's built-in renderer
  component: string; // route the built-in renderer lives at (used by the Phase 2 flip)
  slug: string; // live path today, same for every locale (parity)
  order: number;
  nameKey?: string; // pack key for the display name
  nameLiteral?: LocaleMap; // for pages with no pack label (home)
};

// Order mirrors the header (Cloud children first), then the footer's legal column.
export const BLUE_PAGE_DEFS: PageDef[] = [
  { key: "home", component: "home", nameLiteral: { de: "Startseite", en: "Home" }, slug: "", order: 0 },
  { key: "webhosting", component: "webhosting", nameKey: "common.nav.hosting", slug: "webhosting", order: 1 },
  { key: "virtual-servers", component: "virtual-servers", nameKey: "common.nav.virtualServers", slug: "virtual-servers", order: 2 },
  { key: "reseller", component: "reseller", nameKey: "common.nav.reseller", slug: "reseller", order: 3 },
  { key: "domains", component: "domains", nameKey: "common.nav.domains", slug: "domains", order: 4 },
  { key: "it-losungen", component: "it-losungen", nameKey: "common.nav.itSolutions", slug: "it-losungen", order: 5 },
  { key: "webdesign", component: "webdesign", nameKey: "common.nav.webdesign", slug: "webdesign", order: 6 },
  { key: "blog", component: "blog", nameKey: "common.nav.blog", slug: "blog", order: 7 },
  { key: "uber-uns", component: "uber-uns", nameKey: "common.nav.about", slug: "uber-uns", order: 8 },
  { key: "kontakt", component: "kontakt", nameKey: "common.nav.contact", slug: "kontakt", order: 9 },
  { key: "legal-impressum", component: "legal/impressum", nameKey: "storefront.footer.legal.impressum", slug: "legal/impressum", order: 10 },
  { key: "legal-datenschutz", component: "legal/datenschutz", nameKey: "storefront.footer.legal.datenschutz", slug: "legal/datenschutz", order: 11 },
  { key: "legal-agb", component: "legal/agb", nameKey: "storefront.footer.legal.agb", slug: "legal/agb", order: 12 },
  { key: "legal-zahlung", component: "legal/zahlung", nameKey: "storefront.footer.legal.zahlung", slug: "legal/zahlung", order: 13 },
  { key: "legal-widerruf", component: "legal/widerruf", nameKey: "storefront.footer.legal.widerruf", slug: "legal/widerruf", order: 14 }
];

export type MenuDef = { labelKey: string; pageKey?: string; order: number; children?: MenuDef[] };

// MAIN menu — mirrors site-header.tsx: the "Cloud" parent (links nothing) + its three children,
// then the top-level page links in header order.
export const BLUE_MAIN_MENU: MenuDef[] = [
  {
    labelKey: "common.nav.cloud",
    order: 0,
    children: [
      { labelKey: "common.nav.hosting", pageKey: "webhosting", order: 0 },
      { labelKey: "common.nav.virtualServers", pageKey: "virtual-servers", order: 1 },
      { labelKey: "common.nav.reseller", pageKey: "reseller", order: 2 }
    ]
  },
  { labelKey: "common.nav.domains", pageKey: "domains", order: 1 },
  { labelKey: "common.nav.itSolutions", pageKey: "it-losungen", order: 2 },
  { labelKey: "common.nav.webdesign", pageKey: "webdesign", order: 3 },
  { labelKey: "common.nav.blog", pageKey: "blog", order: 4 },
  { labelKey: "common.nav.about", pageKey: "uber-uns", order: 5 },
  { labelKey: "common.nav.contact", pageKey: "kontakt", order: 6 }
];

// LEGAL menu — mirrors the footer's legal column.
export const BLUE_LEGAL_MENU: MenuDef[] = [
  { labelKey: "storefront.footer.legal.impressum", pageKey: "legal-impressum", order: 0 },
  { labelKey: "storefront.footer.legal.datenschutz", pageKey: "legal-datenschutz", order: 1 },
  { labelKey: "storefront.footer.legal.agb", pageKey: "legal-agb", order: 2 },
  { labelKey: "storefront.footer.legal.zahlung", pageKey: "legal-zahlung", order: 3 },
  { labelKey: "storefront.footer.legal.widerruf", pageKey: "legal-widerruf", order: 4 }
];

// Footer free-text content (the parts NOT covered by the LEGAL menu). Keyed under storefront.footer.*.
export const BLUE_FOOTER_KEYS = [
  "mission",
  "servicesHeading",
  "legalHeading",
  "ctaHeading",
  "ctaText",
  "ctaButton",
  "rightsReserved",
  "tagline"
] as const;

/** Resolve a pack key into a { locale: value } map across the configured languages. */
export function localeMap(locales: string[], key: string): LocaleMap {
  const map: LocaleMap = {};
  for (const loc of locales) {
    map[loc] = t(loc, key);
  }
  return map;
}
