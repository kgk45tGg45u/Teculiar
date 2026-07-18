// Pricing table (theme-neutral): a section container of authorable plan cards — name, locale-aware
// price + period, feature list (one per line), CTA — for pages that sell a plan directly (e.g. the
// Teculiar plan on teculiar.com). Static/authorable on purpose: unlike the dynamic productGrid it
// renders exactly what the admin writes, so marketing pages can present plans without a catalog
// category. Reuses the product-grid card styling + the shared featured badge so preview == live.
import { ArrowRight, Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { featuredCardClass, PopularBadge } from "../../../components/marketing/popular-badge";
import platformStyles from "../../../components/marketing/platform-section.module.css";
import productStyles from "../../../components/marketing/product-grid.module.css";
import type { Locale } from "../../i18n";
import { newId } from "../id";
import { formatToken, numberProp, stringProp, textOf } from "../resolve";
import { gridColumnsVars, responsiveProp } from "../responsive";
import gridStyles from "./responsive.module.css";
import type { ElementDef } from "./types";

export const pricingTableDef: ElementDef = {
  type: "pricingTable",
  category: "section",
  label: { en: "Pricing table", de: "Preistabelle" },
  icon: "Table",
  isContainer: true,
  accepts: ["pricingPlan"],
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true },
    { key: "subtitle", multiline: true }
  ],
  propSchema: [{ key: "columns", type: "responsiveNumber" }],
  example: () => ({
    id: newId(),
    type: "pricingTable",
    props: { columns: { base: 3, md: 2, sm: 1 } },
    text: {
      eyebrow: { en: "Pricing", de: "Preise" },
      title: { en: "One plan, everything included.", de: "Ein Tarif, alles inklusive." },
      subtitle: {
        en: "Transparent monthly pricing. Cancel anytime.",
        de: "Transparente monatliche Preise. Jederzeit kündbar."
      }
    },
    children: [pricingPlanDef.example()]
  }),
  Render: ({ node, locale, mainLocale, children }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const subtitle = textOf(node, "subtitle", locale, mainLocale);
    const cols = responsiveProp(node, "columns", 3);
    return (
      <section className="section">
        <div className="container">
          <div className={platformStyles.header}>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className={platformStyles.subhead}>{subtitle}</p> : null}
          </div>
          <div className={gridStyles.grid} data-grid="responsive" style={gridColumnsVars(cols)}>{children}</div>
        </div>
      </section>
    );
  }
};

export const pricingPlanDef: ElementDef = {
  type: "pricingPlan",
  category: "card",
  label: { en: "Pricing plan", de: "Preis-Paket" },
  icon: "BadgeEuro",
  isContainer: false,
  textSlots: [
    { key: "title" },
    { key: "suffix" },
    { key: "body", multiline: true },
    { key: "ctaLabel" }
  ],
  propSchema: [
    { key: "amountCents", type: "number" },
    { key: "currency", type: "text" },
    { key: "href", type: "link" },
    { key: "variant", type: "select", options: ["standard", "featured"] }
  ],
  example: () => ({
    id: newId(),
    type: "pricingPlan",
    props: { amountCents: 2900, currency: "EUR", href: "/de/kontakt", variant: "featured" },
    text: {
      title: { en: "Teculiar", de: "Teculiar" },
      suffix: { en: "/month", de: "/Monat" },
      body: {
        en: "Your own storefront\nAdmin & client dashboards\nOwn database\nFree subdomain",
        de: "Eigener Storefront\nAdmin- & Kunden-Dashboards\nEigene Datenbank\nGratis Subdomain"
      },
      ctaLabel: { en: "Get started", de: "Jetzt starten" }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const title = textOf(node, "title", locale, mainLocale);
    const suffix = textOf(node, "suffix", locale, mainLocale);
    const ctaLabel = textOf(node, "ctaLabel", locale, mainLocale);
    const currency = stringProp(node, "currency") || "EUR";
    const amountCents = numberProp(node, "amountCents");
    const price = amountCents > 0 ? formatToken({ kind: "price", amountCents, currency }, locale, currency) : "";
    const features = textOf(node, "body", locale, mainLocale)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const featured = stringProp(node, "variant") === "featured";
    return (
      <Card className={featured ? featuredCardClass : undefined}>
        {featured ? <PopularBadge locale={locale as Locale} /> : null}
        {title ? <h3>{title}</h3> : null}
        {price ? (
          <div className={productStyles.price}>
            <strong>
              {price}
              {suffix}
            </strong>
          </div>
        ) : null}
        {features.length ? (
          <ul className={productStyles.list}>
            {features.map((feature, index) => (
              <li key={index}>
                <Check aria-hidden size={16} />
                {feature}
              </li>
            ))}
          </ul>
        ) : null}
        {ctaLabel ? (
          <Button href={stringProp(node, "href") || "#"} icon={ArrowRight} variant={featured ? "primary" : "secondary"}>
            {ctaLabel}
          </Button>
        ) : null}
      </Card>
    );
  }
};
