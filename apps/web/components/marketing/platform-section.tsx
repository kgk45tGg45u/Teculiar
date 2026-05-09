import { ArrowRight, HandHeart, Lock, MessageSquare, Sprout } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import styles from "./platform-section.module.css";

export function PlatformSection({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  const reasons = [
    {
      icon: HandHeart,
      title: isDe ? "Für Vereine & NGOs" : "For associations & NGOs",
      body: isDe
        ? "Wir kennen die Herausforderungen kleiner Organisationen. Kein Fachjargon, kein Druck – nur ehrliche Hilfe."
        : "We understand the challenges of small organisations. No jargon, no pressure – just honest help."
    },
    {
      icon: Lock,
      title: isDe ? "Datenschutz & Unabhängigkeit" : "Privacy & independence",
      body: isDe
        ? "Alle Server stehen in Deutschland. Keine Weitergabe an Dritte. DSGVO-konform von Anfang an."
        : "All servers are located in Germany. No third-party sharing. GDPR-compliant from day one."
    },
    {
      icon: MessageSquare,
      title: isDe ? "Persönlicher Support" : "Personal support",
      body: isDe
        ? "Du erreichst echte Menschen. Wir erklären alles verständlich – auch wenn du noch nie eine Domain registriert hast."
        : "You reach real people. We explain everything clearly – even if you've never registered a domain before."
    },
    {
      icon: Sprout,
      title: isDe ? "Faire Preise, kein Wachstumsdruck" : "Fair prices, no growth pressure",
      body: isDe
        ? "Wir wollen nicht maximieren. Wir wollen nachhaltig arbeiten und langfristig für dich da sein."
        : "We don't aim to maximise. We want to work sustainably and be there for you long-term."
    }
  ];

  const steps = isDe
    ? [
        { num: "01", title: "Idee erzählen", body: "Schreib uns einfach, was du brauchst. Kein Formular, kein Stress." },
        { num: "02", title: "Domain & Hosting auswählen", body: "Wir helfen dir, das Richtige zu finden – ohne Überforderung." },
        { num: "03", title: "Einrichtung durch uns", body: "Wir richten alles ein. Du musst nichts selbst konfigurieren." },
        { num: "04", title: "Online gehen", body: "Deine Website ist live. Wir bleiben erreichbar, wenn du Fragen hast." }
      ]
    : [
        { num: "01", title: "Tell us your idea", body: "Just write to us about what you need. No form, no stress." },
        { num: "02", title: "Choose domain & hosting", body: "We help you find the right fit – without overwhelm." },
        { num: "03", title: "We handle setup", body: "We configure everything. You don't need to touch a single setting." },
        { num: "04", title: "Go live", body: "Your website is live. We stay reachable whenever you have questions." }
      ];

  return (
    <>
      {/* Why Dezhost */}
      <section className="section">
        <div className="container">
          <div className={styles.header}>
            <span className="eyebrow">{isDe ? "Warum Dezhost" : "Why Dezhost"}</span>
            <h2>{isDe ? "Digitale Lösungen ohne Konzerngefühl." : "Digital solutions without the corporate feel."}</h2>
            <p className={styles.subhead}>
              {isDe
                ? "Wir sind kein anonymes Rechenzentrum. Wir sind Menschen, die anderen Menschen helfen, online zu gehen."
                : "We're not an anonymous data centre. We're people helping other people get online."}
            </p>
          </div>
          <div className="grid four">
            {reasons.map((item) => (
              <div className={styles.item} key={item.title}>
                <item.icon aria-hidden size={24} />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* So einfach geht's */}
      <section className={`section ${styles.stepsSection}`}>
        <div className="container">
          <div className={styles.header}>
            <span className="eyebrow">{isDe ? "So einfach geht's" : "How it works"}</span>
            <h2>{isDe ? "Von der Idee zur fertigen Website." : "From idea to finished website."}</h2>
          </div>
          <div className={styles.steps}>
            {steps.map((step) => (
              <div className={styles.step} key={step.num}>
                <span className={styles.stepNum}>{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
          <div className={styles.stepsCta}>
            <Button href={`/${locale}/contact`} icon={ArrowRight}>
              {isDe ? "Jetzt starten" : "Get started"}
            </Button>
          </div>
        </div>
      </section>

      {/* Vereine & NGOs callout */}
      <section className={`section tight ${styles.callout}`}>
        <div className="container">
          <div className={styles.calloutInner}>
            <div>
              <span className="eyebrow">{isDe ? "Für Vereine & NGOs" : "For associations & NGOs"}</span>
              <h2>
                {isDe
                  ? "Ihr habt eine Mission. Wir sorgen dafür, dass sie online sichtbar ist."
                  : "You have a mission. We make sure it's visible online."}
              </h2>
              <p>
                {isDe
                  ? "Ob Sportverein, Kulturinitiative, politische Gruppe oder gemeinnützige Organisation – wir bieten euch faire Preise, persönliche Beratung und technische Unterstützung, die ihr wirklich versteht."
                  : "Whether a sports club, cultural initiative, political group or non-profit – we offer fair prices, personal advice and technical support you can actually understand."}
              </p>
            </div>
            <div className={styles.calloutActions}>
              <Button href={`/${locale}/contact`} icon={ArrowRight}>
                {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
              </Button>
              <Button href={`/${locale}/hosting`} variant="secondary">
                {isDe ? "Hosting ansehen" : "View hosting"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
