import { Suspense } from "react";
import { Button } from "@teculiar/web-core/components/ui/button";
import { getLocale } from "@teculiar/web-core/lib/i18n";
import { InquiryForm } from "./inquiry-form";
import styles from "./anfrage.module.css";

export default async function AnfragePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  return (
    <section className="section">
      <div className="container">
        <div className={styles.layout}>
          <div className={styles.intro}>
            <span className="eyebrow">{isDe ? "Kontakt" : "Contact"}</span>
            <h1>{isDe ? "Anfrage stellen" : "Send an enquiry"}</h1>
            <p>
              {isDe
                ? "Füll das Formular aus und wir melden uns so schnell wie möglich. Kostenlos und unverbindlich."
                : "Fill in the form and we will get back to you as soon as possible. Free and without obligation."}
            </p>
            <ul className={styles.trustList}>
              <li>{isDe ? "Antwort innerhalb von 24 Stunden" : "Reply within 24 hours"}</li>
              <li>{isDe ? "Kostenlose Erstberatung" : "Free initial consultation"}</li>
              <li>{isDe ? "Keine versteckten Kosten" : "No hidden costs"}</li>
            </ul>
          </div>
          <div className={styles.formCard}>
            <Suspense fallback={<div className={styles.formLoading} />}>
              <InquiryForm locale={locale} />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
