import { ArrowRight, Bot, Cloud, Database, FileText, HardDrive, LifeBuoy, Lock, Monitor, Server, Settings, Users, Wrench } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "./it-losungen.module.css";

export default async function ITSolutionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

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

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
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
            <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
              {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
            </Button>
            <Button href={`/${locale}/pricing`} variant="secondary">
              {isDe ? "Preisliste ansehen" : "View pricing"}
            </Button>
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
                    <Button href={`/${locale}/kontakt`} icon={ArrowRight} variant="secondary">
                      {isDe ? "Anfragen" : "Enquire"}
                    </Button>
                  </div>
                </div>
              </details>
            ))}
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
            <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
              {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
