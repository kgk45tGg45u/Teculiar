import { Search } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import styles from "./domain-search.module.css";

export function DomainSearch({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  return (
    <section className={`section tight ${styles.band}`}>
      <div className={`container ${styles.inner}`}>
        <div>
          <span className="eyebrow">{isDe ? "Domains" : "Domains"}</span>
          <h2>{isDe ? "Suchen, registrieren oder transferieren." : "Search, register or transfer."}</h2>
          <p>
            {isDe
              ? "Premium-Service muss nicht teuer sein: Domains in derselben zuverlässigen Qualität – zu fairen Preisen und mit Unterstützung für hunderte TLDs."
              : "Premium service doesn't have to be expensive: domains with the same reliable quality, fair pricing, and support for hundreds of TLDs."}
          </p>
        </div>
        <form action={`/${locale}/domains/search`} className={styles.form}>
          <input className="input" defaultValue="meinname.com" aria-label="Domain" name="domain" />
          <Button icon={Search} type="submit">
            {isDe ? "Verfügbarkeit prüfen" : "Check availability"}
          </Button>
        </form>
      </div>
    </section>
  );
}
