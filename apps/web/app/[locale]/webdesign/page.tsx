import { ArrowRight, CheckCircle, Globe, Layers, MessageCircle, Palette, Search, Smartphone, Users } from "lucide-react";
import { apiGet } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { getLocale, type Locale } from "../../../lib/i18n";
import { CustomPageGate } from "../../../components/customizer/custom-page";
import styles from "./webdesign.module.css";

export default async function WebdesignPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="webdesign">
      <WebdesignPageBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

async function WebdesignPageBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";
  const themeSettings = await apiGet<{ themeBlueWebdesignHeroImageUrl?: string }>("/storefront/settings");
  const heroImageUrl = themeSettings?.themeBlueWebdesignHeroImageUrl ?? null;

  const targetGroups = isDe
    ? [
        { icon: Users, label: "Vereine & NGOs", desc: "Einfache, professionelle Website für eure Organisation." },
        { icon: Globe, label: "Politische Initiativen", desc: "Sichtbarkeit für eure Arbeit – klar und zugänglich." },
        { icon: Layers, label: "Startups", desc: "Moderner Auftritt, der mit euch wächst." },
        { icon: Palette, label: "Lokale Unternehmen", desc: "Professionell online – ohne IT-Abteilung." },
        { icon: MessageCircle, label: "Kulturprojekte", desc: "Kreative Websites für kreative Menschen." },
        { icon: Smartphone, label: "Einzelpersonen", desc: "Portfolio, Blog oder persönliche Website." }
      ]
    : [
        { icon: Users, label: "Associations & NGOs", desc: "Simple, professional website for your organisation." },
        { icon: Globe, label: "Political initiatives", desc: "Visibility for your work – clear and accessible." },
        { icon: Layers, label: "Startups", desc: "Modern presence that grows with you." },
        { icon: Palette, label: "Local businesses", desc: "Professional online presence – without an IT department." },
        { icon: MessageCircle, label: "Cultural projects", desc: "Creative websites for creative people." },
        { icon: Smartphone, label: "Individuals", desc: "Portfolio, blog or personal website." }
      ];

  const process = isDe
    ? [
        { num: "01", title: "Gespräch", body: "Wir hören zu. Du erzählst uns, was du brauchst – ohne Fachbegriffe, ohne Druck." },
        { num: "02", title: "Planung", body: "Wir skizzieren Struktur und Inhalte. Du gibst Feedback. Wir passen an." },
        { num: "03", title: "Gestaltung", body: "Wir gestalten deine Website – modern, zugänglich und auf dich zugeschnitten." },
        { num: "04", title: "Veröffentlichung", body: "Wir stellen alles live. Domain, Hosting, SSL – alles aus einer Hand." },
        { num: "05", title: "Betreuung", body: "Wir bleiben erreichbar. Updates, Änderungen, Fragen – wir sind da." }
      ]
    : [
        { num: "01", title: "Conversation", body: "We listen. You tell us what you need – no jargon, no pressure." },
        { num: "02", title: "Planning", body: "We sketch structure and content. You give feedback. We adjust." },
        { num: "03", title: "Design", body: "We design your website – modern, accessible and tailored to you." },
        { num: "04", title: "Launch", body: "We go live. Domain, hosting, SSL – everything from one source." },
        { num: "05", title: "Support", body: "We stay reachable. Updates, changes, questions – we're here." }
      ];

  const features = isDe
    ? [
        { icon: Smartphone, title: "Mobil-optimiert", body: "Deine Website sieht auf jedem Gerät gut aus – Handy, Tablet, Desktop." },
        { icon: Search, title: "SEO-Grundlagen", body: "Wir sorgen dafür, dass Google dich findet. Grundlegende SEO ist immer dabei." },
        { icon: Globe, title: "Mehrsprachig", body: "Deine Website auf Deutsch und Englisch – oder anderen Sprachen." },
        { icon: CheckCircle, title: "Barrierefreiheit", body: "Wir achten auf Zugänglichkeit – für alle Menschen, unabhängig von Einschränkungen." },
        { icon: Layers, title: "Hosting inklusive", body: "Domain, Hosting und SSL sind bei uns – alles aus einer Hand." },
        { icon: Palette, title: "KI-gestützte Workflows", body: "Für kleinere Budgets nutzen wir KI-Tools, um schneller und günstiger zu arbeiten." }
      ]
    : [
        { icon: Smartphone, title: "Mobile-optimised", body: "Your website looks great on every device – phone, tablet, desktop." },
        { icon: Search, title: "SEO basics", body: "We make sure Google finds you. Basic SEO is always included." },
        { icon: Globe, title: "Multilingual", body: "Your website in German and English – or other languages." },
        { icon: CheckCircle, title: "Accessibility", body: "We pay attention to accessibility – for all people, regardless of limitations." },
        { icon: Layers, title: "Hosting included", body: "Domain, hosting and SSL are with us – everything from one source." },
        { icon: Palette, title: "AI-supported workflows", body: "For smaller budgets we use AI tools to work faster and more affordably." }
      ];

  const portfolioItems = isDe
    ? [
        { label: "Sportverein Musterstadt", type: "Vereinswebsite", desc: "Einfache Website mit Terminen, Mitgliedschaft und Kontaktformular." },
        { label: "Initiative Klimaschutz", type: "NGO-Website", desc: "Mehrsprachige Website mit Blog und Newsletter-Integration." },
        { label: "Café Sonnenschein", type: "Lokales Unternehmen", desc: "Moderne Website mit Speisekarte, Öffnungszeiten und Reservierung." }
      ]
    : [
        { label: "Sports Club Example", type: "Association website", desc: "Simple website with events, membership and contact form." },
        { label: "Climate Initiative", type: "NGO website", desc: "Multilingual website with blog and newsletter integration." },
        { label: "Café Sunshine", type: "Local business", desc: "Modern website with menu, opening hours and reservation." }
      ];

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow">
                <Palette aria-hidden size={15} />
                {isDe ? "Webdesign & Websites" : "Web design & websites"}
              </span>
              <h1>
                {isDe
                  ? "Deine Website. Ohne technischen Stress."
                  : "Your website. Without technical stress."}
              </h1>
              <p>
                {isDe
                  ? "Wir gestalten moderne, zugängliche Websites für Vereine, NGOs, Startups und kleine Unternehmen. Persönlich betreut, fair berechnet, vollständig eingerichtet."
                  : "We design modern, accessible websites for associations, NGOs, startups and small businesses. Personally supported, fairly priced, fully set up."}
              </p>
              <div className={styles.heroActions}>
                <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
                  {isDe ? "Projekt besprechen" : "Discuss project"}
                </Button>
                <Button href={`/${locale}/it-losungen`} variant="secondary">
                  {isDe ? "Preise ansehen" : "View pricing"}
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

      {/* Target groups */}
      <section className="section tight">
        <div className="container">
          <span className="eyebrow">{isDe ? "Für wen?" : "Who is it for?"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Websites für alle, die online sichtbar sein wollen." : "Websites for everyone who wants to be visible online."}
          </h2>
          <div className={styles.targetGrid}>
            {targetGroups.map((g) => (
              <div className={styles.targetItem} key={g.label}>
                <g.icon aria-hidden size={20} />
                <div>
                  <strong>{g.label}</strong>
                  <span>{g.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className={`section ${styles.processSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Unser Prozess" : "Our process"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "So arbeiten wir zusammen." : "How we work together."}
          </h2>
          <div className={styles.process}>
            {process.map((step) => (
              <div className={styles.processStep} key={step.num}>
                <span className={styles.processNum}>{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="container">
          <span className="eyebrow">{isDe ? "Was dabei ist" : "What's included"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Alles aus einer Hand." : "Everything from one source."}
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

      {/* Portfolio placeholders */}
      <section className={`section tight ${styles.portfolioSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Beispielprojekte" : "Example projects"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Was wir schon gemacht haben." : "What we've already done."}
          </h2>
          <div className={styles.portfolioGrid}>
            {portfolioItems.map((item) => (
              <div className={styles.portfolioItem} key={item.label}>
                <div className={styles.portfolioPlaceholder}>
                  <Palette aria-hidden size={32} />
                  <span>{isDe ? "Vorschau folgt" : "Preview coming soon"}</span>
                </div>
                <div className={styles.portfolioInfo}>
                  <span className={styles.portfolioType}>{item.type}</span>
                  <strong>{item.label}</strong>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`section tight ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaInner}>
            <div>
              <h2>{isDe ? "Bereit für deine Website?" : "Ready for your website?"}</h2>
              <p>
                {isDe
                  ? "Erzähl uns von deinem Projekt. Wir melden uns innerhalb von 24 Stunden – kostenlos und ohne Verpflichtung."
                  : "Tell us about your project. We'll get back to you within 24 hours – free and without obligation."}
              </p>
            </div>
            <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
              {isDe ? "Projekt besprechen" : "Discuss project"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
