import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { ChevronDown, Globe, Menu } from "lucide-react";
import { dictionary, type Locale } from "../../lib/i18n";
import { AccountMenu } from "./account-menu";
import { LanguageToggle } from "./language-toggle";
import styles from "./site-header.module.css";

type SiteHeaderProps = {
  brandLogo?: string;
  locale: Locale;
};

export function SiteHeader({ brandLogo, locale }: SiteHeaderProps) {
  const copy = dictionary[locale];
  const base = `/${locale}`;

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
      <div className={styles.inner}>
        <Link className={styles.brand} href={base as Route}>
          {brandLogo ? <img alt="Dezhost" className={styles.brandLogo} src={brandLogo} /> : <><Globe aria-hidden size={21} /><span>Dezhost</span></>}
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {/* Cloud dropdown */}
          <details className={styles.navDropdown}>
            <summary className={styles.navDropdownToggle}>
              {copy.nav.cloud}
              <ChevronDown aria-hidden size={14} className={styles.navChevron} />
            </summary>
            <div className={styles.navDropdownMenu}>
              {cloudChildren.map((link) => (
                <Link href={link.href as Route} key={link.href}>{link.label}</Link>
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
          <details className={styles.mobileMenu}>
            <summary aria-label="Menu">
              <Menu aria-hidden size={18} />
              <span>Menu</span>
            </summary>
            <nav className={styles.mobileNav} aria-label="Mobile primary">
              {/* Cloud group */}
              <details className={styles.mobileCloudGroup}>
                <summary className={styles.mobileCloudToggle}>
                  {copy.nav.cloud}
                  <ChevronDown aria-hidden size={14} />
                </summary>
                <div className={styles.mobileCloudChildren}>
                  {cloudChildren.map((link) => (
                    <Link href={link.href as Route} key={link.href}>{link.label}</Link>
                  ))}
                </div>
              </details>
              {navLinks.map((link) => (
                <Link href={link.href as Route} key={link.href}>{link.label}</Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
