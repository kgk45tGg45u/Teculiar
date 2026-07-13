import { getLocale, type Locale } from "@teculiar/web-core/lib/i18n";
import type { Metadata } from "next";
import { pageMetadata } from "@teculiar/web-core/lib/storefront-theme";
import { CustomPageGate } from "../../../../components/customizer/custom-page";
import styles from "../legal.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata("legal-datenschutz", locale);
}

export default async function DatenschutzPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return (
    <CustomPageGate locale={locale} pageKey="legal-datenschutz">
      <DatenschutzPageBuiltIn locale={locale} />
    </CustomPageGate>
  );
}

async function DatenschutzPageBuiltIn({ locale }: { locale: Locale }) {
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Rechtliches" : "Legal"}</span>
          <h1>{isDe ? "Datenschutzerklärung" : "Privacy Policy"}</h1>
        </div>
      </section>

      <section className={styles.content}>
        <div className="container">
          <div className={styles.prose}>
            <h2>{isDe ? "1. Verantwortlicher" : "1. Controller"}</h2>
            <p>
              Dezhost – Einzelunternehmen Bijan Sabbagh Sani Azad<br />
              E-Mail: <a href="mailto:support@dezhost.com">support@dezhost.com</a><br />
              Webseite: <a href="https://www.dezhost.com">https://www.dezhost.com</a>
            </p>
            <p>
              {isDe
                ? "Dezhost betreibt diese Website und ist Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) für die Erhebung, Verarbeitung und Nutzung personenbezogener Daten, soweit im Folgenden nichts anderes angegeben ist."
                : "Dezhost operates this website and is the controller within the meaning of the General Data Protection Regulation (GDPR) for the collection, processing and use of personal data, unless otherwise stated below."}
            </p>

            <h2>{isDe ? "2. Allgemeines zur Datenverarbeitung" : "2. General information on data processing"}</h2>
            <p>
              {isDe
                ? "Wir nehmen den Schutz Ihrer personenbezogenen Daten sehr ernst. Ihre Daten werden ausschließlich auf Grundlage der gesetzlichen Bestimmungen (DSGVO, BDSG, TTDSG) verarbeitet."
                : "We take the protection of your personal data very seriously. Your data is processed exclusively on the basis of legal provisions (GDPR, BDSG, TTDSG)."}
            </p>
            <p>
              {isDe
                ? "Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist. Eine Verarbeitung erfolgt regelmäßig nur nach Einwilligung des Nutzers oder wenn die Verarbeitung durch gesetzliche Vorschriften gestattet ist."
                : "We process personal data only to the extent necessary to provide a functional website and our content and services. Processing generally only takes place with the user's consent or when processing is permitted by law."}
            </p>

            <h2>{isDe ? "3. Erhobene Daten" : "3. Data collected"}</h2>
            <p>
              {isDe
                ? "Wir erheben und verarbeiten personenbezogene Daten nur, wenn Sie uns diese im Rahmen einer Bestellung, Registrierung oder Kontaktaufnahme freiwillig mitteilen. Dazu gehören insbesondere:"
                : "We collect and process personal data only when you voluntarily provide it to us as part of an order, registration or contact. This includes in particular:"}
            </p>
            <ul>
              <li>{isDe ? "Name, Anschrift, E-Mail-Adresse" : "Name, address, email address"}</li>
              <li>{isDe ? "Rechnungs- und Zahlungsinformationen (z. B. über Mollie oder PayPal)" : "Billing and payment information (e.g. via Mollie or PayPal)"}</li>
              <li>{isDe ? "Technische Informationen wie IP-Adresse, Browsertyp, Betriebssystem (zugänglich in den Server-Logs von Hostfactor)" : "Technical information such as IP address, browser type, operating system (accessible in Hostfactor server logs)"}</li>
            </ul>
            <p>
              {isDe
                ? "Diese Daten werden ausschließlich zur Vertragsabwicklung, Supportleistung und Kommunikation verwendet."
                : "This data is used exclusively for contract processing, support services and communication."}
            </p>

            <h2>{isDe ? "4. Webhosting und Datenspeicherung" : "4. Web hosting and data storage"}</h2>
            <p>
              {isDe
                ? "Unsere Hosting-Infrastruktur wird von Hostfactor.eu bereitgestellt. Die Serverstandorte befinden sich im Rechenzentrum in Frankfurt am Main (Deutschland)."
                : "Our hosting infrastructure is provided by Hostfactor.eu. The server locations are in the data centre in Frankfurt am Main (Germany)."}
            </p>
            <p>
              {isDe
                ? "Hostfactor ist als Auftragsverarbeiter gemäß Art. 28 DSGVO tätig. Die Datenverarbeitung erfolgt innerhalb der Europäischen Union."
                : "Hostfactor acts as a data processor pursuant to Art. 28 GDPR. Data processing takes place within the European Union."}
            </p>

            <h2>{isDe ? "5. Domainregistrierung" : "5. Domain registration"}</h2>
            <p>
              {isDe
                ? "Für die Registrierung und Verwaltung von Domains nutzen wir folgende Partnerunternehmen:"
                : "For the registration and management of domains, we use the following partner companies:"}
            </p>
            <ul>
              <li>Resell.biz (UK/USA) – {isDe ? "Haupt-Registrar für internationale Domainendungen" : "Main registrar for international domain extensions"}</li>
              <li>Dynadot (USA) – {isDe ? "Registrar für bestimmte .de- und andere Domains" : "Registrar for certain .de and other domains"}</li>
            </ul>
            <p>
              {isDe
                ? "Bei .de-Domains erfolgt die Verwaltung durch die DENIC eG (Frankfurt am Main), welche die Registrierungsdaten ebenfalls verarbeitet."
                : "For .de domains, management is handled by DENIC eG (Frankfurt am Main), which also processes the registration data."}
            </p>

            <h2>{isDe ? "6. Zahlungsabwicklung" : "6. Payment processing"}</h2>
            <p>
              {isDe ? "Für die Zahlungsabwicklung nutzen wir folgende Dienstleister:" : "For payment processing, we use the following service providers:"}
            </p>
            <ul>
              <li>Mollie B.V., Keizersgracht 126, 1015 CW Amsterdam, Niederlande</li>
              <li>PayPal (Europe) S.à r.l. et Cie, S.C.A., 22-24 Boulevard Royal, L-2449 Luxemburg</li>
            </ul>
            <p>
              {isDe
                ? "Dezhost selbst speichert keine vollständigen Zahlungsdaten (z. B. Kreditkartennummern). Wir speichern lediglich technische Referenzen (Tokens oder Transaktionsmarker), um Zahlungen zuordnen zu können."
                : "Dezhost itself does not store complete payment data (e.g. credit card numbers). We only store technical references (tokens or transaction markers) to be able to assign payments."}
            </p>
            <p>
              {isDe ? "Die jeweiligen Datenschutzbestimmungen finden Sie unter:" : "The respective privacy policies can be found at:"}
            </p>
            <ul>
              <li><a href="https://www.mollie.com/de/privacy" target="_blank" rel="noopener noreferrer">https://www.mollie.com/de/privacy</a></li>
              <li><a href="https://www.paypal.com/de/webapps/mpp/ua/privacy-full" target="_blank" rel="noopener noreferrer">https://www.paypal.com/de/webapps/mpp/ua/privacy-full</a></li>
            </ul>

            <h2>{isDe ? "7. Kommunikation & Kontaktformular" : "7. Communication & contact form"}</h2>
            <p>
              {isDe
                ? "Wenn Sie uns über das Kontaktformular oder per E-Mail kontaktieren, werden Ihre Angaben zur Bearbeitung der Anfrage gespeichert. Pflichtangaben sind gekennzeichnet. Eine Weitergabe dieser Daten erfolgt nicht, sofern kein gesetzlicher Grund besteht."
                : "When you contact us via the contact form or by email, your details are stored for processing the enquiry. Mandatory fields are marked. This data is not passed on unless there is a legal reason."}
            </p>

            <h2>{isDe ? "8. Nutzung von Cookies" : "8. Use of cookies"}</h2>
            <p>
              {isDe
                ? "Unsere Website verwendet ausschließlich technisch notwendige Cookies, um die Grundfunktionen der Seite sicherzustellen. Wir setzen keine Tracking-, Analyse- oder Werbe-Cookies ein."
                : "Our website uses only technically necessary cookies to ensure the basic functions of the site. We do not use tracking, analytics or advertising cookies."}
            </p>

            <h2>{isDe ? "9. Datensicherheit" : "9. Data security"}</h2>
            <p>
              {isDe
                ? "Unsere Website ist durch SSL/TLS-Verschlüsselung gesichert, um die Übertragung vertraulicher Inhalte zu schützen. Wir ergreifen alle angemessenen technischen und organisatorischen Maßnahmen, um Ihre Daten vor Verlust, Missbrauch oder unbefugtem Zugriff zu schützen."
                : "Our website is secured by SSL/TLS encryption to protect the transmission of confidential content. We take all appropriate technical and organisational measures to protect your data from loss, misuse or unauthorised access."}
            </p>

            <h2>{isDe ? "10. Rechte der betroffenen Personen" : "10. Rights of data subjects"}</h2>
            <p>{isDe ? "Sie haben nach der DSGVO folgende Rechte:" : "You have the following rights under the GDPR:"}</p>
            <ul>
              <li>{isDe ? "Recht auf Auskunft (Art. 15 DSGVO)" : "Right of access (Art. 15 GDPR)"}</li>
              <li>{isDe ? "Recht auf Berichtigung (Art. 16 DSGVO)" : "Right to rectification (Art. 16 GDPR)"}</li>
              <li>{isDe ? "Recht auf Löschung (Art. 17 DSGVO)" : "Right to erasure (Art. 17 GDPR)"}</li>
              <li>{isDe ? "Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)" : "Right to restriction of processing (Art. 18 GDPR)"}</li>
              <li>{isDe ? "Recht auf Datenübertragbarkeit (Art. 20 DSGVO)" : "Right to data portability (Art. 20 GDPR)"}</li>
              <li>{isDe ? "Recht auf Widerspruch (Art. 21 DSGVO)" : "Right to object (Art. 21 GDPR)"}</li>
            </ul>
            <p>
              {isDe
                ? "Zur Wahrnehmung Ihrer Rechte können Sie uns jederzeit unter support@dezhost.com kontaktieren."
                : "To exercise your rights, you can contact us at any time at support@dezhost.com."}
            </p>

            <h2>{isDe ? "11. Weitergabe von Daten an Dritte" : "11. Disclosure of data to third parties"}</h2>
            <p>{isDe ? "Eine Weitergabe Ihrer Daten an Dritte erfolgt ausschließlich:" : "Your data is only passed on to third parties:"}</p>
            <ul>
              <li>{isDe ? "zur Vertragserfüllung (z. B. Domainregistrierung, Zahlungsabwicklung)" : "for contract fulfilment (e.g. domain registration, payment processing)"}</li>
              <li>{isDe ? "wenn wir gesetzlich dazu verpflichtet sind" : "when we are legally obliged to do so"}</li>
              <li>{isDe ? "oder wenn Sie ausdrücklich eingewilligt haben" : "or when you have expressly consented"}</li>
            </ul>

            <h2>{isDe ? "12. Änderungen dieser Datenschutzerklärung" : "12. Changes to this privacy policy"}</h2>
            <p>
              {isDe
                ? "Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen, um sie an geänderte rechtliche Anforderungen oder technische Entwicklungen anzupassen. Die jeweils aktuelle Version finden Sie stets unter https://www.dezhost.com/datenschutz/."
                : "We reserve the right to adapt this privacy policy as necessary to comply with changed legal requirements or technical developments. The current version can always be found at https://www.dezhost.com/datenschutz/."}
            </p>

            <h2>{isDe ? "13. Kontakt" : "13. Contact"}</h2>
            <p>
              {isDe ? "Bei Fragen zum Datenschutz wenden Sie sich bitte an:" : "For questions about data protection, please contact:"}
              <br />
              <a href="mailto:support@dezhost.com">support@dezhost.com</a>
            </p>

            <span className={styles.updated}>{isDe ? "Stand: November 2025" : "As of: November 2025"}</span>
          </div>
        </div>
      </section>
    </>
  );
}
