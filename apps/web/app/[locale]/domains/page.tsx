import { DomainSearch } from "../../../components/marketing/domain-search";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default function DomainsPage({ params }: { params: { locale: string } }) {
  const locale = getLocale(params.locale);
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">Domains</span>
          <h1>{isDe ? "Registrierung, Transfer und Verlängerung im selben Kundenkonto." : "Registration, transfer, and renewal in the same customer account."}</h1>
          <p>
            {isDe
              ? "Die Domain-Schicht ist als Provider-Adapter ausgelegt und verbindet Kontakte, DNS, Rechnungen und Laufzeiten."
              : "The domain layer is provider-adapter based and connects contacts, DNS, invoices, and renewal periods."}
          </p>
        </div>
      </section>
      <DomainSearch locale={locale} />
    </>
  );
}
