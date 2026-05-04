import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import styles from "./site-footer.module.css";

export function SiteFooter({ locale }: { locale: Locale }) {
  const legal = locale === "de" ? ["AGB", "Impressum", "Datenschutz"] : ["Terms", "Legal Notice", "Privacy"];

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div>
          <strong>CrimsonGrid</strong>
          <p>{locale === "de" ? "Hosting und Managed IT aus Deutschland." : "Hosting and managed IT from Germany."}</p>
        </div>
        <nav className={styles.links} aria-label="Legal">
          {legal.map((item) => (
            <Link href={`/${locale}/legal/${item.toLowerCase()}`} key={item}>
              {item}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
