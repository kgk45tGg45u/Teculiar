import { Check, Cpu, Database, HardDrive, LifeBuoy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { apiGet, cycleLabel, money, type ApiProduct } from "../../lib/api";
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

type ProductCardModel = {
  highlights: string[];
  id?: string;
  name: string;
  price: string;
  setup: string;
  summary: string;
  type: keyof typeof icons;
};

export async function ProductGrid({ locale }: { locale: Locale }) {
  const apiProducts = await apiGet<ApiProduct[]>("/storefront/products");
  const products = apiProducts?.length ? apiProducts.map(toProductCard) : getCatalog(locale);

  return (
    <section className="section">
      <div className="container">
        <span className="eyebrow">{locale === "de" ? "Hosting-Pakete" : "Hosting packages"}</span>
        <h2 className={styles.heading}>
          {locale === "de" ? "Wähle das Paket, das zu dir passt." : "Choose the package that fits you."}
        </h2>
        <div className="grid four">
          {products.map((product, index) => {
            const Icon = icons[product.type];
            const card = (
              <ProductCardContent
                cta={"id" in product ? (locale === "de" ? "Bestellen" : "Order") : undefined}
                icon={<Icon aria-hidden size={22} />}
                index={index}
                product={product}
              />
            );
            return "id" in product ? (
              <Link className={styles.cardLink} href={`/${locale}/order/${product.id}`} key={product.name}>
                {card}
              </Link>
            ) : (
              <div key={product.name}>{card}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProductCardContent({
  cta,
  icon,
  index,
  product
}: {
  cta?: string;
  icon: ReactNode;
  index: number;
  product: ProductCardModel;
}) {
  return (
    <Card tone={index === 1 ? "selected" : "default"}>
      <div className={styles.icon}>{icon}</div>
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
      {cta ? <span className={styles.cardCta}>{cta}</span> : null}
    </Card>
  );
}

function toProductCard(product: ApiProduct) {
  const price = product.prices[0];
  const amountCents = product.type === "DOMAIN" ? product.minimumPriceCents ?? price?.amountCents : price?.amountCents;

  return {
    id: product.id,
    name: product.name,
    type: productTypeLabel(product.type),
    price: amountCents !== undefined ? `from ${money(amountCents, price?.currency ?? "EUR")} / ${product.type === "DOMAIN" ? "yearly" : cycleLabel(price?.billingCycle ?? "")}` : "Preis folgt",
    setup: price?.setupFeeCents ? `${money(price.setupFeeCents, price.currency)} Setup` : "0,00 EUR Setup",
    summary: product.description,
    highlights: (product.configs ?? [])
      .filter((config) => !config.key.startsWith("virtualmin_"))
      .slice(0, 3)
      .map((config) => `${config.label}${config.values[0] ? `: ${String(config.values[0])}` : ""}`)
  };
}

function productTypeLabel(type: string) {
  if (type === "SHARED_HOSTING") {
    return "Shared" as const;
  }
  if (type === "DOMAIN") {
    return "Domain" as const;
  }
  if (type === "VPS") {
    return "VPS" as const;
  }

  return "Managed" as const;
}
