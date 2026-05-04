import { ArrowRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default function HostingPage({ params }: { params: { locale: string } }) {
  const locale = getLocale(params.locale);
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Shared Hosting" : "Shared hosting"}</span>
          <h1>{isDe ? "Webhosting mit sauberer Verwaltung und planbaren Upgrades." : "Web hosting with clean management and predictable upgrades."}</h1>
          <p>
            {isDe
              ? "Pakete mit Mail, Backups, PHP-Versionen, Add-ons und Upgrade-Pfaden. Ideal für Websites, Agenturen und kleine Commerce-Projekte."
              : "Packages with mail, backups, PHP versions, add-ons, and upgrade paths. Built for websites, agencies, and small commerce projects."}
          </p>
          <Button href={`/${locale}/pricing`} icon={ArrowRight}>
            {isDe ? "Hosting vergleichen" : "Compare hosting"}
          </Button>
        </div>
      </section>
      <section className="section tight">
        <div className={`container ${styles.row}`}>
          <div>
            <span className="eyebrow">{isDe ? "Konfiguration" : "Configuration"}</span>
            <h2>{isDe ? "Optionen statt starre Pakete." : "Options without rigid packages."}</h2>
          </div>
          <ul className={styles.featureList}>
            <li>
              <strong>NVMe</strong>
              <span>10 GB - 500 GB</span>
            </li>
            <li>
              <strong>PHP</strong>
              <span>8.1 - 8.4</span>
            </li>
            <li>
              <strong>{isDe ? "Backups" : "Backups"}</strong>
              <span>{isDe ? "Täglich, 30 Tage" : "Daily, 30 days"}</span>
            </li>
            <li>
              <strong>{isDe ? "Add-ons" : "Add-ons"}</strong>
              <span>Mailboxes, SSL, staging</span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
