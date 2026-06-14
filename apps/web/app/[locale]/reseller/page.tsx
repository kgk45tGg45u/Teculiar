import { ArrowRight, Check, HardDrive, Infinity as InfinityIcon, Layers, Lock, MemoryStick, RefreshCw, Server, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { apiGet, money, type ApiProduct } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "./reseller.module.css";

type FallbackCard = {
  name: string;
  priceCents: number;
  accounts: string;
  disk: string;
  cpu: string;
  ram: string;
  featured?: boolean;
};

const FALLBACK: FallbackCard[] = [
  { name: "Reseller Start", priceCents: 499, accounts: "25", disk: "25 GB", cpu: "1", ram: "1 GB" },
  { name: "Reseller Plus", priceCents: 899, accounts: "50", disk: "50 GB", cpu: "1,5", ram: "2 GB" },
  { name: "Reseller Pro", priceCents: 1699, accounts: "100", disk: "100 GB", cpu: "2", ram: "4 GB", featured: true },
  { name: "Reseller Max", priceCents: 3299, accounts: "200", disk: "200 GB", cpu: "4", ram: "8 GB" }
];

function configValue(product: ApiProduct, key: string): string | undefined {
  const config = (product.configs ?? []).find((c) => c.key === key);
  if (!config) return undefined;
  const first = Array.isArray(config.values) ? config.values[0] : config.values;
  return first === undefined || first === null ? undefined : String(first);
}

export default async function ResellerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  const products = await apiGet<ApiProduct[]>("/storefront/products?category=reseller");

  const labels = isDe
    ? { accounts: "Kundenkonten", disk: "NVMe-Speicher", cpu: "vCPU", ram: "RAM", traffic: "Traffic", trafficValue: "Unbegrenzt", perMonth: "/ Monat", order: "Jetzt bestellen", enquire: "Anfragen", popular: "Beliebt" }
    : { accounts: "client accounts", disk: "NVMe storage", cpu: "vCPU", ram: "RAM", traffic: "Bandwidth", trafficValue: "Unlimited", perMonth: "/ month", order: "Order now", enquire: "Enquire", popular: "Popular" };

  const cards = products && products.length > 0
    ? products.map((product, index) => {
        const price = product.prices.find((p) => p.billingCycle === "MONTHLY") ?? product.prices[0];
        return {
          key: product.id,
          name: product.name,
          priceLabel: price ? money(price.amountCents, price.currency) : undefined,
          accounts: configValue(product, "accounts") ?? "—",
          disk: configValue(product, "disk") ?? "—",
          cpu: configValue(product, "cpu") ?? "—",
          ram: configValue(product, "ram") ?? "—",
          traffic: configValue(product, "bandwidth") ?? labels.trafficValue,
          href: `/${locale}/order/${product.id}`,
          orderLabel: labels.order,
          featured: index === 2
        };
      })
    : FALLBACK.map((card) => ({
        key: card.name,
        name: card.name,
        priceLabel: money(card.priceCents, "EUR"),
        accounts: card.accounts,
        disk: card.disk,
        cpu: card.cpu,
        ram: card.ram,
        traffic: labels.trafficValue,
        href: `/${locale}/kontakt`,
        orderLabel: labels.enquire,
        featured: card.featured ?? false
      }));

  const includes = isDe
    ? ["White-Label", "cPanel & DirectAdmin", "Gratis SSL"]
    : ["White label", "cPanel & DirectAdmin", "Free SSL"];

  const features = isDe
    ? [
        { icon: Layers, title: "White-Label", body: "Biete cPanel oder DirectAdmin unter deiner eigenen Marke an – komplett unsichtbar gebrandet." },
        { icon: InfinityIcon, title: "Unbegrenzte Ressourcen", body: "Unbegrenzter Traffic, Domains, Subdomains, Datenbanken und Postfächer in allen Paketen." },
        { icon: ShieldCheck, title: "Sicherheit inklusive", body: "DDoS-Schutz und die Imunify360-Sicherheits-Suite schützen alle Kundenseiten." },
        { icon: RefreshCw, title: "Tägliche Backups", body: "Tägliche Offsite-Backups sind in jedem Paket enthalten." },
        { icon: Lock, title: "Gratis SSL", body: "Kostenlose SSL-Zertifikate für alle Seiten deiner Kunden – automatisch erneuert." },
        { icon: Server, title: "cPanel & DirectAdmin", body: "Beide Control-Panels mit PHP- und NodeJS-Selector. Deine Kunden wählen, was sie brauchen." }
      ]
    : [
        { icon: Layers, title: "White label", body: "Offer cPanel or DirectAdmin to your clients under your own brand, completely unbranded." },
        { icon: InfinityIcon, title: "Unlimited resources", body: "Unlimited bandwidth, domains, subdomains, databases and mailboxes across all plans." },
        { icon: ShieldCheck, title: "Security included", body: "DDoS protection and the Imunify360 security suite protect every client site." },
        { icon: RefreshCw, title: "Daily backups", body: "Daily offsite backups are included in every plan." },
        { icon: Lock, title: "Free SSL", body: "Free SSL certificates for all of your clients' sites – automatically renewed." },
        { icon: Server, title: "cPanel & DirectAdmin", body: "Both control panels with PHP and NodeJS selectors. Your clients choose what they need." }
      ];

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">
            <Layers aria-hidden size={15} />
            {isDe ? "Reseller-Hosting" : "Reseller hosting"}
          </span>
          <h1>{isDe ? "Starte dein eigenes Hosting-Business." : "Start your own hosting business."}</h1>
          <p>
            {isDe
              ? "Verkaufe Webhosting unter deiner eigenen Marke. White-Label, deutsche Rechenzentren und unbegrenzte Ressourcen – wir kümmern uns um die Infrastruktur, du um deine Kunden."
              : "Sell web hosting under your own brand. White label, German data centres and unlimited resources – we handle the infrastructure, you handle your clients."}
          </p>
          <div className={styles.heroActions}>
            <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
              {isDe ? "Beratung anfragen" : "Request consultation"}
            </Button>
            <Button href={`/${locale}/webhosting`} variant="secondary">
              {isDe ? "Zum Webhosting" : "View web hosting"}
            </Button>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="section tight">
        <div className="container">
          <span className="eyebrow">{isDe ? "Reseller-Pakete" : "Reseller packages"}</span>
          <h2 className={styles.sectionTitle}>{isDe ? "Wähle dein Reseller-Paket." : "Choose your reseller plan."}</h2>

          <div className={styles.productGrid}>
            {cards.map((card) => (
              <div className={`${styles.productCard}${card.featured ? ` ${styles.featured}` : ""}`} key={card.key}>
                {card.featured ? <span className={styles.popular}>{labels.popular}</span> : null}
                <div className={styles.productHeader}>
                  <Server aria-hidden size={22} className={styles.productIcon} />
                  <h3>{card.name}</h3>
                </div>
                {card.priceLabel ? (
                  <div className={styles.productPrice}>
                    <strong>{card.priceLabel}</strong>
                    <span>{labels.perMonth}</span>
                  </div>
                ) : null}
                <div className={styles.accounts}>
                  <strong>{card.accounts}</strong>
                  <span>{labels.accounts}</span>
                </div>
                <ul className={styles.specList}>
                  <li><HardDrive aria-hidden size={15} /><span>{labels.disk}: <strong>{card.disk}</strong></span></li>
                  <li><MemoryStick aria-hidden size={15} /><span>{labels.ram}: <strong>{card.ram}</strong></span></li>
                  <li><Server aria-hidden size={15} /><span>{labels.cpu}: <strong>{card.cpu}</strong></span></li>
                  <li><Users aria-hidden size={15} /><span>{labels.traffic}: <strong>{card.traffic}</strong></span></li>
                </ul>
                <div className={styles.includes}>
                  {includes.map((item) => (
                    <span className={styles.chip} key={item}><Check aria-hidden size={12} />{item}</span>
                  ))}
                </div>
                <Link className={styles.orderBtn} href={card.href as Route}>
                  {card.orderLabel}
                  <ArrowRight aria-hidden size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={`section tight ${styles.featuresSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "In jedem Paket" : "In every plan"}</span>
          <h2 className={styles.sectionTitle}>{isDe ? "Alles, um durchzustarten." : "Everything you need to get started."}</h2>
          <div className={styles.featureGrid}>
            {features.map(({ icon: Icon, title, body }) => (
              <div className={styles.featureCard} key={title}>
                <Icon aria-hidden size={20} className={styles.featureIcon} />
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Callout */}
      <section className={`section tight ${styles.calloutSection}`}>
        <div className="container">
          <div className={styles.calloutInner}>
            <div>
              <span className="eyebrow">{isDe ? "Mehr Bedarf?" : "Need more?"}</span>
              <h2>{isDe ? "Individuelle Reseller-Lösungen." : "Custom reseller solutions."}</h2>
              <p>
                {isDe
                  ? "Du brauchst mehr Kundenkonten, ein eigenes Nameserver-Branding oder eine WHMCS-Anbindung? Sprich mit uns – wir schnüren dir ein passendes Paket."
                  : "Need more client accounts, your own nameserver branding or a WHMCS integration? Talk to us – we'll put together a plan that fits."}
              </p>
            </div>
            <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
              {isDe ? "Angebot anfragen" : "Request quote"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
