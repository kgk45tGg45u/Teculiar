import { getLocale } from "../../../../lib/i18n";
import styles from "../legal.module.css";

export default async function WiderrufPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">{isDe ? "Rechtliches" : "Legal"}</span>
          <h1>{isDe ? "Widerrufsbelehrung" : "Cancellation Policy"}</h1>
        </div>
      </section>

      <section className={styles.content}>
        <div className="container">
          <div className={styles.prose}>
            <h2>{isDe ? "1. Widerrufsrecht für Verbraucher" : "1. Right of withdrawal for consumers"}</h2>
            <p>
              {isDe
                ? "Verbraucher im Sinne des § 13 BGB haben das Recht, binnen vierzehn (14) Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen."
                : "Consumers within the meaning of § 13 BGB have the right to withdraw from this contract within fourteen (14) days without giving reasons."}
            </p>
            <p>
              {isDe
                ? "Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses."
                : "The withdrawal period is fourteen days from the day of conclusion of the contract."}
            </p>
            <p>
              {isDe
                ? "Um Ihr Widerrufsrecht auszuüben, müssen Sie uns"
                : "To exercise your right of withdrawal, you must inform us"}
            </p>
            <p>
              Dezhost<br />
              Einzelunternehmen Bijan Sabbagh Sani Azad<br />
              E-Mail: <a href="mailto:support@dezhost.com">support@dezhost.com</a><br />
              Website: <a href="https://www.dezhost.com">https://www.dezhost.com</a>
            </p>
            <p>
              {isDe
                ? "mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren."
                : "by means of a clear statement (e.g. a letter sent by post or an email) of your decision to withdraw from this contract."}
            </p>
            <p>
              {isDe
                ? "Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist."
                : "You may use the attached model withdrawal form, but this is not mandatory."}
            </p>
            <p>
              {isDe
                ? "Zur Wahrung der Widerrufsfrist genügt die rechtzeitige Absendung der Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist."
                : "To meet the withdrawal deadline, it is sufficient for you to send your communication concerning your exercise of the right of withdrawal before the withdrawal period has expired."}
            </p>

            <h2>{isDe ? "2. Folgen des Widerrufs" : "2. Consequences of withdrawal"}</h2>
            <p>
              {isDe
                ? "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist."
                : "If you withdraw from this contract, we shall reimburse to you all payments received from you, including the costs of delivery, without undue delay and in any event not later than 14 days from the day on which we are informed about your decision to withdraw from this contract."}
            </p>
            <p>
              {isDe
                ? "Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart."
                : "We will carry out such reimbursement using the same means of payment as you used for the initial transaction, unless you have expressly agreed otherwise."}
            </p>

            <h2>{isDe ? "3. Besondere Hinweise zum Beginn der Leistung" : "3. Special notes on commencement of service"}</h2>
            <h3>{isDe ? "a) Webhosting & IT-Dienstleistungen" : "a) Web hosting & IT services"}</h3>
            <p>
              {isDe
                ? "Wenn Sie bei der Bestellung ausdrücklich zugestimmt haben, dass wir bereits während der Widerrufsfrist mit der Erbringung der Dienstleistung beginnen, und Sie bestätigt haben, dass Sie bei vollständiger Vertragserfüllung Ihr Widerrufsrecht verlieren, erlischt das Widerrufsrecht, sobald der Vertrag von uns vollständig erfüllt wurde."
                : "If you have expressly agreed at the time of ordering that we may begin providing the service during the withdrawal period, and you have confirmed that you will lose your right of withdrawal upon complete fulfilment of the contract, the right of withdrawal expires as soon as the contract has been completely fulfilled by us."}
            </p>
            <p>
              {isDe
                ? "Unabhängig davon gewähren wir Ihnen freiwillig eine 14-tägige Testphase für unsere Hosting-Dienste. Wenn Sie während dieser Zeit vom Vertrag zurücktreten, erstatten wir den vollen gezahlten Betrag zurück. Nach Ablauf dieser Frist erfolgt eine anteilige Rückerstattung entsprechend der bereits erbrachten Leistungen."
                : "Regardless of this, we voluntarily grant you a 14-day trial period for our hosting services. If you withdraw from the contract during this time, we will refund the full amount paid. After this period, a pro-rata refund will be made corresponding to the services already provided."}
            </p>

            <h3>{isDe ? "b) Domain-Registrierungen" : "b) Domain registrations"}</h3>
            <p>
              {isDe
                ? "Für Domain-Registrierungen besteht kein Widerrufsrecht, da die Leistung (die Registrierung bei der Vergabestelle) sofort erbracht und technisch nicht rückgängig gemacht werden kann (§ 356 Abs. 4 BGB)."
                : "There is no right of withdrawal for domain registrations, as the service (registration with the registry) is provided immediately and cannot technically be reversed (§ 356 para. 4 BGB)."}
            </p>

            <hr className={styles.divider} />

            <h2>{isDe ? "4. Muster-Widerrufsformular" : "4. Model withdrawal form"}</h2>
            <p>
              {isDe
                ? "(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)"
                : "(If you want to withdraw from the contract, please fill in this form and send it back.)"}
            </p>

            <div className={styles.formBox}>
              <h3>{isDe ? "Widerrufsformular" : "Withdrawal form"}</h3>
              <p>
                {isDe ? "An:" : "To:"}<br />
                Dezhost<br />
                Einzelunternehmen Bijan Sabbagh Sani Azad<br />
                E-Mail: <a href="mailto:support@dezhost.com">support@dezhost.com</a>
              </p>
              <p>
                {isDe
                  ? "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über den Kauf der folgenden Dienstleistung(en):"
                  : "I hereby withdraw from the contract concluded by me for the purchase of the following service(s):"}
              </p>
              <p>
                {isDe ? "Bestellt am:" : "Ordered on:"} _________________________<br />
                {isDe ? "Erhalten am (sofern zutreffend):" : "Received on (if applicable):"} _________________________<br />
                {isDe ? "Name des Verbrauchers:" : "Name of consumer:"} _________________________<br />
                {isDe ? "Anschrift des Verbrauchers:" : "Address of consumer:"} _________________________<br />
                {isDe ? "E-Mail-Adresse:" : "Email address:"} _________________________<br />
                {isDe ? "Unterschrift des Verbrauchers (nur bei Mitteilung auf Papier):" : "Signature of consumer (only for paper communication):"} _________________________<br />
                {isDe ? "Datum:" : "Date:"} _________________________
              </p>
            </div>

            <span className={styles.updated}>{isDe ? "Stand: November 2025" : "As of: November 2025"}</span>
          </div>
        </div>
      </section>
    </>
  );
}
