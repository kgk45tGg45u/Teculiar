// Theme-neutral atoms + a price token. Small reusable building blocks that reuse the storefront UI
// primitives (Button, Badge) and the locale-aware token formatter, so they look identical on the live
// site and in the builder preview.
import { Badge, type BadgeTone } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { lucideIcon } from "../icons";
import { newId } from "../id";
import { formatToken, numberProp, stringProp, textOf } from "../resolve";
import type { ElementDef } from "./types";

export const buttonDef: ElementDef = {
  type: "button",
  category: "atom",
  label: { en: "Button", de: "Schaltfläche" },
  icon: "SquareMousePointer",
  isContainer: false,
  textSlots: [{ key: "label" }],
  propSchema: [
    { key: "href", type: "link" },
    { key: "variant", type: "select", options: ["primary", "secondary", "ghost"] }
  ],
  example: () => ({
    id: newId(),
    type: "button",
    props: { href: "/de/kontakt", variant: "primary" },
    text: { label: { en: "Get started", de: "Jetzt starten" } }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const label = textOf(node, "label", locale, mainLocale);
    if (!label) {
      return null;
    }
    const variant = stringProp(node, "variant");
    return (
      <Button href={stringProp(node, "href") || "#"} variant={variant === "secondary" || variant === "ghost" ? variant : "primary"}>
        {label}
      </Button>
    );
  }
};

const BADGE_TONES: BadgeTone[] = ["neutral", "success", "warning", "danger", "accent"];

export const badgeDef: ElementDef = {
  type: "badge",
  category: "atom",
  label: { en: "Badge", de: "Abzeichen" },
  icon: "Tag",
  isContainer: false,
  textSlots: [{ key: "text" }],
  propSchema: [{ key: "tone", type: "select", options: BADGE_TONES }],
  example: () => ({
    id: newId(),
    type: "badge",
    props: { tone: "accent" },
    text: { text: { en: "New", de: "Neu" } }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const text = textOf(node, "text", locale, mainLocale);
    if (!text) {
      return null;
    }
    const tone = stringProp(node, "tone") as BadgeTone;
    return <Badge tone={BADGE_TONES.includes(tone) ? tone : "neutral"}>{text}</Badge>;
  }
};

export const iconDef: ElementDef = {
  type: "icon",
  category: "atom",
  label: { en: "Icon", de: "Symbol" },
  icon: "Image",
  isContainer: false,
  textSlots: [],
  propSchema: [
    { key: "icon", type: "iconSelect" },
    { key: "size", type: "responsiveNumber" }
  ],
  example: () => ({ id: newId(), type: "icon", props: { icon: "Sparkles", size: 28 } }),
  Render: ({ node }) => {
    const Icon = lucideIcon(stringProp(node, "icon") || "Sparkles");
    return <Icon aria-hidden size={numberProp(node, "size", 28)} />;
  }
};

export const proseDef: ElementDef = {
  type: "prose",
  category: "atom",
  label: { en: "Rich text", de: "Fließtext" },
  icon: "AlignLeft",
  isContainer: false,
  textSlots: [
    { key: "heading" },
    { key: "body", multiline: true }
  ],
  propSchema: [],
  example: () => ({
    id: newId(),
    type: "prose",
    text: {
      heading: { en: "About us", de: "Über uns" },
      body: {
        en: "Write your paragraphs here.\n\nLeave a blank line between paragraphs.",
        de: "Schreibe hier deine Absätze.\n\nLasse eine Leerzeile zwischen den Absätzen."
      }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const heading = textOf(node, "heading", locale, mainLocale);
    const body = textOf(node, "body", locale, mainLocale);
    const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return (
      <section className="section tight">
        <div className="container">
          {heading ? <h2>{heading}</h2> : null}
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
    );
  }
};

export const priceTokenDef: ElementDef = {
  type: "priceToken",
  category: "token",
  label: { en: "Price", de: "Preis" },
  icon: "BadgeEuro",
  isContainer: false,
  textSlots: [
    { key: "prefix" },
    { key: "suffix" }
  ],
  propSchema: [
    { key: "amountCents", type: "responsiveNumber" },
    { key: "currency", type: "text" }
  ],
  example: () => ({
    id: newId(),
    type: "priceToken",
    props: { amountCents: 399, currency: "EUR" },
    text: { prefix: { en: "from ", de: "ab " }, suffix: { en: "/month", de: "/Monat" } }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const currency = stringProp(node, "currency") || "EUR";
    const formatted = formatToken({ kind: "price", amountCents: numberProp(node, "amountCents"), currency }, locale, currency);
    const prefix = textOf(node, "prefix", locale, mainLocale);
    const suffix = textOf(node, "suffix", locale, mainLocale);
    return (
      <strong>
        {prefix}
        {formatted}
        {suffix}
      </strong>
    );
  }
};
