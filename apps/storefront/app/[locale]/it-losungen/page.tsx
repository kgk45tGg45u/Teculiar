import { ArrowRight, Bot, CheckCircle, Cloud, Database, Download, FileText, HardDrive, LifeBuoy, Lock, Monitor, Server, Settings, Users, Wrench } from "lucide-react";
import { apiGet } from "@dezhost/web-core/lib/api";
import { Button } from "@dezhost/web-core/components/ui/button";
import { getLocale, type Locale } from "@dezhost/web-core/lib/i18n";
import type { Metadata } from "next";
import { pageMetadata } from "@dezhost/web-core/lib/storefront-theme";
import { CustomPageGate } from "../../../components/customizer/custom-page";
import styles from "./it-losungen.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata("it-losungen", locale);
}

export default async function ITSolutionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="it-losungen">
      <ITSolutionsPageBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

async function ITSolutionsPageBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";
  const themeSettings = await apiGet<{ themeBlueItSolutionsHeroImageUrl?: string }>("/storefront/settings");
  const heroImageUrl = themeSettings?.themeBlueItSolutionsHeroImageUrl ?? null;

  const services = isDe
    ? [
        {
          icon: Cloud,
          title: "Nextcloud Einrichtung",
          summary: "Deine eigene Cloud – datenschutzfreundlich, ohne Google oder Dropbox.",
          details: "Wir installieren und konfigurieren Nextcloud auf deinem Server. Inklusive Benutzereinrichtung, App-Konfiguration und SSL. Ideal für Vereine, die Dateien sicher teilen möchten.",
          pricing: "Einrichtung ab 89 €. Monatliche Betreuung ab 29 €/Monat."
        },
        {
          icon: Users,
          title: "Vereinsdigitalisierung",
          summary: "Wir helfen Vereinen, digital aufgestellt zu sein – von der Website bis zur E-Mail.",
          details: "Komplettpaket für Vereine: Domain, Hosting, E-Mail-Adressen, Website und optional Nextcloud. Wir erklären alles Schritt für Schritt und bleiben langfristig erreichbar.",
          pricing: "Beratung kostenlos. Pakete ab 19 €/Monat."
        },
        {
          icon: Monitor,
          title: "WordPress Hilfe",
          summary: "WordPress installieren, einrichten, absichern und pflegen.",
          details: "Wir installieren WordPress, richten Themes und Plugins ein, kümmern uns um Updates und Sicherheit. Auch für bestehende WordPress-Seiten, die Probleme machen.",
          pricing: "Einrichtung ab 69 €. Wartung ab 25 €/Monat."
        },
        {
          icon: Lock,
          title: "Datenschutzfreundliche Infrastruktur",
          summary: "DSGVO-konforme Alternativen zu Google, Microsoft und Co.",
          details: "Wir helfen dir, datenschutzfreundliche Alternativen einzurichten: Nextcloud statt Google Drive, Mailcow statt Gmail, Matomo statt Google Analytics. Alles auf deutschen Servern.",
          pricing: "Beratung ab 75 €/Stunde. Pakete auf Anfrage."
        },
        {
          icon: Database,
          title: "Backup-Lösungen",
          summary: "Automatische Backups, die wirklich funktionieren.",
          details: "Wir richten automatische Backups für deine Website, Datenbank und Dateien ein. Tägliche Sicherungen, 30 Tage Aufbewahrung, schnelle Wiederherstellung.",
          pricing: "Einrichtung ab 49 €. Monatlich ab 9 €."
        },
        {
          icon: HardDrive,
          title: "Migrationen",
          summary: "Umzug von einem anderen Anbieter – ohne Ausfallzeit.",
          details: "Wir übernehmen den kompletten Umzug deiner Website, E-Mails und Datenbanken von deinem alten Anbieter zu Dezhost. Ohne Datenverlust und ohne Ausfallzeit.",
          pricing: "Ab 99 €, je nach Umfang."
        },
        {
          icon: Server,
          title: "Linux-Administration",
          summary: "Server einrichten, absichern und warten.",
          details: "Wir richten Linux-Server ein, konfigurieren Webserver (Apache/Nginx), Datenbanken, Firewalls und Monitoring. Für technisch anspruchsvollere Projekte.",
          pricing: "Ab 85 €/Stunde. Wartungspakete ab 79 €/Monat."
        },
        {
          icon: Settings,
          title: "Serverwartung",
          summary: "Regelmäßige Wartung, Updates und Monitoring für deinen Server.",
          details: "Wir übernehmen die laufende Wartung deines Servers: Sicherheitsupdates, Monitoring, Fehleranalyse und schnelle Reaktion bei Problemen.",
          pricing: "Monatlich ab 49 €. Stundensatz 85 €."
        },
        {
          icon: FileText,
          title: "E-Mail-Systeme",
          summary: "Professionelle E-Mail-Infrastruktur für Organisationen.",
          details: "Wir richten E-Mail-Server ein (Mailcow, Postfix), konfigurieren SPF, DKIM und DMARC für bessere Zustellbarkeit und schützen vor Spam.",
          pricing: "Einrichtung ab 79 €. Wartung ab 29 €/Monat."
        },
        {
          icon: Database,
          title: "CRM-Systeme",
          summary: "Kontaktverwaltung für Vereine und kleine Organisationen.",
          details: "Wir installieren und konfigurieren Open-Source-CRM-Systeme wie CiviCRM oder Odoo. Ideal für Vereine, die Mitglieder und Kontakte verwalten möchten.",
          pricing: "Einrichtung ab 149 €. Betreuung auf Anfrage."
        },
        {
          icon: Bot,
          title: "KI-Integration für Vereine",
          summary: "KI-gestützte Workflows für kleine Organisationen – einfach und erschwinglich.",
          details: "Wir helfen Vereinen, KI-Tools sinnvoll einzusetzen: automatische Texterstellung, Chatbots für die Website, Zusammenfassungen von Protokollen. Datenschutzkonform und verständlich erklärt.",
          pricing: "Beratung ab 75 €/Stunde. Umsetzung auf Anfrage."
        },
        {
          icon: LifeBuoy,
          title: "Managed Services & Beratung",
          summary: "Wir übernehmen die IT – du konzentrierst dich auf dein Projekt.",
          details: "Für Organisationen, die keine eigene IT-Abteilung haben: Wir übernehmen die komplette technische Betreuung. Monatliche Pauschale, persönlicher Ansprechpartner, schnelle Reaktionszeiten.",
          pricing: "Pakete ab 99 €/Monat. Beratung kostenlos."
        }
      ]
    : [
        {
          icon: Cloud,
          title: "Nextcloud Setup",
          summary: "Your own cloud – privacy-friendly, without Google or Dropbox.",
          details: "We install and configure Nextcloud on your server. Including user setup, app configuration and SSL. Ideal for associations that want to share files securely.",
          pricing: "Setup from €89. Monthly support from €29/month."
        },
        {
          icon: Users,
          title: "Association Digitalisation",
          summary: "We help associations get digitally set up – from website to email.",
          details: "Complete package for associations: domain, hosting, email addresses, website and optionally Nextcloud. We explain everything step by step and remain reachable long-term.",
          pricing: "Consultation free. Packages from €19/month."
        },
        {
          icon: Monitor,
          title: "WordPress Help",
          summary: "Install, configure, secure and maintain WordPress.",
          details: "We install WordPress, set up themes and plugins, handle updates and security. Also for existing WordPress sites that have problems.",
          pricing: "Setup from €69. Maintenance from €25/month."
        },
        {
          icon: Lock,
          title: "Privacy-Friendly Infrastructure",
          summary: "GDPR-compliant alternatives to Google, Microsoft and others.",
          details: "We help you set up privacy-friendly alternatives: Nextcloud instead of Google Drive, Mailcow instead of Gmail, Matomo instead of Google Analytics. All on German servers.",
          pricing: "Consultation from €75/hour. Packages on request."
        },
        {
          icon: Database,
          title: "Backup Solutions",
          summary: "Automatic backups that actually work.",
          details: "We set up automatic backups for your website, database and files. Daily backups, 30-day retention, fast restoration.",
          pricing: "Setup from €49. Monthly from €9."
        },
        {
          icon: HardDrive,
          title: "Migrations",
          summary: "Move from another provider – without downtime.",
          details: "We handle the complete migration of your website, emails and databases from your old provider to Dezhost. Without data loss and without downtime.",
          pricing: "From €99, depending on scope."
        },
        {
          icon: Server,
          title: "Linux Administration",
          summary: "Set up, secure and maintain servers.",
          details: "We set up Linux servers, configure web servers (Apache/Nginx), databases, firewalls and monitoring. For more technically demanding projects.",
          pricing: "From €85/hour. Maintenance packages from €79/month."
        },
        {
          icon: Settings,
          title: "Server Maintenance",
          summary: "Regular maintenance, updates and monitoring for your server.",
          details: "We handle ongoing server maintenance: security updates, monitoring, error analysis and fast response to problems.",
          pricing: "Monthly from €49. Hourly rate €85."
        },
        {
          icon: FileText,
          title: "Email Systems",
          summary: "Professional email infrastructure for organisations.",
          details: "We set up email servers (Mailcow, Postfix), configure SPF, DKIM and DMARC for better deliverability and protect against spam.",
          pricing: "Setup from €79. Maintenance from €29/month."
        },
        {
          icon: Database,
          title: "CRM Systems",
          summary: "Contact management for associations and small organisations.",
          details: "We install and configure open-source CRM systems like CiviCRM or Odoo. Ideal for associations that want to manage members and contacts.",
          pricing: "Setup from €149. Support on request."
        },
        {
          icon: Bot,
          title: "AI Integration for Associations",
          summary: "AI-powered workflows for small organisations – simple and affordable.",
          details: "We help associations use AI tools sensibly: automatic text creation, chatbots for the website, summaries of minutes. Privacy-compliant and clearly explained.",
          pricing: "Consultation from €75/hour. Implementation on request."
        },
        {
          icon: LifeBuoy,
          title: "Managed Services & Consulting",
          summary: "We handle the IT – you focus on your project.",
          details: "For organisations without their own IT department: we take over complete technical support. Monthly flat rate, personal contact, fast response times.",
          pricing: "Packages from €99/month. Consultation free."
        }
      ];

  const supportPackages = isDe
    ? [
        {
          name: "Basis",
          scope: "5 Stunden / Monat",
          price: "200 €/Monat",
          features: ["Fehlerbehebung einfach bis komplex", "Server-Troubleshooting & Monitoring", "E-Mail-Management", "Nextcloud-Administration", "Backup-Strategien", "Netzwerkoptimierung"]
        },
        {
          name: "Standard",
          scope: "10 Stunden / Monat",
          price: "350 €/Monat",
          features: ["Fehlerbehebung einfach bis komplex", "Server-Troubleshooting & Monitoring", "E-Mail-Management", "Nextcloud-Administration", "Backup-Strategien", "Netzwerkoptimierung"],
          featured: true
        },
        {
          name: "Profi",
          scope: "20 Stunden / Monat",
          price: "600 €/Monat",
          features: ["Fehlerbehebung einfach bis komplex", "Server-Troubleshooting & Monitoring", "E-Mail-Management", "Nextcloud-Administration", "Backup-Strategien", "Netzwerkoptimierung"]
        }
      ]
    : [
        {
          name: "Basic",
          scope: "5 hours / month",
          price: "€200/month",
          features: ["Error resolution (simple to complex)", "Server troubleshooting & monitoring", "Email management", "Nextcloud administration", "Backup strategies", "Network optimisation"]
        },
        {
          name: "Standard",
          scope: "10 hours / month",
          price: "€350/month",
          features: ["Error resolution (simple to complex)", "Server troubleshooting & monitoring", "Email management", "Nextcloud administration", "Backup strategies", "Network optimisation"],
          featured: true
        },
        {
          name: "Pro",
          scope: "20 hours / month",
          price: "€600/month",
          features: ["Error resolution (simple to complex)", "Server troubleshooting & monitoring", "Email management", "Nextcloud administration", "Backup strategies", "Network optimisation"]
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
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow">
                <Wrench aria-hidden size={15} />
                {isDe ? "IT-Lösungen & Managed Services" : "IT solutions & managed services"}
              </span>
              <h1>
                {isDe
                  ? "Technische Hilfe, die du wirklich verstehst."
                  : "Technical help you actually understand."}
              </h1>
              <p>
                {isDe
                  ? "Von der Nextcloud-Einrichtung bis zur kompletten Serverwartung. Wir erklären alles verständlich und arbeiten transparent."
                  : "From Nextcloud setup to complete server maintenance. We explain everything clearly and work transparently."}
              </p>
              <div className={styles.heroActions}>
                <Button href={`/${locale}/anfrage`} icon={ArrowRight}>
                  {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
                </Button>
                <a className={styles.pdfBtn} href="/preisliste.pdf" download>
                  <Download aria-hidden size={16} />
                  {isDe ? "Preisliste als PDF" : "Download price list PDF"}
                </a>
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

      {/* Intro */}
      <section className="section tight">
        <div className="container">
          <div className={styles.intro}>
            <div>
              <h2>{isDe ? "Du musst kein Technikprofi sein." : "You don't need to be a tech expert."}</h2>
              <p>
                {isDe
                  ? "Wir übernehmen die technischen Aufgaben, die dich aufhalten. Egal ob du einen Verein leitest, eine NGO betreibst oder ein kleines Unternehmen führst – wir erklären alles verständlich und arbeiten in deinem Tempo."
                  : "We take care of the technical tasks that hold you back. Whether you run an association, operate an NGO or lead a small business – we explain everything clearly and work at your pace."}
              </p>
            </div>
            <div className={styles.introStats}>
              <div>
                <strong>{isDe ? "Transparent" : "Transparent"}</strong>
                <span>{isDe ? "Keine versteckten Kosten" : "No hidden costs"}</span>
              </div>
              <div>
                <strong>{isDe ? "Persönlich" : "Personal"}</strong>
                <span>{isDe ? "Echter Ansprechpartner" : "Real contact person"}</span>
              </div>
              <div>
                <strong>{isDe ? "Fair" : "Fair"}</strong>
                <span>{isDe ? "Preise für kleine Budgets" : "Prices for small budgets"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Accordion services */}
      <section className="section">
        <div className="container">
          <span className="eyebrow">{isDe ? "Unsere Leistungen" : "Our services"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Was wir für dich tun können." : "What we can do for you."}
          </h2>
          <div className={styles.accordion}>
            {services.map((service) => (
              <details className={styles.accordionItem} key={service.title}>
                <summary className={styles.accordionSummary}>
                  <div className={styles.summaryLeft}>
                    <service.icon aria-hidden size={20} />
                    <div>
                      <strong>{service.title}</strong>
                      <span>{service.summary}</span>
                    </div>
                  </div>
                  <span className={styles.accordionChevron} aria-hidden>›</span>
                </summary>
                <div className={styles.accordionBody}>
                  <p>{service.details}</p>
                  <div className={styles.accordionFooter}>
                    <span className={styles.pricing}>{service.pricing}</span>
                    <Button
                      href={`/${locale}/anfrage?subject=${encodeURIComponent(service.title)}`}
                      icon={ArrowRight}
                      variant="secondary"
                    >
                      {isDe ? "Anfragen" : "Enquire"}
                    </Button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Support packages (from Pricing page) */}
      <section className={`section tight ${styles.pricingSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Wartungsverträge" : "Support packages"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Laufende Betreuung – monatlich buchbar." : "Ongoing support – book monthly."}
          </h2>
          <div className={styles.supportGrid}>
            {supportPackages.map((pkg) => (
              <div
                className={`${styles.supportCard} ${pkg.featured ? styles.featuredCard : ""}`}
                key={pkg.name}
              >
                {pkg.featured && (
                  <span className={styles.badge}>{isDe ? "Empfohlen" : "Recommended"}</span>
                )}
                <h3>{pkg.name}</h3>
                <div className={styles.supportScope}>{pkg.scope}</div>
                <div className={styles.supportPrice}>{pkg.price}</div>
                <ul className={styles.featureList}>
                  {pkg.features.map((f) => (
                    <li key={f}>
                      <CheckCircle aria-hidden size={14} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  href={`/${locale}/anfrage?subject=${encodeURIComponent(isDe ? `Wartungsvertrag ${pkg.name}` : `${pkg.name} support package`)}`}
                  icon={ArrowRight}
                  variant={pkg.featured ? "primary" : "secondary"}
                >
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
              <Button href={`/${locale}/anfrage`} icon={ArrowRight} variant="secondary">
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
                  ? "Für Aufgaben, die sich nicht pauschal berechnen lassen: Fehlersuche, individuelle Konfigurationen, Beratung und Sonderanfragen. Abrechnung in 15-Minuten-Schritten, Mindestabrechnung 30 Minuten."
                  : "For tasks that can't be charged as a flat rate: troubleshooting, individual configurations, consulting and special requests. Billed in 15-minute increments, minimum 30 minutes."}
              </p>
            </div>
            <div className={styles.hourlyRate}>
              <strong>{isDe ? "50–100 €" : "€50–100"}</strong>
              <span>{isDe ? "pro Stunde, je nach Leistung" : "per hour, depending on service"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Terms & Conditions */}
      <section className={`section tight ${styles.termsSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Konditionen" : "Terms of service"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Was du wissen solltest." : "What you should know."}
          </h2>
          <div className={styles.termsParagraphs}>
            <div className={styles.termsParagraph}>
              <h3>{isDe ? "Wartungsverträge & SLA-Pakete" : "Maintenance contracts & SLA packages"}</h3>
              <p>
                {isDe
                  ? "Unsere Wartungsverträge (SLA-Pakete) bieten drei Stufen: Basis (5 Stunden/Monat, 200 €), Standard (10 Stunden/Monat, 350 €) und Profi (20 Stunden/Monat, 600 €). Alle Pakete beinhalten Fehlerbehebung von einfach bis komplex, Server-Troubleshooting & Monitoring, E-Mail-Management inklusive Domains und DNS, Office-Software-Support, Nextcloud-Konfiguration und Benutzerverwaltung, Backup-Strategien sowie Netzwerkänderungen und -optimierungen. Nicht genutzte Stunden werden nicht auf den Folgemonat übertragen."
                  : "Our maintenance contracts (SLA packages) offer three tiers: Basic (5 hours/month, €200), Standard (10 hours/month, €350) and Pro (20 hours/month, €600). All packages include error resolution from simple to complex, server troubleshooting & monitoring, email management including domains and DNS, office software support, Nextcloud configuration and user management, backup strategies, and network changes and optimisation. Unused hours do not carry over to the next month."}
              </p>
            </div>
            <div className={styles.termsParagraph}>
              <h3>{isDe ? "Welches Paket passt zu dir?" : "Which package suits you?"}</h3>
              <p>
                {isDe
                  ? "Das Basis-Paket eignet sich für kleinere Organisationen mit gelegentlichem IT-Bedarf – zum Beispiel Vereine, die ihre Systeme stabil halten wollen, aber keine regelmäßige Betreuung benötigen. Das Standard-Paket ist ideal für aktiv genutzte Infrastrukturen: Wenn du regelmäßig Updates, Konfigurationsänderungen oder Nutzerverwaltung brauchst und eine Reaktionszeit von maximal 24 Stunden erwartest. Das Profi-Paket richtet sich an Organisationen, die stark auf ihre IT angewiesen sind – etwa mit eigenem Mailserver, Nextcloud-Instanz oder mehreren Diensten – und schnelle Reaktion sowie umfangreiche monatliche Leistungen benötigen."
                  : "The Basic package suits smaller organisations with occasional IT needs – for example associations that want to keep their systems stable but don't need regular support. The Standard package is ideal for actively used infrastructures: when you regularly need updates, configuration changes or user management and expect a response time of up to 24 hours. The Pro package is for organisations that rely heavily on their IT – for example with their own mail server, Nextcloud instance or multiple services – and need fast response and extensive monthly service."}
              </p>
            </div>
            <div className={styles.termsParagraph}>
              <h3>{isDe ? "Abrechnung & Konditionen" : "Billing & conditions"}</h3>
              <p>
                {isDe
                  ? "Alle Preise sind brutto (inklusive MwSt.). Die Abrechnung erfolgt in 15-Minuten-Intervallen mit einer Mindestabrechnung von 30 Minuten pro Einsatz. Für jede Organisation wird ein Servicevertrag erstellt, in dem Leistungen und Kosten verbindlich festgelegt sind. 30 % der vereinbarten Vertragssumme werden vor Beginn der Arbeiten in Rechnung gestellt. Hardwarekosten, Serverkosten und Softwarelizenzen werden separat und ohne Aufpreis weitergegeben. Zuschläge: Vor-Ort-Service außerhalb Berlins +50 %, außerhalb der Geschäftszeiten (Mo–Fr 09:00–18:00) +20 %, Wochenend- und Feiertagsservice +50 %. Zahlungsmethoden: Überweisung, SEPA, PayPal, Kreditkarte."
                  : "All prices include VAT. Billing is in 15-minute intervals with a minimum of 30 minutes per job. A service contract is drawn up for each organisation, clearly defining services and costs. 30% of the agreed contract amount is invoiced before work begins. Hardware, server and software licence costs are passed on separately at cost price. Surcharges: on-site service outside Berlin +50%, outside business hours (Mon–Fri 09:00–18:00) +20%, weekend and public holiday service +50%. Payment methods: bank transfer, SEPA, PayPal, credit card."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`section tight ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaInner}>
            <div>
              <h2>{isDe ? "Nicht sicher, was du brauchst?" : "Not sure what you need?"}</h2>
              <p>
                {isDe
                  ? "Erzähl uns einfach, was du vorhast. Wir schauen gemeinsam, was sinnvoll ist – kostenlos und ohne Verpflichtung."
                  : "Just tell us what you're planning. We'll look together at what makes sense – free and without obligation."}
              </p>
            </div>
            <Button href={`/${locale}/anfrage`} icon={ArrowRight}>
              {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
