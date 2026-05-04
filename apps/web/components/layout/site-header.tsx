import Link from "next/link";
import { ArrowRight, Server } from "lucide-react";
import { dictionary, type Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { ThemeToggle } from "../ui/theme-toggle";
import styles from "./site-header.module.css";

type SiteHeaderProps = {
  locale: Locale;
};

export function SiteHeader({ locale }: SiteHeaderProps) {
  const copy = dictionary[locale];
  const base = `/${locale}`;

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href={base}>
          <Server aria-hidden size={21} />
          <span>CrimsonGrid</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link href={`${base}/hosting`}>{copy.nav.hosting}</Link>
          <Link href={`${base}/vps`}>{copy.nav.vps}</Link>
          <Link href={`${base}/domains`}>{copy.nav.domains}</Link>
          <Link href={`${base}/pricing`}>{copy.nav.pricing}</Link>
          <Link href={`${base}/blog`}>{copy.nav.blog}</Link>
          <Link href={`${base}/contact`}>{copy.nav.contact}</Link>
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />
          <Button href="/client" icon={ArrowRight} variant="secondary">
            {copy.nav.client}
          </Button>
        </div>
      </div>
    </header>
  );
}
