import { Globe, HardDrive, Mail, Server, ShieldCheck } from "lucide-react";
import { DomainSearch } from "@dezhost/web-core/components/marketing/domain-search";
import { Hero } from "@dezhost/web-core/components/marketing/hero";
import { PlatformSection } from "@dezhost/web-core/components/marketing/platform-section";
import { ProductGrid } from "@dezhost/web-core/components/marketing/product-grid";
import { CustomPageGate } from "../../components/customizer/custom-page";
import { getLocale, type Locale } from "@dezhost/web-core/lib/i18n";
import styles from "./home.module.css";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="home">
      <HomeBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

async function HomeBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  const explainers = isDe
    ? [
        {
          icon: Globe,
          title: "Domain",
          body: "Deine Internetadresse – zum Beispiel deinverein.de. So wirst du auf dem Internet gefunden."
        },
        {
          icon: Server,
          title: "Webhosting",
          body: "Der Ort, an dem deine Website gespeichert wird. Wie ein Zuhause für deine Daten."
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
          body: "Your address on the internet – for example yourclub.org. People find you on the Internet using this address."
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
