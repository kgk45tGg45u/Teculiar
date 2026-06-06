import { ArrowRight, Check, Cloud, Globe, HardDrive } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import type { Locale } from "../../lib/i18n";
import styles from "./product-grid.module.css";

type StaticCard = {
  Icon: typeof Cloud;
  titleDe: string;
  titleEn: string;
  priceDe: string;
  priceEn: string;
  highlightsDe: string[];
  highlightsEn: string[];
  href: string;
};

const CARDS: StaticCard[] = [
  {
    Icon: HardDrive,
    titleDe: "Webhosting",
    titleEn: "Web Hosting",
    priceDe: "ab 3,99 €/Monat",
    priceEn: "from €3.99/month",
    highlightsDe: ["NVMe SSD Speicher", "Tägliche Backups", "SSL inklusive", "DSGVO-konform", "PHP 8.1–8.4"],
    highlightsEn: ["NVMe SSD storage", "Daily backups", "SSL included", "GDPR-compliant", "PHP 8.1–8.4"],
    href: "webhosting"
  },
  {
    Icon: Globe,
    titleDe: "Domain-Namen",
    titleEn: "Domain Names",
    priceDe: "ab 0,99 €/Jahr",
    priceEn: "from €0.99/year",
    highlightsDe: [".de, .com, .org, .net", "DNS-Verwaltung", "WHOIS-Datenschutz", "Einfache Übertragung"],
    highlightsEn: [".de, .com, .org, .net", "DNS management", "WHOIS privacy", "Easy transfer"],
    href: "domains"
  },
  {
    Icon: Cloud,
    titleDe: "Nextcloud Server",
    titleEn: "Nextcloud Server",
    priceDe: "Einrichtung ab 20 €",
    priceEn: "Setup from €20",
    highlightsDe: ["Eigene private Cloud", "Kein Google / Dropbox", "DSGVO-konform", "Deutsche Server"],
    highlightsEn: ["Your own private cloud", "No Google / Dropbox", "GDPR-compliant", "German servers"],
    href: "it-losungen"
  }
];

export function ProductGrid({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  return (
    <section className="section">
      <div className="container">
        <span className="eyebrow">{isDe ? "Unsere Leistungen" : "Our services"}</span>
        <h2 className={styles.heading}>
          {isDe ? "Wähle das passende Angebot." : "Choose the right offer for you."}
        </h2>
        <div className="grid three">
          {CARDS.map(({ Icon, titleDe, titleEn, priceDe, priceEn, highlightsDe, highlightsEn, href }, index) => {
            const title = isDe ? titleDe : titleEn;
            const price = isDe ? priceDe : priceEn;
            const highlights = isDe ? highlightsDe : highlightsEn;
            const fullHref = `/${locale}/${href}`;
            return (
              <Card key={title} tone={index === 1 ? "selected" : "default"}>
                <div className={styles.icon}>
                  <Icon aria-hidden size={22} />
                </div>
                <div>
                  <h3>{title}</h3>
                </div>
                <div className={styles.price}>
                  <strong>{price}</strong>
                </div>
                <ul className={styles.list}>
                  {highlights.map((h) => (
                    <li key={h}>
                      <Check aria-hidden size={16} />
                      {h}
                    </li>
                  ))}
                </ul>
                <Button href={fullHref} icon={ArrowRight} variant="secondary">
                  {isDe ? "Mehr" : "More"}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
