import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Globe } from "lucide-react";
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
        <Link className={styles.brand} href={base as Route}>
          <Globe aria-hidden size={21} />
          <span>Dezhost</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link href={`${base}/hosting` as Route}>{copy.nav.hosting}</Link>
          <Link href={`${base}/domains` as Route}>{copy.nav.domains}</Link>
          <Link href={`${base}/vps` as Route}>{copy.nav.vps}</Link>
          <Link href={`${base}/webdesign` as Route}>{copy.nav.webdesign}</Link>
          <Link href={`${base}/pricing` as Route}>{copy.nav.pricing}</Link>
          <Link href={`${base}/blog` as Route}>{copy.nav.blog}</Link>
          <Link href={`${base}/about` as Route}>{copy.nav.about}</Link>
          <Link href={`${base}/contact` as Route}>{copy.nav.contact}</Link>
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
