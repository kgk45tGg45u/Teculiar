import { Check, Cpu, Database, HardDrive, LifeBuoy } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { apiGet, cycleLabel, serverMoney, type ApiProduct } from "../../lib/api";
import { getCatalog } from "../../lib/catalog";
import { CURRENCY_COOKIE, type Currency, type Locale } from "../../lib/i18n";
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
  const cookieStore = await cookies();
  const savedCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const displayCurrency: Currency =
    savedCurrency === "EUR" || savedCurrency === "USD" ? savedCurrency : locale === "en" ? "USD" : "EUR";

  const [apiProducts, settings] = await Promise.all([
    apiGet<ApiProduct[]>("/storefront/products"),
    apiGet<{ usdExchangeRate?: number; usdBufferCents?: number }>("/storefront/settings")
  ]);
  const exchangeRate = settings?.usdExchangeRate ?? 1.0;
  const bufferCents = settings?.usdBufferCents ?? 0;

  const products = apiProducts?.length
    ? apiProducts.map((p) => toProductCard(p, displayCurrency, exchangeRate, bufferCents, locale))
    : getCatalog(locale);

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

function toProductCard(
  product: ApiProduct,
  displayCurrency: Currency,
  exchangeRate: number,
  bufferCents: number,
  locale: Locale
) {
  const price = product.prices[0];
  const amountCents =
    product.type === "DOMAIN" ? product.minimumPriceCents ?? price?.amountCents : price?.amountCents;
  const fmt = (cents: number) => serverMoney(cents, displayCurrency, exchangeRate, bufferCents, locale);
  const fromText = locale === "de" ? "ab" : "from";
  const cycleText =
    product.type === "DOMAIN"
      ? locale === "de"
        ? "jährlich"
        : "yearly"
      : cycleLabel(price?.billingCycle ?? "", locale);
  const zeroSetup = displayCurrency === "USD" ? "$0.00 Setup" : "0,00 € Setup";

  return {
    id: product.id,
    name: product.name,
    type: productTypeLabel(product.type),
    price:
      amountCents !== undefined
        ? `${fromText} ${fmt(amountCents)} / ${cycleText}`
        : locale === "de"
          ? "Preis folgt"
          : "Price TBA",
    setup: price?.setupFeeCents ? `${fmt(price.setupFeeCents)} Setup` : zeroSetup,
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
