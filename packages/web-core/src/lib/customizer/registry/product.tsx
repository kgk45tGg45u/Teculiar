// Dynamic, data-wired element: a product packages grid for a chosen catalog category, in a chosen
// (responsive) grid size. On the live (server-rendered) page it fetches the category's products at
// request time and renders locale/currency-aware cards; in the builder preview (client) it shows a
// configuration placeholder. Same registry → the live page and the published doc agree.
import { ArrowRight, Check, Package } from "lucide-react";
import { apiGet, money, type ApiProduct } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { featuredCardClass, PopularBadge } from "../../../components/marketing/popular-badge";
import type { Locale } from "../../i18n";
import { newId } from "../id";
import { stringProp, textOf } from "../resolve";
import { gridColumnsVars, responsiveProp, type ResponsiveNumber } from "../responsive";
import gridStyles from "./responsive.module.css";
import productStyles from "../../../components/marketing/product-grid.module.css";
import type { ElementDef } from "./types";

export const productGridDef: ElementDef = {
  type: "productGrid",
  category: "dynamic",
  label: { en: "Product packages", de: "Produktpakete" },
  icon: "Package",
  isContainer: false,
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true },
    { key: "ctaLabel" }
  ],
  propSchema: [
    { key: "category", type: "text" },
    { key: "columns", type: "responsiveNumber" }
  ],
  example: () => ({
    id: newId(),
    type: "productGrid",
    props: { category: "webhosting", columns: { base: 3, md: 2, sm: 1 } },
    text: {
      eyebrow: { en: "Our packages", de: "Unsere Pakete" },
      title: { en: "Choose the package that fits you.", de: "Wähle das Paket, das zu dir passt." },
      ctaLabel: { en: "Order now", de: "Jetzt bestellen" }
    }
  }),
  Render: ({ node, locale, mainLocale, mode }) => {
    const category = stringProp(node, "category");
    const cols = responsiveProp(node, "columns", 3);
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const ctaLabel = textOf(node, "ctaLabel", locale, mainLocale) || (locale === "de" ? "Jetzt bestellen" : "Order now");

    if (mode === "preview") {
      return (
        <section className="section">
          <div className="container">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed var(--border)", borderRadius: 12, padding: 32, color: "var(--muted)" }}>
              <Package aria-hidden size={18} /> {category ? `${category} · ${cols.base}/${cols.md ?? cols.base}/${cols.sm ?? cols.md ?? cols.base}` : "—"}
            </div>
          </div>
        </section>
      );
    }
    if (!category) {
      return null;
    }
    return <ProductPackages category={category} cols={cols} ctaLabel={ctaLabel} eyebrow={eyebrow} locale={locale as Locale} title={title} />;
  }
};

// Live render (server): fetch the category's products and render the cards.
async function ProductPackages({ category, cols, locale, eyebrow, title, ctaLabel }: { category: string; cols: ResponsiveNumber; locale: Locale; eyebrow: string; title: string; ctaLabel: string }) {
  const products = (await apiGet<ApiProduct[]>(`/storefront/products?category=${encodeURIComponent(category)}`)) ?? [];
  if (!products.length) {
    return null;
  }
  return (
    <section className="section">
      <div className="container">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        {title ? <h2 className={productStyles.heading}>{title}</h2> : null}
        <div className={gridStyles.grid} data-grid="responsive" style={gridColumnsVars(cols)}>
          {products.map((product) => (
            <ProductCard ctaLabel={ctaLabel} key={product.id} locale={locale} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ product, locale, ctaLabel }: { product: ApiProduct; locale: Locale; ctaLabel: string }) {
  const price = product.prices.find((entry) => entry.billingCycle === "MONTHLY") ?? product.prices[0];
  const specs = (product.configs ?? []).filter((config) => !config.key.startsWith("virtualmin_")).slice(0, 5);
  const period = price?.billingCycle === "MONTHLY" ? (locale === "de" ? "/Monat" : "/month") : "";
  const featured = product.featured === true;
  return (
    <Card className={featured ? featuredCardClass : undefined}>
      {featured ? <PopularBadge locale={locale} /> : null}
      <h3>{product.name}</h3>
      {price ? (
        <div className={productStyles.price}>
          <strong suppressHydrationWarning>{money(price.amountCents, price.currency, locale)}{period}</strong>
        </div>
      ) : null}
      {product.description ? <p>{product.description}</p> : null}
      {specs.length ? (
        <ul className={productStyles.list}>
          {specs.map((spec) => (
            <li key={spec.key}>
              <Check aria-hidden size={16} />
              {spec.label}{spec.values[0] ? `: ${String(spec.values[0])}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <Button href={`/${locale}/order/${product.id}`} icon={ArrowRight} variant="secondary">{ctaLabel}</Button>
    </Card>
  );
}
