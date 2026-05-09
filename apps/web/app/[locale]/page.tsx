import { Globe, HardDrive, Mail, Server, ShieldCheck } from "lucide-react";
import { DomainSearch } from "../../components/marketing/domain-search";
import { Hero } from "../../components/marketing/hero";
import { PlatformSection } from "../../components/marketing/platform-section";
import { ProductGrid } from "../../components/marketing/product-grid";
import { getLocale } from "../../lib/i18n";
import styles from "./home.module.css";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  const explainers = isDe
    ? [
        {
          icon: Globe,
          title: "Domain",
          body: "Deine Adresse im Internet – zum Beispiel deinverein.de. Ohne Domain findet dich niemand."
        },
        {
          icon: Server,
          title: "Webhosting",
          body: "Der Platz, auf dem deine Website gespeichert wird. Wie eine Wohnung für deine Inhalte."
        },
        {
          icon: Mail,
          title: "E-Mail",
          body: "Professionelle E-Mail-Adressen mit deiner Domain – z. B. info@deinverein.de."
        },
        {
          icon: HardDrive,
          title: "Cloud & Nextcloud",
          body: "Dateien sicher speichern und teilen – ohne Google oder Dropbox. Datenschutzfreundlich."
        },
        {
          icon: ShieldCheck,
          title: "SSL & Sicherheit",
          body: "Das Schloss in der Browserzeile. Schützt deine Besucher und ist heute Pflicht."
        }
      ]
    : [
        {
          icon: Globe,
          title: "Domain",
          body: "Your address on the internet – for example yourclub.org. Without a domain, nobody can find you."
        },
        {
          icon: Server,
          title: "Web hosting",
          body: "The space where your website is stored. Think of it as a home for your content."
        },
        {
          icon: Mail,
          title: "Email",
          body: "Professional email addresses with your domain – e.g. info@yourclub.org."
        },
        {
          icon: HardDrive,
          title: "Cloud & Nextcloud",
          body: "Store and share files securely – without Google or Dropbox. Privacy-friendly."
        },
        {
          icon: ShieldCheck,
          title: "SSL & Security",
          body: "The padlock in the browser bar. Protects your visitors and is essential today."
        }
      ];

  return (
    <>
      <Hero locale={locale} />

      {/* Beginner-friendly explainer */}
      <section className={`section tight ${styles.explainerSection}`}>
        <div className="container">
          <div className={styles.explainerHeader}>
            <span className="eyebrow">{isDe ? "Was du brauchst" : "What you need"}</span>
            <h2>{isDe ? "Alles erklärt – ohne Fachwissen." : "Everything explained – no expertise needed."}</h2>
            <p>
              {isDe
                ? "Keine Ahnung, was Hosting, Domain oder SSL bedeutet? Kein Problem. Hier ist eine kurze Erklärung."
                : "Not sure what hosting, domain or SSL means? No problem. Here's a quick explanation."}
            </p>
          </div>
          <div className={styles.explainerGrid}>
            {explainers.map((item) => (
              <div className={styles.explainerItem} key={item.title}>
                <item.icon aria-hidden size={22} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dynamic product cards – DO NOT MODIFY */}
      <ProductGrid locale={locale} />

      <DomainSearch locale={locale} />
      <PlatformSection locale={locale} />
    </>
  );
}
