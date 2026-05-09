import { getLocale } from "../../../../lib/i18n";
import styles from "../legal.module.css";

export default async function ImpressumPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Rechtliches" : "Legal"}</span>
          <h1>{isDe ? "Impressum" : "Legal Notice"}</h1>
        </div>
      </section>

      <section className={styles.content}>
        <div className="container">
          <div className={styles.prose}>
            <h2>{isDe ? "Angaben gemäß § 5 TMG" : "Information according to § 5 TMG"}</h2>
            <p>
              <strong>Inhaber:</strong><br />
              Sabbagh Sani Azad, Bijan<br />
              Kottbusser Straße 4<br />
              10999 Berlin<br />
              Deutschland
            </p>

            <h2>{isDe ? "Kontakt" : "Contact"}</h2>
            <p>
              Telefon: +49 159 06809725<br />
              E-Mail: <a href="mailto:info@dezhost.com">info@dezhost.com</a>
            </p>

            <h2>{isDe ? "Umsatzsteuer" : "VAT"}</h2>
            <p>
              {isDe
                ? "Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: USt-IdNr.: [DE123456789]"
                : "VAT identification number according to § 27a of the German VAT Act: VAT ID: [DE123456789]"}
              <br />
              {isDe
                ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
                : "Pursuant to § 19 UStG, no VAT is charged."}
            </p>

            <h2>{isDe ? "Verantwortlich für den Inhalt nach § 18 MStV" : "Responsible for content according to § 18 MStV"}</h2>
            <p>
              Sabbagh Sani Azad, Bijan<br />
              Kottbusser Str. 4, 10999 Berlin
            </p>

            <hr className={styles.divider} />

            <h2>{isDe ? "Streitbeilegung / ODR-Hinweis" : "Dispute resolution / ODR notice"}</h2>
            <p>
              {isDe
                ? "Gemäß der Verordnung über Online-Streitbeilegung in Verbraucherangelegenheiten (ODR-Verordnung) sind wir verpflichtet, Sie auf die Online-Streitbeilegungsplattform (OS-Plattform) der Europäischen Kommission hinzuweisen. Diese ist unter folgendem Link erreichbar:"
                : "Pursuant to the Regulation on Online Dispute Resolution in Consumer Matters (ODR Regulation), we are required to inform you about the Online Dispute Resolution platform (OS platform) of the European Commission. It is accessible at the following link:"}
            </p>
            <p>
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
                https://ec.europa.eu/consumers/odr
              </a>
            </p>
            <p>
              {isDe
                ? "Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."
                : "We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board."}
            </p>

            <span className={styles.updated}>{isDe ? "Stand: November 2025" : "As of: November 2025"}</span>
          </div>
        </div>
      </section>
    </>
  );
}
