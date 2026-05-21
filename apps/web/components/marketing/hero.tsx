import { ArrowRight, MessageCircle, ShieldCheck } from "lucide-react";
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
          {isDe ? "Schnell und sicheres Hosting aus Deutschland" : "Fast and secure hosting from Germany"}
        </span>
        <h1 className="display">
          {isDe ? "Brauchst du Raum?" : "Need some space?"}
        </h1>
        <p className="lead">
          {isDe
            ? "Weblösungen für Einzelpersonen, Vereine, Organisationen und kleine Unternehmen. Persönlich erklärt. Fair berechnet."
            : "Web solutions for individuals, associations, organisations and small businesses. Explained personally. Priced fairly."}
        </p>
        <div className={styles.actions}>
          <Button href={`/${locale}/webhosting`} icon={ArrowRight}>
            {isDe ? "Hosting-packete ansehen" : "View hosting"}
          </Button>
          <Button href={`/${locale}/kontakt`} variant="secondary" icon={MessageCircle}>
            {isDe ? "Kostenlose Beratung" : "Get free consultation"}
          </Button>
        </div>
        <div className={styles.signal}>
          <div>
            <strong>99.9%</strong>
            <span>{isDe ? "Verfügbarkeit" : "Uptime"}</span>
          </div>
          <div>
            <strong>DE</strong>
            <span>{isDe ? "Server & Support" : "Servers & support"}</span>
          </div>
          <div>
            <strong>DSGVO</strong>
            <span>{isDe ? "Datenschutz inklusive" : "Privacy included"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
