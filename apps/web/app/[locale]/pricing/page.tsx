import { ArrowRight, CheckCircle, Download, ShoppingCart } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getCatalog } from "../../../lib/catalog";
import { getLocale } from "../../../lib/i18n";
import styles from "./pricing.module.css";

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";
  const catalog = getCatalog(locale);

  const supportPackages = isDe
    ? [
        {
          name: "Basis-Support",
          price: "ab 29 €/Monat",
          desc: "Für kleine Projekte und Vereine.",
          features: ["E-Mail-Support", "Reaktionszeit 48h", "Sicherheitsupdates", "Monatlicher Status-Check", "Serverwartung (basic)"]
        },
        {
          name: "Standard-Support",
          price: "ab 59 €/Monat",
          desc: "Für aktive Websites und Organisationen.",
          features: ["E-Mail & Telefon-Support", "Reaktionszeit 24h", "Sicherheitsupdates", "WordPress-Wartung", "Serverwartung & Monitoring", "Monatlicher Bericht"],
          featured: true
        },
        {
          name: "Managed Services",
          price: "ab 99 €/Monat",
          desc: "Vollständige technische Betreuung.",
          features: ["Persönlicher Ansprechpartner", "Reaktionszeit 4h", "Alle Updates & Wartung", "Vollständige Serverwartung", "Monitoring & Alerts", "Quartalsweise Beratung"]
        }
      ]
    : [
        {
          name: "Basic Support",
          price: "from €29/month",
          desc: "For small projects and associations.",
          features: ["Email support", "Response time 48h", "Security updates", "Monthly status check", "Server maintenance (basic)"]
        },
        {
          name: "Standard Support",
          price: "from €59/month",
          desc: "For active websites and organisations.",
          features: ["Email & phone support", "Response time 24h", "Security updates", "WordPress maintenance", "Server maintenance & monitoring", "Monthly report"],
          featured: true
        },
        {
          name: "Managed Services",
          price: "from €99/month",
          desc: "Complete technical support.",
          features: ["Personal contact person", "Response time 4h", "All updates & maintenance", "Full server maintenance", "Monitoring & alerts", "Quarterly consultation"]
        }
      ];

  const oneTimeServices = isDe
    ? [
        { service: "Nextcloud Einrichtung", price: "ab 89 €" },
        { service: "WordPress Installation & Setup", price: "ab 69 €" },
        { service: "Domain-Migration", price: "ab 39 €" },
        { service: "Website-Migration", price: "ab 99 €" },
        { service: "E-Mail-System Einrichtung", price: "ab 79 €" },
        { service: "Backup-System Einrichtung", price: "ab 49 €" },
        { service: "SSL-Einrichtung", price: "kostenlos" },
        { service: "Beratungsgespräch (60 Min.)", price: "kostenlos" }
      ]
    : [
        { service: "Nextcloud setup", price: "from €89" },
        { service: "WordPress installation & setup", price: "from €69" },
        { service: "Domain migration", price: "from €39" },
        { service: "Website migration", price: "from €99" },
        { service: "Email system setup", price: "from €79" },
        { service: "Backup system setup", price: "from €49" },
        { service: "SSL setup", price: "free" },
        { service: "Consultation (60 min.)", price: "free" }
      ];

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">{isDe ? "IT-Lösungen → Preisliste" : "IT solutions → Pricing"}</span>
          <h1>{isDe ? "Faire Preise. Keine Überraschungen." : "Fair prices. No surprises."}</h1>
          <p>
            {isDe
              ? "Transparente Preise für IT-Dienstleistungen, Support und Hosting. Keine versteckten Kosten, keine automatischen Verlängerungen ohne Ankündigung."
              : "Transparent prices for IT services, support and hosting. No hidden costs, no automatic renewals without notice."}
          </p>
          <div className={styles.heroActions}>
            <Button href={`/${locale}/it-losungen`} variant="secondary" icon={ArrowRight}>
              {isDe ? "Alle IT-Lösungen" : "All IT solutions"}
            </Button>
            <a
              className={styles.pdfBtn}
              href="/preisliste.pdf"
              download
            >
              <Download aria-hidden size={16} />
              {isDe ? "Preisliste als PDF" : "Download price list PDF"}
            </a>
          </div>
        </div>
      </section>

      {/* Support packages */}
      <section className="section tight">
        <div className="container">
          <span className="eyebrow">{isDe ? "Support-Pakete" : "Support packages"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Laufende Betreuung – monatlich buchbar." : "Ongoing support – book monthly."}
          </h2>
          <div className={styles.supportGrid}>
            {supportPackages.map((pkg) => (
              <div className={`${styles.supportCard} ${pkg.featured ? styles.featuredCard : ""}`} key={pkg.name}>
                {pkg.featured && <span className={styles.badge}>{isDe ? "Empfohlen" : "Recommended"}</span>}
                <h3>{pkg.name}</h3>
                <div className={styles.supportPrice}>{pkg.price}</div>
                <p>{pkg.desc}</p>
                <ul className={styles.featureList}>
                  {pkg.features.map((f) => (
                    <li key={f}>
                      <CheckCircle aria-hidden size={15} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button href={`/${locale}/kontakt`} icon={ArrowRight} variant={pkg.featured ? "primary" : "secondary"}>
                  {isDe ? "Anfragen" : "Enquire"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* One-time services */}
      <section className={`section tight ${styles.oneTimeSection}`}>
        <div className="container">
          <div className={styles.oneTimeLayout}>
            <div>
              <span className="eyebrow">{isDe ? "Einmalige Leistungen" : "One-time services"}</span>
              <h2>{isDe ? "Einrichtung & Migration." : "Setup & migration."}</h2>
              <p>
                {isDe
                  ? "Einmalige Leistungen werden nach Aufwand oder als Festpreis abgerechnet. Wir besprechen alles vorher – keine Überraschungen."
                  : "One-time services are billed by effort or as a fixed price. We discuss everything beforehand – no surprises."}
              </p>
              <Button href={`/${locale}/kontakt`} icon={ArrowRight} variant="secondary">
                {isDe ? "Angebot anfragen" : "Request quote"}
              </Button>
            </div>
            <div className={styles.serviceTable}>
              {oneTimeServices.map((item) => (
                <div className={styles.serviceRow} key={item.service}>
                  <span>{item.service}</span>
                  <strong>{item.price}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Hourly rate */}
      <section className="section tight">
        <div className="container">
          <div className={styles.hourlyInner}>
            <div>
              <span className="eyebrow">{isDe ? "Stundensatz" : "Hourly rate"}</span>
              <h2>{isDe ? "Individuelle Arbeiten." : "Individual work."}</h2>
              <p>
                {isDe
                  ? "Für Aufgaben, die sich nicht pauschal berechnen lassen: Fehlersuche, individuelle Konfigurationen, Beratung und Sonderanfragen."
                  : "For tasks that can't be charged as a flat rate: troubleshooting, individual configurations, consulting and special requests."}
              </p>
            </div>
            <div className={styles.hourlyRate}>
              <strong>85 €</strong>
              <span>{isDe ? "pro Stunde, zzgl. MwSt." : "per hour, plus VAT"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Hosting packages – at bottom */}
      <section className={`section tight ${styles.hostingSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Hosting-Pakete" : "Hosting packages"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Webhosting – monatlich kündbar." : "Web hosting – cancel monthly."}
          </h2>
          <div className={styles.productGrid}>
            {catalog.slice(0, 4).map((product, index) => (
              <div className={`${styles.productCard} ${index === 1 ? styles.featured : ""}`} key={product.name}>
                {index === 1 && <span className={styles.badge}>{isDe ? "Beliebt" : "Popular"}</span>}
                <h3>{product.name}</h3>
                <div className={styles.productPrice}>{product.price}</div>
                <p>{product.summary}</p>
                <Button href="/client" icon={ShoppingCart} variant={index === 1 ? "primary" : "secondary"}>
                  {isDe ? "Auswählen" : "Select"}
                </Button>
              </div>
            ))}
          </div>
          <p className={styles.note}>
            {isDe
              ? "Alle Preise zzgl. 19% MwSt. Monatliche und jährliche Laufzeiten verfügbar."
              : "All prices plus 19% VAT. Monthly and annual terms available."}
          </p>
        </div>
      </section>

      {/* Trust note */}
      <section className="section tight">
        <div className="container">
          <div className={styles.trustNote}>
            <h2>{isDe ? "Keine versteckten Kosten." : "No hidden costs."}</h2>
            <p>
              {isDe
                ? "Wir rechnen transparent ab. Bevor wir anfangen, besprechen wir den Umfang und den Preis. Keine Überraschungen auf der Rechnung."
                : "We bill transparently. Before we start, we discuss the scope and price. No surprises on the invoice."}
            </p>
            <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
              {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
