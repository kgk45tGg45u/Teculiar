import { FileText, LockKeyhole, ReceiptText, UsersRound } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import styles from "./platform-section.module.css";

export function PlatformSection({ locale }: { locale: Locale }) {
  const isDe = locale === "de";
  const items = [
    {
      icon: ReceiptText,
      title: isDe ? "WHMCS-nahe Abrechnung" : "WHMCS-like billing",
      body: isDe
        ? "Zyklen, Setupgebühren, Gutscheine, Partnerprovisionen und EU-Steuerlogik."
        : "Cycles, setup fees, coupons, affiliate attribution, and EU tax logic."
    },
    {
      icon: UsersRound,
      title: isDe ? "Teams und Kontakte" : "Teams and contacts",
      body: isDe
        ? "Mandantenfähige Firmenkonten mit Abrechnungskontakten und Rollen."
        : "Multi-user company accounts with billing contacts and roles."
    },
    {
      icon: FileText,
      title: isDe ? "CMS und Rechtstexte" : "CMS and legal pages",
      body: isDe
        ? "Blog, Landingpages, AGB, Impressum und Datenschutz mit Übersetzungen."
        : "Blog, landing pages, terms, legal notice, and privacy with translations."
    },
    {
      icon: LockKeyhole,
      title: isDe ? "Sicherheitskern" : "Security core",
      body: isDe
        ? "JWT-Rotation, TOTP, CSRF, Rechte und DSGVO-Export sind vorgesehen."
        : "JWT rotation, TOTP, CSRF, permissions, and GDPR export are built in."
    }
  ];

  return (
    <section className="section">
      <div className="container">
        <div className={styles.header}>
          <span className="eyebrow">{isDe ? "Plattform" : "Platform"}</span>
          <h2>{isDe ? "Ein System für Verkauf, Betrieb und Support." : "One system for sales, operations, and support."}</h2>
        </div>
        <div className="grid four">
          {items.map((item) => (
            <div className={styles.item} key={item.title}>
              <item.icon aria-hidden size={24} />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
