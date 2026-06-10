import { getLocale } from "../../../../lib/i18n";
import styles from "../legal.module.css";

export default async function AGBPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Rechtliches" : "Legal"}</span>
          <h1>{isDe ? "Allgemeine Geschäftsbedingungen" : "Terms and Conditions"}</h1>
        </div>
      </section>

      <section className={styles.content}>
        <div className="container">
          <div className={styles.prose}>
            <h2>{isDe ? "1. Geltungsbereich" : "1. Scope"}</h2>
            <p>
              {isDe
                ? "Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen Bijan Sabbagh Sani Azad, handelnd unter dezhost.com (nachfolgend Dezhost genannt) und ihren Kunden (nachfolgend Kunde genannt), unabhängig davon, ob der Kunde Verbraucher oder Unternehmer ist."
                : "These General Terms and Conditions apply to all contracts between Bijan Sabbagh Sani Azad, trading as dezhost.com (hereinafter Dezhost) and its customers (hereinafter Customer), regardless of whether the customer is a consumer or entrepreneur."}
            </p>
            <p>
              {isDe
                ? "Abweichende Bedingungen des Kunden werden nicht anerkannt, es sei denn, Dezhost stimmt deren Geltung ausdrücklich schriftlich zu."
                : "Deviating conditions of the customer are not recognised unless Dezhost expressly agrees to their validity in writing."}
            </p>

            <h2>{isDe ? "2. Leistungen von Dezhost" : "2. Services of Dezhost"}</h2>
            <p>{isDe ? "Dezhost bietet verschiedene IT-Dienstleistungen an, darunter:" : "Dezhost offers various IT services, including:"}</p>
            <ul>
              <li>{isDe ? "Webhosting und Domainregistrierung" : "Web hosting and domain registration"}</li>
              <li>{isDe ? "SSL-Zertifikate" : "SSL certificates"}</li>
              <li>{isDe ? "IT-Infrastrukturaufbau" : "IT infrastructure setup"}</li>
              <li>{isDe ? "Installation und Wartung von Software und Hardware" : "Installation and maintenance of software and hardware"}</li>
              <li>{isDe ? "Installation und Betreuung von Nextcloud-Instanzen" : "Installation and support of Nextcloud instances"}</li>
              <li>{isDe ? "Beratung im Bereich IT und Online-Marketing" : "Consulting in IT and online marketing"}</li>
              <li>{isDe ? "Webdesign und Google Ads Werbung" : "Web design and Google Ads advertising"}</li>
            </ul>
            <p>
              {isDe
                ? "Domains und Hosting-Dienste werden automatisch mit der vom Kunden gewählten Laufzeit verlängert, sofern keine fristgerechte Kündigung erfolgt. Andere Dienstleistungen sind einmalige Aufträge, die auf Wunsch des Kunden erneut beauftragt werden können."
                : "Domains and hosting services are automatically renewed with the term chosen by the customer, unless timely cancellation occurs. Other services are one-time orders that can be re-commissioned at the customer's request."}
            </p>

            <h2>{isDe ? "3. Vertragsabschluss" : "3. Contract conclusion"}</h2>
            <p>
              {isDe
                ? "Ein Vertrag zwischen Dezhost und dem Kunden kommt durch die Bestellung des Kunden auf der Website oder über das Kundenportal (Mein Dezhost) und die Bestätigung durch Dezhost zustande. Der Kunde erhält nach Vertragsabschluss eine elektronische Rechnung per E-Mail."
                : "A contract between Dezhost and the customer is concluded through the customer's order on the website or via the customer portal (My Dezhost) and confirmation by Dezhost. The customer receives an electronic invoice by email after the contract is concluded."}
            </p>

            <h2>{isDe ? "4. Preise und Zahlungsbedingungen" : "4. Prices and payment terms"}</h2>
            <p>
              {isDe
                ? "Alle Preise werden in Euro (€) angegeben. Dezhost ist gemäß § 19 UStG als Kleinunternehmen von der Umsatzsteuer befreit. Es wird daher keine Umsatzsteuer ausgewiesen."
                : "All prices are stated in euros (€). Dezhost is exempt from VAT as a small business pursuant to § 19 UStG. Therefore, no VAT is shown."}
            </p>
            <p>
              {isDe
                ? "Zahlungen erfolgen über PayPal oder Mollie (mit SEPA, Kreditkarte oder Banküberweisung). Die Zahlung ist nach Rechnungserhalt sofort fällig. Rechnungen werden mindestens 5 Tage vor dem Fälligkeitsdatum per E-Mail versendet."
                : "Payments are made via PayPal or Mollie (with SEPA, credit card or bank transfer). Payment is due immediately upon receipt of invoice. Invoices are sent by email at least 5 days before the due date."}
            </p>
            <p>
              {isDe
                ? "Unbezahlte Rechnungen führen nach Ablauf der Frist zur automatischen oder manuellen Sperrung bzw. Kündigung des Dienstes. Eine Reaktivierung ist nur nach individueller Absprache möglich."
                : "Unpaid invoices will result in automatic or manual suspension or termination of the service after the deadline. Reactivation is only possible after individual agreement."}
            </p>

            <h2>{isDe ? "5. Vertragslaufzeit und Kündigung" : "5. Contract term and cancellation"}</h2>
            <p>
              {isDe
                ? "Die Laufzeit richtet sich nach dem jeweiligen gebuchten Produkt (monatlich, jährlich oder halbjährlich) und wird in der Rechnung angegeben. Die Kündigungsfrist beträgt 1 Tag vor dem Fälligkeitsdatum. Die Kündigung kann schriftlich per E-Mail oder über das Kundenportal erfolgen."
                : "The term depends on the respective booked product (monthly, annual or semi-annual) and is stated in the invoice. The cancellation period is 1 day before the due date. Cancellation can be made in writing by email or via the customer portal."}
            </p>
            <p>
              {isDe
                ? "Domains werden mindestens für ein Jahr registriert und können nach erfolgter Verlängerung nicht vor Ablauf des Registrierungszeitraums storniert werden. Hosting-Produkte können jederzeit vor dem Fälligkeitsdatum ohne zusätzliche Kosten gekündigt werden."
                : "Domains are registered for at least one year and cannot be cancelled before the end of the registration period after renewal. Hosting products can be cancelled at any time before the due date without additional costs."}
            </p>

            <h2>{isDe ? "6. Pflichten des Kunden" : "6. Customer obligations"}</h2>
            <p>{isDe ? "Der Kunde verpflichtet sich:" : "The customer undertakes:"}</p>
            <ul>
              <li>{isDe ? "keine illegalen, urheberrechtswidrigen oder anstößigen Inhalte zu speichern oder zu verbreiten" : "not to store or distribute illegal, copyright-infringing or offensive content"}</li>
              <li>{isDe ? "keine Spam-Mails oder schädliche Daten über die Server von Dezhost zu versenden" : "not to send spam emails or harmful data via Dezhost's servers"}</li>
              <li>{isDe ? "die Serverleistung nicht zu überlasten oder missbräuchlich zu verwenden" : "not to overload or misuse server performance"}</li>
            </ul>
            <p>
              {isDe
                ? "Bei Verstößen behält sich Dezhost das Recht vor, den Dienst sofort und ohne Vorankündigung zu sperren oder zu kündigen. Eine Rückerstattung ist in diesen Fällen ausgeschlossen."
                : "In case of violations, Dezhost reserves the right to suspend or terminate the service immediately and without notice. Refunds are excluded in these cases."}
            </p>

            <h2>{isDe ? "7. Haftung und Verfügbarkeit" : "7. Liability and availability"}</h2>
            <p>
              {isDe
                ? "Dezhost bemüht sich um eine hohe Verfügbarkeit aller angebotenen Dienste, kann jedoch keine bestimmte Verfügbarkeit garantieren. Es kann zu vorübergehenden Unterbrechungen durch Wartungsarbeiten oder technische Störungen kommen."
                : "Dezhost strives for high availability of all offered services, but cannot guarantee a specific availability. Temporary interruptions due to maintenance work or technical faults may occur."}
            </p>
            <p>
              {isDe
                ? "Obwohl tägliche Backups über Partnerdienste durchgeführt werden, übernimmt Dezhost keine Haftung für Datenverluste jeglicher Art. Kunden sind verpflichtet, eigene Datensicherungen anzulegen."
                : "Although daily backups are performed via partner services, Dezhost accepts no liability for data loss of any kind. Customers are obliged to create their own data backups."}
            </p>
            <p>
              {isDe
                ? "Dezhost haftet nur für Schäden, die auf vorsätzliches oder grob fahrlässiges Verhalten zurückzuführen sind. Eine Haftung für Folgeschäden, entgangenen Gewinn oder Datenverlust ist ausgeschlossen."
                : "Dezhost is only liable for damages attributable to intentional or grossly negligent behaviour. Liability for consequential damages, lost profits or data loss is excluded."}
            </p>

            <h2>{isDe ? "8. Preisänderungen" : "8. Price changes"}</h2>
            <p>
              {isDe
                ? "Dezhost behält sich das Recht vor, Preise anzupassen, um gestiegene Kosten (z. B. für Infrastruktur oder Partnerdienste) auszugleichen. Kunden werden über Preisänderungen vorab informiert. Laufende Verträge sind davon nicht rückwirkend betroffen."
                : "Dezhost reserves the right to adjust prices to compensate for increased costs (e.g. for infrastructure or partner services). Customers will be informed of price changes in advance. Ongoing contracts are not retroactively affected."}
            </p>

            <h2>{isDe ? "9. Widerrufsrecht" : "9. Right of withdrawal"}</h2>
            <p>
              {isDe
                ? "Verbrauchern steht ein Widerrufsrecht gemäß der auf unserer Website veröffentlichten Widerrufsbelehrung zu. Das Widerrufsrecht erlischt bei vollständig erbrachten digitalen Dienstleistungen (z. B. Domainregistrierung oder sofort bereitgestelltem Hosting), wenn der Kunde ausdrücklich der sofortigen Ausführung zugestimmt hat."
                : "Consumers have a right of withdrawal in accordance with the cancellation policy published on our website. The right of withdrawal expires for fully provided digital services (e.g. domain registration or immediately provided hosting) if the customer has expressly agreed to immediate execution."}
            </p>

            <h2>{isDe ? "10. Rechnungen und Nachweise" : "10. Invoices and receipts"}</h2>
            <p>
              {isDe
                ? "Rechnungen werden automatisch vom System erstellt und per E-Mail verschickt. Offene Rechnungen tragen eine vorläufige Nummer mit dem Präfix „N-“ und den Status „Ausstehend“ oder „Überfällig“. Nach Zahlungseingang erhält die Rechnung eine endgültige fortlaufende Rechnungsnummer ohne Präfix. Kunden können alle Rechnungen als PDF-Dokumente im Mein-Dezhost-Portal abrufen. Bezahlte Rechnungen können zu steuerlichen Zwecken verwendet werden."
                : "Invoices are automatically generated by the system and sent by email. Open invoices carry a temporary number with the prefix \"N-\" and the status \"Pending\" or \"Overdue\". Once paid, an invoice receives a final sequential invoice number without prefix. Customers can access all invoices as PDF documents in the My Dezhost portal. Paid invoices can be used for tax purposes."}
            </p>

            <h2>{isDe ? "11. Datenschutz" : "11. Data protection"}</h2>
            <p>
              {isDe
                ? "Der Umgang mit personenbezogenen Daten erfolgt gemäß unserer Datenschutzerklärung, abrufbar unter:"
                : "The handling of personal data is in accordance with our privacy policy, available at:"}
              <br />
              <a href="https://www.dezhost.com/datenschutz">https://www.dezhost.com/datenschutz</a>
            </p>

            <span className={styles.updated}>{isDe ? "Stand: November 2025" : "As of: November 2025"}</span>
          </div>
        </div>
      </section>
    </>
  );
}
