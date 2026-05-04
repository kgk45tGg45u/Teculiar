import { ArrowRight, ShieldCheck } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import styles from "./hero.module.css";

export function Hero({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  return (
    <section className={`section ${styles.hero}`}>
      <div className="container">
        <span className="eyebrow">
          <ShieldCheck aria-hidden size={16} />
          {isDe ? "Deutsche Infrastruktur. Klare Verträge." : "German infrastructure. Clear contracts."}
        </span>
        <h1 className="display">CrimsonGrid</h1>
        <p className="lead">
          {isDe
            ? "Hosting, Domains, Cloud Server und Managed IT für Unternehmen, die saubere Abrechnung, starke Sicherheit und direkten Support brauchen."
            : "Hosting, domains, cloud servers, and managed IT for teams that need clean billing, strong security, and direct support."}
        </p>
        <div className={styles.actions}>
          <Button href={`/${locale}/pricing`} icon={ArrowRight}>
            {isDe ? "Pakete ansehen" : "View packages"}
          </Button>
          <Button href={`/${locale}/contact`} variant="secondary">
            {isDe ? "Beratung buchen" : "Book consultation"}
          </Button>
        </div>
        <div className={styles.signal}>
          <div>
            <strong>99.95%</strong>
            <span>{isDe ? "Zielverfügbarkeit" : "Target uptime"}</span>
          </div>
          <div>
            <strong>DE</strong>
            <span>{isDe ? "Standort und Support" : "Location and support"}</span>
          </div>
          <div>
            <strong>19%</strong>
            <span>{isDe ? "USt. und EU-Logik" : "VAT and EU logic"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
