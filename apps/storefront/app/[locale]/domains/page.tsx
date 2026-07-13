import { ArrowRight, Globe, Mail, Search, Settings } from "lucide-react";
import { apiGet } from "@teculiar/web-core/lib/api";
import { DomainSearch } from "@teculiar/web-core/components/marketing/domain-search";
import { Button } from "@teculiar/web-core/components/ui/button";
import { getLocale, type Locale } from "@teculiar/web-core/lib/i18n";
import type { Metadata } from "next";
import { pageMetadata } from "@teculiar/web-core/lib/storefront-theme";
import { CustomPageGate } from "../../../components/customizer/custom-page";
import styles from "./domains.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata("domains", locale);
}

export default async function DomainsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="domains">
      <DomainsPageBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

async function DomainsPageBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  const tlds = [
    { ext: ".de", desc: isDe ? "Die deutsche Domain. Ideal für lokale Projekte und Vereine." : "The German domain. Ideal for local projects and associations." },
    { ext: ".org", desc: isDe ? "Für Organisationen, NGOs und gemeinnützige Projekte." : "For organisations, NGOs and non-profit projects." },
    { ext: ".com", desc: isDe ? "International bekannt. Gut für Unternehmen mit globalem Anspruch." : "Internationally recognised. Good for businesses with global ambitions." },
    { ext: ".net", desc: isDe ? "Technisch orientiert. Beliebt bei IT-Projekten und Netzwerken." : "Technically oriented. Popular with IT projects and networks." },
    { ext: ".eu", desc: isDe ? "Europäische Präsenz. Zeigt Verbundenheit mit der EU." : "European presence. Shows connection to the EU." },
    { ext: ".info", desc: isDe ? "Für informative Projekte, Wikis und Wissensdatenbanken." : "For informative projects, wikis and knowledge bases." }
  ];

  const steps = isDe
    ? [
        { icon: Search, title: "Domain suchen", body: "Gib deinen Wunschnamen ein und prüfe, ob er noch verfügbar ist." },
        { icon: Globe, title: "Endung wählen", body: "Wähle die passende Endung – .de, .org, .com oder eine andere." },
        { icon: Settings, title: "Wir richten ein", body: "Wir verbinden deine Domain mit deinem Hosting und richten DNS ein." },
        { icon: Mail, title: "E-Mail nutzen", body: "Mit deiner Domain bekommst du professionelle E-Mail-Adressen." }
      ]
    : [
        { icon: Search, title: "Search domain", body: "Enter your desired name and check if it's still available." },
        { icon: Globe, title: "Choose extension", body: "Choose the right extension – .de, .org, .com or another." },
        { icon: Settings, title: "We set it up", body: "We connect your domain to your hosting and configure DNS." },
        { icon: Mail, title: "Use email", body: "With your domain you get professional email addresses." }
      ];

  const faqs = isDe
    ? [
        {
          q: "Was ist eine Domain?",
          a: "Eine Domain ist deine Adresse im Internet – zum Beispiel deinverein.de. Wenn jemand diese Adresse in den Browser eingibt, landet er auf deiner Website."
        },
        {
          q: "Was ist der Unterschied zwischen Domain und Hosting?",
          a: "Die Domain ist deine Adresse. Das Hosting ist der Platz, an dem deine Website gespeichert wird. Du brauchst beides – wir helfen dir, beides einzurichten."
        },
        {
          q: "Was ist DNS?",
          a: "DNS ist wie ein Telefonbuch für das Internet. Es übersetzt deinen Domainnamen in eine IP-Adresse, damit Browser wissen, wo deine Website liegt. Wir kümmern uns darum."
        },
        {
          q: "Kann ich meine Domain zu Dezhost übertragen?",
          a: "Ja. Wir helfen dir, deine bestehende Domain zu uns zu übertragen – ohne Ausfallzeit und ohne Datenverlust."
        },
        {
          q: "Bekomme ich E-Mail-Adressen mit meiner Domain?",
          a: "Ja. Mit deiner Domain kannst du professionelle E-Mail-Adressen einrichten – zum Beispiel info@deinverein.de."
        }
      ]
    : [
        {
          q: "What is a domain?",
          a: "A domain is your address on the internet – for example yourclub.org. When someone types this address into their browser, they land on your website."
        },
        {
          q: "What's the difference between domain and hosting?",
          a: "The domain is your address. Hosting is the space where your website is stored. You need both – we help you set up both."
        },
        {
          q: "What is DNS?",
          a: "DNS is like a phone book for the internet. It translates your domain name into an IP address so browsers know where your website is. We take care of that."
        },
        {
          q: "Can I transfer my domain to Dezhost?",
          a: "Yes. We help you transfer your existing domain to us – without downtime and without data loss."
        },
        {
          q: "Do I get email addresses with my domain?",
          a: "Yes. With your domain you can set up professional email addresses – for example info@yourclub.org."
        }
      ];

  const themeSettings = await apiGet<{ themeBlueDomainsHeroImageUrl?: string }>("/storefront/settings");
  const heroImageUrl = themeSettings?.themeBlueDomainsHeroImageUrl ?? null;

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow">
                <Globe aria-hidden size={15} />
                {isDe ? "Domains registrieren" : "Register domains"}
              </span>
              <h1>
                {isDe
                  ? "Deine Adresse im Internet."
                  : "Your address on the internet."}
              </h1>
              <p>
                {isDe
                  ? "Domains einfach erklärt, schnell registriert und direkt mit deinem Hosting verbunden. Wir helfen dir, den richtigen Namen zu finden."
                  : "Domains simply explained, quickly registered and directly connected to your hosting. We help you find the right name."}
              </p>
              <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
                {isDe ? "Domain anfragen" : "Request domain"}
              </Button>
            </div>
            {heroImageUrl && (
              <div className={styles.heroImage} aria-hidden>
                <img alt="" src={heroImageUrl} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Domain search */}
      <DomainSearch locale={locale} />

      {/* How it works */}
      <section className={`section ${styles.stepsSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "So funktioniert's" : "How it works"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Von der Idee zur Domain in wenigen Schritten." : "From idea to domain in a few steps."}
          </h2>
          <div className={styles.steps}>
            {steps.map((step, i) => (
              <div className={styles.step} key={step.title}>
                <div className={styles.stepIcon}>
                  <step.icon aria-hidden size={20} />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TLD overview */}
      <section className="section tight">
        <div className="container">
          <span className="eyebrow">{isDe ? "Welche Endung passt?" : "Which extension fits?"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? ".de, .org, .com – was ist der Unterschied?" : ".de, .org, .com – what's the difference?"}
          </h2>
          <div className={styles.tldGrid}>
            {tlds.map((tld) => (
              <div className={styles.tldItem} key={tld.ext}>
                <strong>{tld.ext}</strong>
                <span>{tld.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Domain pricing CTA */}
      <section className={`section tight ${styles.pricingCta}`}>
        <div className="container">
          <div className={styles.pricingCtaInner}>
            <div>
              <span className="eyebrow">{isDe ? "Preise" : "Pricing"}</span>
              <h2>{isDe ? "Was kostet eine Domain?" : "What does a domain cost?"}</h2>
              <p>
                {isDe
                  ? "Alle Domain-Preise für Neuregistrierung, Verlängerung und Transfer – direkt aus unserem System geladen."
                  : "All domain prices for new registration, renewal and transfer – loaded directly from our system."}
              </p>
            </div>
            <Button href={`/${locale}/domains/pricing`} icon={ArrowRight}>
              {isDe ? "Preisliste ansehen" : "View price list"}
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="container">
          <div className={styles.faqLayout}>
            <div>
              <span className="eyebrow">FAQ</span>
              <h2>{isDe ? "Häufige Fragen zu Domains." : "Frequently asked questions about domains."}</h2>
              <p className={styles.faqIntro}>
                {isDe
                  ? "Du hast noch Fragen? Schreib uns – wir erklären alles auf Deutsch und ohne Fachwissen."
                  : "Still have questions? Write to us – we explain everything clearly."}
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
    </>
  );
}
