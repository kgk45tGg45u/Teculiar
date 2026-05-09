import { ArrowRight, Check, CheckCircle, HardDrive, Lock, Mail, RefreshCw, Server, ShieldCheck, Zap } from "lucide-react";
import { apiGet, cycleLabel, money, type ApiProduct } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "./webhosting.module.css";

export default async function HostingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  const features = isDe
    ? [
        { icon: HardDrive, title: "NVMe SSD Speicher", body: "Schnelle NVMe-Festplatten sorgen dafür, dass deine Website zügig lädt – auch bei vielen Besuchern." },
        { icon: RefreshCw, title: "Tägliche Backups", body: "Wir sichern deine Daten täglich. Falls etwas schiefgeht, stellen wir alles wieder her." },
        { icon: Lock, title: "SSL-Zertifikat inklusive", body: "Das Schloss in der Browserzeile ist bei uns immer dabei – kostenlos und automatisch erneuert." },
        { icon: Mail, title: "E-Mail-Postfächer", body: "Professionelle E-Mail-Adressen mit deiner Domain. Einfach einrichten, zuverlässig nutzen." },
        { icon: Zap, title: "PHP 8.1 – 8.4", body: "Aktuelle PHP-Versionen für WordPress, Joomla und andere CMS. Wir halten alles aktuell." },
        { icon: ShieldCheck, title: "DSGVO-konform", body: "Alle Server stehen in Deutschland. Deine Daten bleiben in der EU – ohne Ausnahme." }
      ]
    : [
        { icon: HardDrive, title: "NVMe SSD storage", body: "Fast NVMe drives ensure your website loads quickly – even with many visitors." },
        { icon: RefreshCw, title: "Daily backups", body: "We back up your data daily. If something goes wrong, we restore everything." },
        { icon: Lock, title: "SSL certificate included", body: "The padlock in the browser bar is always included – free and automatically renewed." },
        { icon: Mail, title: "Email mailboxes", body: "Professional email addresses with your domain. Easy to set up, reliable to use." },
        { icon: Zap, title: "PHP 8.1 – 8.4", body: "Current PHP versions for WordPress, Joomla and other CMS. We keep everything up to date." },
        { icon: ShieldCheck, title: "GDPR-compliant", body: "All servers are located in Germany. Your data stays in the EU – without exception." }
      ];

  const useCases = isDe
    ? [
        { label: "Vereine & NGOs", desc: "Einfache Website, professionelle E-Mail, faire Preise." },
        { label: "WordPress", desc: "Optimiert für WordPress – schnell, sicher, einfach zu verwalten." },
        { label: "Nextcloud", desc: "Datenschutzfreundliche Cloud-Lösung auf deinem eigenen Hosting." },
        { label: "Kleine Unternehmen", desc: "Professioneller Auftritt ohne IT-Abteilung." },
        { label: "Community-Projekte", desc: "Günstig starten, bei Bedarf wachsen." },
        { label: "Agenturen", desc: "Mehrere Projekte, klare Verwaltung, skalierbare Pakete." }
      ]
    : [
        { label: "Associations & NGOs", desc: "Simple website, professional email, fair prices." },
        { label: "WordPress", desc: "Optimised for WordPress – fast, secure, easy to manage." },
        { label: "Nextcloud", desc: "Privacy-friendly cloud solution on your own hosting." },
        { label: "Small businesses", desc: "Professional presence without an IT department." },
        { label: "Community projects", desc: "Start cheap, grow when needed." },
        { label: "Agencies", desc: "Multiple projects, clear management, scalable packages." }
      ];

  const faqs = isDe
    ? [
        {
          q: "Was ist Webhosting genau?",
          a: "Webhosting bedeutet, dass deine Website auf einem Computer (Server) gespeichert wird, der rund um die Uhr mit dem Internet verbunden ist. Wenn jemand deine Adresse eingibt, wird deine Website von diesem Server geladen."
        },
        {
          q: "Brauche ich technisches Wissen?",
          a: "Nein. Wir richten alles für dich ein und erklären jeden Schritt. Du musst keine Kommandozeile kennen oder Code schreiben."
        },
        {
          q: "Was passiert, wenn meine Website wächst?",
          a: "Kein Problem. Wir können dein Paket jederzeit upgraden – ohne Datenverlust und ohne Ausfallzeit."
        },
        {
          q: "Ist WordPress inklusive?",
          a: "WordPress ist kostenlos und kann auf deinem Hosting installiert werden. Wir helfen dir dabei, wenn du möchtest."
        },
        {
          q: "Wie lange dauert die Einrichtung?",
          a: "In der Regel ist dein Hosting innerhalb weniger Stunden aktiv. Bei komplexeren Projekten sprechen wir vorher alles durch."
        }
      ]
    : [
        {
          q: "What exactly is web hosting?",
          a: "Web hosting means your website is stored on a computer (server) that is connected to the internet around the clock. When someone types your address, your website is loaded from that server."
        },
        {
          q: "Do I need technical knowledge?",
          a: "No. We set everything up for you and explain every step. You don't need to know the command line or write code."
        },
        {
          q: "What happens when my website grows?",
          a: "No problem. We can upgrade your package at any time – without data loss and without downtime."
        },
        {
          q: "Is WordPress included?",
          a: "WordPress is free and can be installed on your hosting. We'll help you with that if you'd like."
        },
        {
          q: "How long does setup take?",
          a: "Usually your hosting is active within a few hours. For more complex projects, we discuss everything beforehand."
        }
      ];

  // Load products from API, fall back to catalog
  const apiProducts = await apiGet<ApiProduct[]>("/storefront/products");
  const hostingProducts = apiProducts?.filter((p) => p.type === "SHARED_HOSTING") ?? [];

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">
            <Server aria-hidden size={15} />
            {isDe ? "Webhosting Deutschland" : "Web hosting Germany"}
          </span>
          <h1>
            {isDe
              ? "Webhosting, das du wirklich verstehst."
              : "Web hosting you actually understand."}
          </h1>
          <p>
            {isDe
              ? "Schnell, sicher und persönlich betreut. Für Vereine, NGOs, WordPress-Projekte und kleine Unternehmen – ohne technischen Stress."
              : "Fast, secure and personally supported. For associations, NGOs, WordPress projects and small businesses – without technical stress."}
          </p>
          <div className={styles.heroActions}>
            <Button href={`/${locale}/pricing`} icon={ArrowRight}>
              {isDe ? "Pakete ansehen" : "View packages"}
            </Button>
            <Button href={`/${locale}/kontakt`} variant="secondary">
              {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
            </Button>
          </div>
          <div className={styles.trustBar}>
            <span><CheckCircle aria-hidden size={15} /> {isDe ? "Tägliche Backups" : "Daily backups"}</span>
            <span><CheckCircle aria-hidden size={15} /> {isDe ? "SSL inklusive" : "SSL included"}</span>
            <span><CheckCircle aria-hidden size={15} /> {isDe ? "Server in Deutschland" : "Servers in Germany"}</span>
            <span><CheckCircle aria-hidden size={15} /> {isDe ? "Persönlicher Support" : "Personal support"}</span>
          </div>
        </div>
      </section>

      {/* Hosting product cards from admin */}
      {hostingProducts.length > 0 && (
        <section className={`section tight ${styles.packagesSection}`}>
          <div className="container">
            <span className="eyebrow">{isDe ? "Hosting-Pakete" : "Hosting packages"}</span>
            <h2 className={styles.sectionTitle}>
              {isDe ? "Wähle das Paket, das zu dir passt." : "Choose the package that fits you."}
            </h2>
            <div className={styles.packageGrid}>
              {hostingProducts.map((product, i) => {
                const sorted = [...product.prices].sort((a, b) => a.amountCents - b.amountCents);
                const lowestPrice = sorted[0];
                const setupFee = lowestPrice?.setupFeeCents ?? 0;
                return (
                  <div className={`${styles.packageCard} ${i === 1 ? styles.packageFeatured : ""}`} key={product.id}>
                    {i === 1 && <span className={styles.packageBadge}>{isDe ? "Beliebt" : "Popular"}</span>}
                    <h3>{product.name}</h3>
                    {lowestPrice && (
                      <div className={styles.packagePrice}>
                        <strong>{money(lowestPrice.amountCents, lowestPrice.currency)}</strong>
                        <span>/ {cycleLabel(lowestPrice.billingCycle)}</span>
                      </div>
                    )}
                    {setupFee > 0 && lowestPrice && (
                      <div className={styles.setupFee}>
                        {isDe ? "Einrichtung" : "Setup"}: {money(setupFee, lowestPrice.currency)}
                      </div>
                    )}
                    {setupFee === 0 && (
                      <div className={styles.setupFree}>{isDe ? "Keine Einrichtungsgebühr" : "No setup fee"}</div>
                    )}
                    <p className={styles.packageDesc}>{product.description}</p>
                    {product.prices.length > 1 && (
                      <div className={styles.billingCycles}>
                        {product.prices.map((p) => (
                          <span key={p.id} className={styles.cycleChip}>
                            {cycleLabel(p.billingCycle)}: {money(p.amountCents, p.currency)}
                          </span>
                        ))}
                      </div>
                    )}
                    <Button
                      href={`/${locale}/order?product=${product.id}`}
                      icon={ArrowRight}
                      variant={i === 1 ? "primary" : "secondary"}
                    >
                      {isDe ? "Jetzt bestellen" : "Order now"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Open-source badge */}
      <section className={`section tight ${styles.openSourceSection}`}>
        <div className="container">
          <div className={styles.openSourceInner}>
            <div className={styles.openSourceIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.8c.85.004 1.71.115 2.51.337 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z"/>
              </svg>
            </div>
            <div>
              <h3>{isDe ? "Wir setzen auf Open Source." : "We rely on open source."}</h3>
              <p>
                {isDe
                  ? "Unsere Infrastruktur basiert auf bewährter Open-Source-Software: Linux, Nginx, MariaDB, PHP, WordPress, Nextcloud und mehr. Keine Vendor-Lock-ins, keine proprietären Abhängigkeiten – nur transparente, community-geprüfte Technologie."
                  : "Our infrastructure is built on proven open-source software: Linux, Nginx, MariaDB, PHP, WordPress, Nextcloud and more. No vendor lock-ins, no proprietary dependencies – just transparent, community-reviewed technology."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What is hosting */}
      <section className="section tight">
        <div className="container">
          <div className={styles.explainRow}>
            <div>
              <span className="eyebrow">{isDe ? "Für Einsteiger" : "For beginners"}</span>
              <h2>{isDe ? "Was ist Webhosting?" : "What is web hosting?"}</h2>
              <p>
                {isDe
                  ? "Stell dir das Internet wie eine riesige Stadt vor. Deine Domain ist deine Adresse – und dein Hosting ist das Gebäude, in dem deine Website wohnt. Ohne Hosting ist deine Website nirgendwo gespeichert und niemand kann sie aufrufen."
                  : "Think of the internet like a huge city. Your domain is your address – and your hosting is the building where your website lives. Without hosting, your website isn't stored anywhere and nobody can access it."}
              </p>
              <p>
                {isDe
                  ? "Bei Dezhost kümmern wir uns um alles Technische. Du musst nur wissen, was du online stellen möchtest."
                  : "At Dezhost, we take care of everything technical. You just need to know what you want to put online."}
              </p>
            </div>
            <div className={styles.specTable}>
              <div className={styles.specRow}>
                <span>{isDe ? "Speicher" : "Storage"}</span>
                <strong>10 GB – 500 GB NVMe</strong>
              </div>
              <div className={styles.specRow}>
                <span>PHP</span>
                <strong>8.1 – 8.4</strong>
              </div>
              <div className={styles.specRow}>
                <span>{isDe ? "Backups" : "Backups"}</span>
                <strong>{isDe ? "Täglich, 30 Tage" : "Daily, 30 days"}</strong>
              </div>
              <div className={styles.specRow}>
                <span>SSL</span>
                <strong>{isDe ? "Kostenlos inklusive" : "Free included"}</strong>
              </div>
              <div className={styles.specRow}>
                <span>{isDe ? "E-Mail" : "Email"}</span>
                <strong>{isDe ? "Inklusive" : "Included"}</strong>
              </div>
              <div className={styles.specRow}>
                <span>{isDe ? "Standort" : "Location"}</span>
                <strong>{isDe ? "Deutschland" : "Germany"}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="container">
          <span className="eyebrow">{isDe ? "Was dabei ist" : "What's included"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Alles, was du brauchst – nichts, was du nicht brauchst." : "Everything you need – nothing you don't."}
          </h2>
          <div className="grid three">
            {features.map((f) => (
              <div className={styles.featureCard} key={f.title}>
                <f.icon aria-hidden size={22} />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className={`section tight ${styles.useCaseSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Für wen?" : "Who is it for?"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Passt für viele – erklärt für alle." : "Fits many – explained for everyone."}
          </h2>
          <div className={styles.useCaseGrid}>
            {useCases.map((u) => (
              <div className={styles.useCaseItem} key={u.label}>
                <strong>{u.label}</strong>
                <span>{u.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="container">
          <div className={styles.faqLayout}>
            <div>
              <span className="eyebrow">FAQ</span>
              <h2>{isDe ? "Häufige Fragen." : "Frequently asked questions."}</h2>
              <p className={styles.faqIntro}>
                {isDe
                  ? "Noch Fragen? Schreib uns einfach – wir antworten auf Deutsch und erklären alles verständlich."
                  : "Still have questions? Just write to us – we answer clearly and explain everything."}
              </p>
              <Button href={`/${locale}/kontakt`} variant="secondary" icon={ArrowRight}>
                {isDe ? "Frage stellen" : "Ask a question"}
              </Button>
            </div>
            <div className={styles.faqList}>
              {faqs.map((faq) => (
                <details className={styles.faqItem} key={faq.q}>
                  <summary>{faq.q}</summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`section tight ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaInner}>
            <h2>{isDe ? "Bereit loszulegen?" : "Ready to get started?"}</h2>
            <p>
              {isDe
                ? "Wir helfen dir, das richtige Paket zu finden. Kostenlos und ohne Verpflichtung."
                : "We help you find the right package. Free and without obligation."}
            </p>
            <div className={styles.ctaActions}>
              <Button href={`/${locale}/pricing`} icon={ArrowRight}>
                {isDe ? "Pakete ansehen" : "View packages"}
              </Button>
              <Button href={`/${locale}/kontakt`} variant="secondary">
                {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
