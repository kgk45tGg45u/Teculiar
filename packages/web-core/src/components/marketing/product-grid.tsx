import { ArrowRight, Check, Cloud, Globe, HardDrive } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Price } from "./price";
import type { Locale } from "../../lib/i18n";
import styles from "./product-grid.module.css";

type StaticCard = {
  Icon: typeof Cloud;
  titleDe: string;
  titleEn: string;
  // "Starting from" price in the main currency (cents); rendered currency/locale-aware.
  priceFromCents: number;
  pricePrefixDe: string;
  pricePrefixEn: string;
  priceSuffixDe: string;
  priceSuffixEn: string;
  highlightsDe: string[];
  highlightsEn: string[];
  href: string;
};

const CARDS: StaticCard[] = [
  {
    Icon: HardDrive,
    titleDe: "Webhosting",
    titleEn: "Web Hosting",
    priceFromCents: 399,
    pricePrefixDe: "ab ",
    pricePrefixEn: "from ",
    priceSuffixDe: "/Monat",
    priceSuffixEn: "/month",
    highlightsDe: ["NVMe SSD Speicher", "Tägliche Backups", "SSL inklusive", "DSGVO-konform", "PHP 8.1–8.4"],
    highlightsEn: ["NVMe SSD storage", "Daily backups", "SSL included", "GDPR-compliant", "PHP 8.1–8.4"],
    href: "webhosting"
  },
  {
    Icon: Globe,
    titleDe: "Domain-Namen",
    titleEn: "Domain Names",
    priceFromCents: 99,
    pricePrefixDe: "ab ",
    pricePrefixEn: "from ",
    priceSuffixDe: "/Jahr",
    priceSuffixEn: "/year",
    highlightsDe: [".de, .com, .org, .net", "DNS-Verwaltung", "WHOIS-Datenschutz", "Einfache Übertragung"],
    highlightsEn: [".de, .com, .org, .net", "DNS management", "WHOIS privacy", "Easy transfer"],
    href: "domains"
  },
  {
    Icon: Cloud,
    titleDe: "Nextcloud Server",
    titleEn: "Nextcloud Server",
    priceFromCents: 2000,
    pricePrefixDe: "Einrichtung ab ",
    pricePrefixEn: "Setup from ",
    priceSuffixDe: "",
    priceSuffixEn: "",
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
          {CARDS.map((card, index) => {
            const { Icon, href, priceFromCents } = card;
            const title = isDe ? card.titleDe : card.titleEn;
            const pricePrefix = isDe ? card.pricePrefixDe : card.pricePrefixEn;
            const priceSuffix = isDe ? card.priceSuffixDe : card.priceSuffixEn;
            const highlights = isDe ? card.highlightsDe : card.highlightsEn;
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
                  <strong>{pricePrefix}<Price cents={priceFromCents} />{priceSuffix}</strong>
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
