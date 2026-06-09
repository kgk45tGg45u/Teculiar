import { Mail, MessageCircle, Phone } from "lucide-react";
import { apiGet } from "../../../lib/api";
import { getLocale } from "../../../lib/i18n";
import { ContactForm } from "./contact-form";
import styles from "./kontakt.module.css";

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";
  const themeSettings = await apiGet<{ themeBlueContactHeroImageUrl?: string }>("/storefront/settings");
  const heroImageUrl = themeSettings?.themeBlueContactHeroImageUrl ?? null;

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow">
                <MessageCircle aria-hidden size={15} />
                {isDe ? "Kontakt" : "Contact"}
              </span>
              <h1>
                {isDe ? "Schreib uns einfach." : "Just write to us."}
              </h1>
              <p>
                {isDe
                  ? "Du musst kein Technikprofi sein. Erzähl uns einfach, was du brauchst – wir erklären alles Schritt für Schritt."
                  : "You don't need to be a tech expert. Just tell us what you need – we explain everything step by step."}
              </p>
            </div>
            {heroImageUrl && (
              <div className={styles.heroImage} aria-hidden>
                <img alt="" src={heroImageUrl} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Contact layout */}
      <section className="section tight">
        <div className="container">
          <div className={styles.layout}>
            {/* Form */}
            <div className={styles.formSection}>
              <h2>{isDe ? "Deine Anfrage." : "Your enquiry."}</h2>
              <p className={styles.formIntro}>
                {isDe
                  ? "Wir antworten in der Regel innerhalb von 24 Stunden. Für dringende Anfragen erreichst du uns auch per E-Mail direkt."
                  : "We usually respond within 24 hours. For urgent enquiries you can also reach us directly by email."}
              </p>
              <ContactForm locale={locale} />
            </div>

            {/* Sidebar */}
            <div className={styles.sidebar}>
              <div className={styles.contactCard}>
                <Mail aria-hidden size={22} />
                <div>
                  <strong>{isDe ? "Per E-Mail" : "By email"}</strong>
                  <a href="mailto:sales@dezhost.com">sales@dezhost.com</a>
                  <span>{isDe ? "Kontakt: Bijan Sabbagh" : "Contact: Bijan Sabbagh"}</span>
                </div>
              </div>

              <div className={styles.contactCard}>
                <Phone aria-hidden size={22} />
                <div>
                  <strong>{isDe ? "Telefonisch" : "By phone"}</strong>
                  <span>{isDe ? "+49 1590 6809725" : "+49 1590 6809725"}</span>
                </div>
              </div>

              <div className={styles.reassurance}>
                <h3>{isDe ? "Keine Angst vor Technik." : "No fear of technology."}</h3>
                <p>
                  {isDe
                    ? "Wir unterstützen auch Organisationen mit kleinem Budget. Schreib uns einfach – wir schauen gemeinsam, was möglich ist."
                    : "We also support organisations with small budgets. Just write to us – we'll look together at what's possible."}
                </p>
              </div>

              <div className={styles.quickLinks}>
                <strong>{isDe ? "Schnelle Antworten" : "Quick answers"}</strong>
                <a href={`/${locale}/webhosting`}>{isDe ? "Webhosting ansehen" : "View web hosting"}</a>
                <a href={`/${locale}/domains`}>{isDe ? "Domains erklärt" : "Domains explained"}</a>
                <a href={`/${locale}/it-losungen`}>{isDe ? "IT-Lösungen" : "IT Solutions"}</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
