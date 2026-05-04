import { ShoppingCart } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getCatalog } from "../../../lib/catalog";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default function PricingPage({ params }: { params: { locale: string } }) {
  const locale = getLocale(params.locale);
  const isDe = locale === "de";

  return (
    <section className={styles.hero}>
      <div className="container">
        <span className="eyebrow">{isDe ? "Preise" : "Pricing"}</span>
        <h1>{isDe ? "Flexible Zyklen, Setupgebühren und Add-ons." : "Flexible cycles, setup fees, and add-ons."}</h1>
        <p>
          {isDe
            ? "Monatlich, quartalsweise, halbjährlich und ein bis vier Jahre. Rechnungen unterstützen Entwürfe, Rückdatierung und EU-Steuerregeln."
            : "Monthly, quarterly, semi-annual, and one to four years. Invoices support drafts, backdating, and EU tax rules."}
        </p>
        <div className={styles.pricingGrid}>
          {getCatalog(locale).slice(0, 3).map((product) => (
            <div className={styles.price} key={product.name}>
              <h2>{product.name}</h2>
              <strong>{product.price}</strong>
              <p>{product.summary}</p>
              <Button href="/client" icon={ShoppingCart}>
                {isDe ? "Auswählen" : "Select"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
