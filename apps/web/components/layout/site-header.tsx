import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { dictionary, type Locale } from "../../lib/i18n";
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
};

export function SiteHeader({ brandLogo, brandHref, locale, variant = "site" }: SiteHeaderProps) {
  const copy = dictionary[locale];
  const base = `/${locale}`;
  const isPanel = variant === "admin";
  const brandLabel = isPanel ? "Teculiar" : "Dezhost";

  const navLinks = [
    { href: `${base}/domains`, label: copy.nav.domains },
    { href: `${base}/it-losungen`, label: copy.nav.itSolutions },
    { href: `${base}/webdesign`, label: copy.nav.webdesign },
    { href: `${base}/blog`, label: copy.nav.blog },
    { href: `${base}/uber-uns`, label: copy.nav.about },
    { href: `${base}/kontakt`, label: copy.nav.contact }
  ];

  const cloudChildren = [
    { href: `${base}/webhosting`, label: copy.nav.hosting },
    { href: `${base}/virtual-servers`, label: copy.nav.virtualServers }
  ];

  return (
    <header className={styles.header}>
      <DetailsAutoClose />
      <div className={`${styles.inner}${variant === "admin" ? ` ${styles.innerAdmin}` : ""}`}>
        <Link className={styles.brand} href={(brandHref ?? base) as Route}>
          {!isPanel && brandLogo ? <img alt={brandLabel} className={styles.brandLogo} src={brandLogo} /> : <><Globe aria-hidden size={21} /><span>{brandLabel}</span></>}
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <details className={styles.navDropdown}>
            <summary className={styles.navDropdownToggle}>
              {copy.nav.cloud}
              <ChevronDown aria-hidden size={14} className={styles.navChevron} />
            </summary>
            <div className={styles.navDropdownMenu}>
              {cloudChildren.map((link) => (
                <MenuLink href={link.href as Route} key={link.href}>{link.label}</MenuLink>
              ))}
            </div>
          </details>
          {navLinks.map((link) => (
            <Link href={link.href as Route} key={link.href}>{link.label}</Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <Suspense>
            <LanguageToggle locale={locale} />
          </Suspense>
          <AccountMenu />
          <MobileMenu
            cloudLabel={copy.nav.cloud}
            cloudChildren={cloudChildren}
            navLinks={navLinks}
          />
        </div>
      </div>
    </header>
  );
}
