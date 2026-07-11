import { ArrowRight, Globe, HandHeart, Lock, MessageCircle, Phone, Sprout, User } from "lucide-react";
import { Button } from "@dezhost/web-core/components/ui/button";
import { CustomPageGate } from "../../../components/customizer/custom-page";
import { apiGet } from "@dezhost/web-core/lib/api";
import { getLocale, type Locale } from "@dezhost/web-core/lib/i18n";
import type { Metadata } from "next";
import { pageMetadata } from "@dezhost/web-core/lib/storefront-theme";
import styles from "./uber-uns.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata("uber-uns", locale);
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="uber-uns">
      <AboutBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

// Built-in About renderer — the fallback when no custom layout is published for the "uber-uns" page.
async function AboutBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";
  const settings = await apiGet<{ founderPhotoUrl?: string; themeBlueAboutHeroImageUrl?: string }>("/storefront/settings");
  const founderPhotoUrl = settings?.founderPhotoUrl || null;
  const heroImageUrl = settings?.themeBlueAboutHeroImageUrl ?? null;

  const values = isDe
    ? [
        {
          icon: HandHeart,
          title: "Für alle, nicht nur für Konzerne",
          body: "Wir glauben, dass gute digitale Infrastruktur nicht nur großen Unternehmen vorbehalten sein sollte. Vereine, NGOs, politische Gruppen und kleine Initiativen verdienen dieselbe Qualität."
        },
        {
          icon: Lock,
          title: "Datenschutz ist kein Bonus",
          body: "Alle unsere Server stehen in Deutschland. Wir geben keine Daten weiter. DSGVO-Konformität ist für uns selbstverständlich – nicht ein Verkaufsargument."
        },
        {
          icon: Sprout,
          title: "Nachhaltig, nicht profitmaximierend",
          body: "Wir wollen genug verdienen, um professionell und langfristig arbeiten zu können. Nicht mehr. Wir wachsen lieber langsam und bleiben zuverlässig."
        },
        {
          icon: MessageCircle,
          title: "Persönlich und erklärend",
          body: "Wir erklären alles. Auch wenn du noch nie eine Domain registriert hast. Auch wenn du nicht weißt, was ein Server ist. Das ist kein Problem – das ist unser Job."
        }
      ]
    : [
        {
          icon: HandHeart,
          title: "For everyone, not just corporations",
          body: "We believe good digital infrastructure shouldn't be reserved for large companies. Associations, NGOs, political groups and small initiatives deserve the same quality."
        },
        {
          icon: Lock,
          title: "Privacy is not a bonus",
          body: "All our servers are located in Germany. We don't share data. GDPR compliance is a given for us – not a sales argument."
        },
        {
          icon: Sprout,
          title: "Sustainable, not profit-maximising",
          body: "We want to earn enough to work professionally and long-term. Nothing more. We'd rather grow slowly and stay reliable."
        },
        {
          icon: MessageCircle,
          title: "Personal and explanatory",
          body: "We explain everything. Even if you've never registered a domain. Even if you don't know what a server is. That's not a problem – that's our job."
        }
      ];

  const whoWeSupport = isDe
    ? [
        "Sportvereine und Kulturinitiativen",
        "NGOs und gemeinnützige Organisationen",
        "Politische Gruppen und Bürgerinitiativen",
        "Kleine Startups und Selbstständige",
        "Lokale Unternehmen ohne IT-Abteilung",
        "Bildungsprojekte und Schulen",
        "Künstler und Kreative",
        "Alle, die sonst niemanden fragen können"
      ]
    : [
        "Sports clubs and cultural initiatives",
        "NGOs and non-profit organisations",
        "Political groups and citizens' initiatives",
        "Small startups and freelancers",
        "Local businesses without an IT department",
        "Educational projects and schools",
        "Artists and creatives",
        "Everyone who has nobody else to ask"
      ];

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow">
                <Globe aria-hidden size={15} />
                {isDe ? "Über uns" : "About us"}
              </span>
              <h1>
                {isDe
                  ? "Wir erklären alles. Wirklich alles."
                  : "We explain everything. Really everything."}
              </h1>
              <p>
                {isDe
                  ? "Dezhost ist ein unabhängiger Hosting-Anbieter aus Deutschland. Wir unterstützen Vereine, NGOs, politische Gruppen und kleine Unternehmen dabei, digital sichtbar zu werden – ohne technischen Stress und ohne Konzerngefühl."
                  : "Dezhost is an independent hosting provider from Germany. We help associations, NGOs, political groups and small businesses become digitally visible – without technical stress and without the corporate feel."}
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

      {/* Mission */}
      <section className="section tight">
        <div className="container">
          <div className={styles.missionLayout}>
            <div>
              <span className="eyebrow">{isDe ? "Unsere Mission" : "Our mission"}</span>
              <h2>
                {isDe
                  ? "Digitale Unabhängigkeit für alle."
                  : "Digital independence for everyone."}
              </h2>
              <p>
                {isDe
                  ? "Wir sind kein anonymes Rechenzentrum. Wir sind Menschen, die anderen Menschen helfen, online zu gehen. Unser Ziel ist es, ethische digitale Infrastruktur zugänglich zu machen – für alle, die sonst zwischen den Stühlen sitzen."
                  : "We're not an anonymous data centre. We're people helping other people get online. Our goal is to make ethical digital infrastructure accessible – for everyone who otherwise falls through the cracks."}
              </p>
              <p>
                {isDe
                  ? "Wir glauben, dass Datenschutz, Transparenz und persönlicher Support keine Luxusgüter sein sollten. Sie sollten Standard sein."
                  : "We believe that privacy, transparency and personal support shouldn't be luxury goods. They should be the standard."}
              </p>
            </div>
            <div className={styles.missionStats}>
              <div>
                <strong>{isDe ? "Unabhängig" : "Independent"}</strong>
                <span>{isDe ? "Kein Konzern im Hintergrund" : "No corporation behind us"}</span>
              </div>
              <div>
                <strong>{isDe ? "Deutschland" : "Germany"}</strong>
                <span>{isDe ? "Server & Support" : "Servers & support"}</span>
              </div>
              <div>
                <strong>DSGVO</strong>
                <span>{isDe ? "Datenschutz inklusive" : "Privacy included"}</span>
              </div>
              <div>
                <strong>{isDe ? "Persönlich" : "Personal"}</strong>
                <span>{isDe ? "Echter Ansprechpartner" : "Real contact person"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className={`section ${styles.valuesSection}`}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Was uns antreibt" : "What drives us"}</span>
          <h2 className={styles.sectionTitle}>
            {isDe ? "Unsere Werte." : "Our values."}
          </h2>
          <div className="grid two">
            {values.map((v) => (
              <div className={styles.valueCard} key={v.title}>
                <v.icon aria-hidden size={24} />
                <div>
                  <h3>{v.title}</h3>
                  <p>{v.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who we support */}
      <section className="section tight">
        <div className="container">
          <div className={styles.supportLayout}>
            <div>
              <span className="eyebrow">{isDe ? "Für wen wir da sind" : "Who we're here for"}</span>
              <h2>
                {isDe
                  ? "Wir unterstützen alle, die sonst niemanden fragen können."
                  : "We support everyone who has nobody else to ask."}
              </h2>
              <p>
                {isDe
                  ? "Besonders am Herzen liegen uns Organisationen, die mit kleinen Budgets Großes leisten. Wir bieten faire Preise und erklären alles verständlich."
                  : "We especially care about organisations that achieve great things with small budgets. We offer fair prices and explain everything clearly."}
              </p>
            </div>
            <ul className={styles.supportList}>
              {whoWeSupport.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className={`section tight ${styles.philosophySection}`}>
        <div className="container">
          <div className={styles.philosophyInner}>
            <blockquote className={styles.quote}>
              {isDe
                ? "\"Wir wollen nicht maximieren. Wir wollen nachhaltig arbeiten und langfristig für dich da sein.\""
                : "\"We don't aim to maximise. We want to work sustainably and be there for you long-term.\""}
            </blockquote>
            <p>
              {isDe
                ? "Das bedeutet: Wir nehmen keine Kunden an, die wir nicht gut betreuen können. Wir wachsen langsam. Wir bleiben erreichbar. Und wir erklären alles – auch wenn du dieselbe Frage zum dritten Mal stellst."
                : "That means: we don't take on clients we can't support well. We grow slowly. We stay reachable. And we explain everything – even if you ask the same question for the third time."}
            </p>
          </div>
        </div>
      </section>

      {/* Founder photo */}
      <section className={`section tight ${styles.founderSection}`}>
        <div className="container">
          <div className={styles.founderLayout}>
            <div className={styles.founderPhotoWrap}>
              {founderPhotoUrl ? (
                <img
                  alt={isDe ? "Gründer von Dezhost" : "Dezhost founder"}
                  className={styles.founderPhoto}
                  src={founderPhotoUrl}
                />
              ) : (
                <div className={styles.founderPhotoPlaceholder}>
                  <User aria-hidden size={64} />
                  <span>{isDe ? "Foto folgt" : "Photo coming soon"}</span>
                </div>
              )}
            </div>
            <div className={styles.founderText}>
              <span className="eyebrow">{isDe ? "Gründer" : "Founder"}</span>
              <h2>{isDe ? "Hinter Dezhost steht ein Mensch." : "A person stands behind Dezhost."}</h2>
              <span className={styles.role}>{isDe ? "Gründer & Geschäftsführer" : "Founder & Managing Director"}</span>
              <p>
                {isDe
                  ? "Dezhost wurde mit einem einfachen Ziel gegründet: digitale Infrastruktur zugänglich machen – für alle, nicht nur für Konzerne. Als Gründer kenne ich die Herausforderungen kleiner Organisationen aus eigener Erfahrung."
                  : "Dezhost was founded with a simple goal: to make digital infrastructure accessible – for everyone, not just corporations. As founder, I know the challenges of small organisations from personal experience."}
              </p>
              <p>
                {isDe
                  ? "Ich stehe persönlich für jeden Kunden zur Verfügung. Keine Hotlines, keine Warteschlangen – ein echter Ansprechpartner."
                  : "I am personally available for every client. No hotlines, no queues – a real contact person."}
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
              <h2>
                {isDe
                  ? "Ruf uns einfach an. Wir erklären alles Schritt für Schritt."
                  : "Just call us. We explain everything step by step."}
              </h2>
              <p>
                {isDe
                  ? "Oder schreib uns eine E-Mail. Oder füll das Kontaktformular aus. Wir antworten auf Deutsch und erklären alles verständlich – ohne Fachwissen, ohne Druck."
                  : "Or send us an email. Or fill in the contact form. We respond clearly and explain everything – no expertise required, no pressure."}
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Button href={`/${locale}/kontakt`} icon={ArrowRight}>
                {isDe ? "Kontakt aufnehmen" : "Get in touch"}
              </Button>
              <Button href={`/${locale}/webhosting`} variant="secondary">
                {isDe ? "Hosting ansehen" : "View hosting"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Phone reassurance */}
      <section className="section tight">
        <div className="container">
          <div className={styles.phoneNote}>
            <Phone aria-hidden size={20} />
            <p>
              {isDe
                ? "Du kannst uns auch einfach anrufen. Wir erklären alles am Telefon – auf Deutsch, verständlich und ohne Zeitdruck."
                : "You can also just call us. We explain everything on the phone – clearly and without time pressure."}
            </p>
            <a href="mailto:info@dezhost.com">info@dezhost.com</a>
          </div>
        </div>
      </section>
    </>
  );
}
