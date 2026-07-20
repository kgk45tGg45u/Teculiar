import { ArrowRight, Check, Cpu, HardDrive, Lock, Server, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { apiGet, productDescription, productName, type ApiProduct } from "@teculiar/web-core/lib/api";
import { Button } from "@teculiar/web-core/components/ui/button";
import { Price } from "@teculiar/web-core/components/marketing/price";
import { getLocale, type Locale } from "@teculiar/web-core/lib/i18n";
import type { Metadata } from "next";
import { pageMetadata } from "@teculiar/web-core/lib/storefront-theme";
import { CustomPageGate } from "../../../components/customizer/custom-page";
import styles from "./virtual-servers.module.css";

const FALLBACK_VPS = {
  name: "Cloud VPS Basic",
  descDe: "Volle Root-Kontrolle, NVMe-Speicher, 20 TB Traffic und deutsche Rechenzentren.",
  descEn: "Full root control, NVMe storage, 20 TB traffic and German data centres.",
  priceFromCents: 799,
  specs: [
    { label: "vCPU", value: "2" },
    { label: "RAM", value: "4 GB" },
    { label: "Storage", value: "40 GB NVMe SSD" },
    { label: "Bandwidth", value: "20 TB/month" },
    { label: "Location", value: "Germany" }
  ]
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata("virtual-servers", locale);
}

export default async function VirtualServersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="virtual-servers">
      <VirtualServersPageBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

async function VirtualServersPageBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  const [products, themeSettings] = await Promise.all([
    apiGet<ApiProduct[]>("/storefront/products?category=virtual-servers"),
    apiGet<{ themeBlueVirtualServersHeroImageUrl?: string }>("/storefront/settings")
  ]);
  const heroImageUrl = themeSettings?.themeBlueVirtualServersHeroImageUrl ?? null;

  const features = isDe
    ? [
        { icon: Cpu, title: "Volle Root-Kontrolle", body: "Vollständiger SSH-Zugang und Root-Rechte. Installiere jede Software, die du brauchst." },
        { icon: Zap, title: "NVMe SSD Speicher", body: "Hochleistungs-NVMe-Festplatten für schnelle Ladezeiten und niedrige Latenz." },
        { icon: ShieldCheck, title: "Deutsche Rechenzentren", body: "Alle Server stehen in Deutschland. DSGVO-konform und datenschutzfreundlich." },
        { icon: Lock, title: "DDoS-Schutz", body: "Grundlegender DDoS-Schutz ist im Preis inbegriffen." },
        { icon: Server, title: "Linux nach Wahl", body: "Ubuntu, Debian, CentOS und weitere Distributionen – du entscheidest." },
        { icon: HardDrive, title: "Tägliche Backups", body: "Automatische Backups schützen deine Daten vor Verlust." }
      ]
    : [
        { icon: Cpu, title: "Full root control", body: "Full SSH access and root privileges. Install any software you need." },
        { icon: Zap, title: "NVMe SSD storage", body: "High-performance NVMe drives for fast loading times and low latency." },
        { icon: ShieldCheck, title: "German data centres", body: "All servers are located in Germany. GDPR-compliant and privacy-friendly." },
        { icon: Lock, title: "DDoS protection", body: "Basic DDoS protection is included in the price." },
        { icon: Server, title: "Linux of your choice", body: "Ubuntu, Debian, CentOS and more distributions – you decide." },
        { icon: HardDrive, title: "Daily backups", body: "Automatic backups protect your data from loss." }
      ];

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow">
                <Cpu aria-hidden size={15} />
                {isDe ? "Cloud-Server" : "Cloud servers"}
              </span>
              <h1>
                {isDe
                  ? "Dein eigener Cloud-Server."
                  : "Your own cloud server."}
              </h1>
              <p>
                {isDe
                  ? "Volle Kontrolle, deutsche Rechenzentren, faire Preise. Ideal für Entwickler, Vereine und Organisationen mit individuellen Anforderungen."
                  : "Full control, German data centres, fair prices. Ideal for developers, associations and organisations with individual requirements."}
              </p>
              <div className={styles.heroActions}>
                <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
                  {isDe ? "Beratung anfragen" : "Request consultation"}
                </Button>
                <Button href={`/${locale}/kontakt`} variant="secondary">
                  {isDe ? "Fragen? Schreib uns" : "Questions? Contact us"}
                </Button>
              </div>
            </div>
            {heroImageUrl && (
              <div className={styles.heroImage} aria-hidden>
                <img alt="" src={heroImageUrl} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="section tight">
        <div className="container">
          <span className="eyebrow">{isDe ? "VPS-Pakete" : "VPS packages"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Wähle deinen Cloud-Server." : "Choose your cloud server."}
          </h2>

          {products && products.length > 0 ? (
            <div className={styles.productGrid}>
              {products.map((product) => {
                const price = product.prices.find((p) => p.billingCycle === "MONTHLY") ?? product.prices[0];
                const specs = (product.configs ?? [])
                  .filter((c) => !c.key.startsWith("virtualmin_"))
                  .slice(0, 5);
                return (
                  <div className={styles.productCard} key={product.id}>
                    <div className={styles.productHeader}>
                      <Cpu aria-hidden size={22} className={styles.productIcon} />
                      <h3>{productName(product, locale)}</h3>
                    </div>
                    {price && (
                      <div className={styles.productPrice}>
                        <strong><Price cents={price.amountCents} /></strong>
                        <span>{isDe ? "/ Monat" : "/ month"}</span>
                      </div>
                    )}
                    <p className={styles.productDesc}>{productDescription(product, locale)}</p>
                    {specs.length > 0 && (
                      <ul className={styles.specList}>
                        {specs.map((spec) => (
                          <li key={spec.key}>
                            <Check aria-hidden size={14} />
                            <span>{spec.label}{spec.values[0] ? `: ${String(spec.values[0])}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link className={styles.orderBtn} href={`/${locale}/order/${product.id}`}>
                      {isDe ? "Jetzt bestellen" : "Order now"}
                      <ArrowRight aria-hidden size={16} />
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback hardcoded card */
            <div className={styles.productGrid}>
              <div className={styles.productCard}>
                <div className={styles.productHeader}>
                  <Cpu aria-hidden size={22} className={styles.productIcon} />
                  <h3>{FALLBACK_VPS.name}</h3>
                </div>
                <div className={styles.productPrice}>
                  <strong>{isDe ? "ab " : "from "}<Price cents={FALLBACK_VPS.priceFromCents} /></strong>
                  <span>{isDe ? "/ Monat" : "/ month"}</span>
                </div>
                <p className={styles.productDesc}>{isDe ? FALLBACK_VPS.descDe : FALLBACK_VPS.descEn}</p>
                <ul className={styles.specList}>
                  {FALLBACK_VPS.specs.map((spec) => (
                    <li key={spec.label}>
                      <Check aria-hidden size={14} />
                      <span>{spec.label}: {spec.value}</span>
                    </li>
                  ))}
                </ul>
                <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
                  {isDe ? "Anfragen" : "Enquire"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className={`section tight ${styles.featuresSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Was inklusive ist" : "What's included"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Alles, was du brauchst." : "Everything you need."}
          </h2>
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

      {/* Dedicated callout */}
      <section className={`section tight ${styles.dedicatedSection}`}>
        <div className="container">
          <div className={styles.dedicatedInner}>
            <div>
              <span className="eyebrow">{isDe ? "Größere Anforderungen?" : "Higher demands?"}</span>
              <h2>
                {isDe
                  ? "Dedizierte Server für anspruchsvolle Workloads."
                  : "Dedicated servers for demanding workloads."}
              </h2>
              <p>
                {isDe
                  ? "Wenn ein Cloud-VPS nicht ausreicht – zum Beispiel für rechenintensive Anwendungen, große Datenbanken oder hohe Verfügbarkeitsanforderungen – empfehlen wir einen dedizierten Server. Kontaktiere uns für ein individuelles Angebot."
                  : "When a cloud VPS isn't enough – for example for compute-intensive applications, large databases or high availability requirements – we recommend a dedicated server. Contact us for an individual offer."}
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
