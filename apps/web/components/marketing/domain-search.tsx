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
          <h2>{isDe ? "Suchen, transferieren, verlängern." : "Search, transfer, renew."}</h2>
          <p>
            {isDe
              ? "Domain-Workflows sind im Portal mit Rechnungen, Kontakten und Services verbunden."
              : "Domain workflows connect to portal billing, contacts, and services."}
          </p>
        </div>
        <form action={`/${locale}/domains/search`} className={styles.form}>
          <input className="input" defaultValue="meinefirma.de" aria-label="Domain" name="domain" />
          <Button icon={Search} type="submit">
            {isDe ? "Prüfen" : "Check"}
          </Button>
        </form>
      </div>
    </section>
  );
}
