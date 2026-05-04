import { Check, Cpu, Database, HardDrive, LifeBuoy } from "lucide-react";
import { getCatalog } from "../../lib/catalog";
import type { Locale } from "../../lib/i18n";
import { Card } from "../ui/card";
import styles from "./product-grid.module.css";

const icons = {
  Shared: Database,
  Domain: Database,
  VPS: Cpu,
  Dedicated: HardDrive,
  Nextcloud: Database,
  CRM: Database,
  Managed: LifeBuoy,
  Support: LifeBuoy
};

export function ProductGrid({ locale }: { locale: Locale }) {
  const products = getCatalog(locale);

  return (
    <section className="section">
      <div className="container">
        <span className="eyebrow">{locale === "de" ? "Produktlinie" : "Product line"}</span>
        <h2 className={styles.heading}>
          {locale === "de" ? "Pakete, die vom ersten Vertrag bis zum Upgrade sauber bleiben." : "Packages that stay clean from first contract to upgrade."}
        </h2>
        <div className="grid four">
          {products.map((product, index) => {
            const Icon = icons[product.type];
            return (
              <Card key={product.name} tone={index === 1 ? "selected" : "default"}>
                <div className={styles.icon}>
                  <Icon aria-hidden size={22} />
                </div>
                <div>
                  <h3>{product.name}</h3>
                  <p>{product.summary}</p>
                </div>
                <div className={styles.price}>
                  <strong>{product.price}</strong>
                  <span>{product.setup}</span>
                </div>
                <ul className={styles.list}>
                  {product.highlights.map((highlight) => (
                    <li key={highlight}>
                      <Check aria-hidden size={16} />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
