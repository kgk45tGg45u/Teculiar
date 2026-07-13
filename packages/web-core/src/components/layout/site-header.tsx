import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { type Locale } from "../../lib/i18n";
import { getDictionary } from "../../lib/dictionary";
import { SUPPORTED_LOCALES } from "../../lib/supported-locales";
import { type NavNode, type StorefrontTheme, toNav } from "../../lib/storefront-theme";
import { AccountMenu } from "./account-menu";
import { DetailsAutoClose } from "./details-auto-close";
import { LanguageToggle } from "./language-toggle";
import { MenuLink } from "./menu-link";
import { MobileMenu } from "./mobile-menu";
import styles from "./site-header.module.css";

type SiteHeaderProps = {
  brandLogo?: string;
  brandHref?: string;
  locale: Locale;
  variant?: "site" | "admin";
  languages?: string[];
  currencies?: string[];
  theme?: StorefrontTheme | null;
  /** Where the tenant's client area lives (Phase 2.3) — forwarded to the account menu. */
  clientBaseUrl?: string;
};

export function SiteHeader({ brandLogo, brandHref, locale, variant = "site", languages = SUPPORTED_LOCALES, currencies = ["EUR", "USD"], theme, clientBaseUrl }: SiteHeaderProps) {
  const copy = getDictionary(locale);
  const base = `/${locale}`;
  const isPanel = variant === "admin";
  const brandLabel = "Teculiar";
  const nav = buildNav(theme, locale, copy, base);

  return (
    <header className={styles.header}>
      <DetailsAutoClose />
      <div className={`${styles.inner}${variant === "admin" ? ` ${styles.innerAdmin}` : ""}`}>
        <Link className={styles.brand} href={(brandHref ?? base) as Route}>
          {!isPanel && brandLogo ? <img alt={brandLabel} className={styles.brandLogo} src={brandLogo} /> : <><Globe aria-hidden size={21} /><span>{brandLabel}</span></>}
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {nav.map((node) => (node.children.length ? (
            <details className={styles.navDropdown} key={node.label}>
              <summary className={styles.navDropdownToggle}>
                {node.label}
                <ChevronDown aria-hidden size={14} className={styles.navChevron} />
              </summary>
              <div className={styles.navDropdownMenu}>
                {node.children.map((child) => (
                  <MenuLink href={(child.href ?? base) as Route} key={child.href ?? child.label} target={child.newTab ? "_blank" : undefined}>{child.label}</MenuLink>
                ))}
              </div>
            </details>
          ) : node.href ? (
            <Link href={node.href as Route} key={node.href} target={node.newTab ? "_blank" : undefined}>{node.label}</Link>
          ) : null))}
        </nav>

        <div className={styles.actions}>
          <Suspense>
            <LanguageToggle locale={locale} languages={languages} currencies={currencies} />
          </Suspense>
          <AccountMenu clientBaseUrl={clientBaseUrl} />
          <MobileMenu nav={nav} />
        </div>
      </div>
    </header>
  );
}

// Build the nav tree from theme menu data; fall back to the historical hard-coded nav so the header
// never breaks if the theme API is briefly unavailable. Seeded slugs equal today's paths, so the
// data-driven output is identical to the previous hard-coded nav.
function buildNav(theme: StorefrontTheme | null | undefined, locale: string, copy: ReturnType<typeof getDictionary>, base: string): NavNode[] {
  if (theme?.menus?.main?.length) {
    return toNav(theme.menus.main, locale, theme.languages[0] ?? locale);
  }
  const leaf = (label: string, path: string): NavNode => ({ label, href: `${base}/${path}`, newTab: false, children: [] });
  return [
    { label: copy.common.nav.cloud, href: null, newTab: false, children: [
      leaf(copy.common.nav.hosting, "webhosting"),
      leaf(copy.common.nav.virtualServers, "virtual-servers"),
      leaf(copy.common.nav.reseller, "reseller")
    ] },
    leaf(copy.common.nav.domains, "domains"),
    leaf(copy.common.nav.itSolutions, "it-losungen"),
    leaf(copy.common.nav.webdesign, "webdesign"),
    leaf(copy.common.nav.blog, "blog"),
    leaf(copy.common.nav.about, "uber-uns"),
    leaf(copy.common.nav.contact, "kontakt")
  ];
}
