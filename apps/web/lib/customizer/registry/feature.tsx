// Feature/"why" grid + cards (theme-neutral). Mirrors the storefront PlatformSection "Why" block:
// a section header (eyebrow + heading + subhead) over a responsive grid of icon/title/body cards.
// featureGrid is the container; featureCard the repeatable child (matching the registry container model).
import platformStyles from "../../../components/marketing/platform-section.module.css";
import { lucideIcon } from "../icons";
import { newId } from "../id";
import { stringProp, textOf } from "../resolve";
import type { ElementDef } from "./types";

export const featureGridDef: ElementDef = {
  type: "featureGrid",
  category: "section",
  label: { en: "Feature grid", de: "Feature-Raster" },
  icon: "LayoutGrid",
  isContainer: true,
  accepts: ["featureCard"],
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true },
    { key: "subtitle", multiline: true }
  ],
  propSchema: [],
  example: () => ({
    id: newId(),
    type: "featureGrid",
    text: {
      eyebrow: { en: "Why us", de: "Warum wir" },
      title: { en: "Digital solutions without the corporate feel.", de: "Digitale Lösungen ohne Konzerngefühl." },
      subtitle: {
        en: "We're not an anonymous data centre. We're people helping other people get online.",
        de: "Wir sind kein anonymes Rechenzentrum. Wir sind Menschen, die anderen Menschen helfen, online zu gehen."
      }
    },
    children: [featureCardDef.example(), featureCardDef.example()]
  }),
  Render: ({ node, locale, mainLocale, children }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const subtitle = textOf(node, "subtitle", locale, mainLocale);
    return (
      <section className="section">
        <div className="container">
          <div className={platformStyles.header}>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className={platformStyles.subhead}>{subtitle}</p> : null}
          </div>
          <div className="grid four">{children}</div>
        </div>
      </section>
    );
  }
};

export const featureCardDef: ElementDef = {
  type: "featureCard",
  category: "card",
  label: { en: "Feature card", de: "Feature-Karte" },
  icon: "SquareStack",
  isContainer: false,
  textSlots: [
    { key: "title" },
    { key: "body", multiline: true }
  ],
  propSchema: [{ key: "icon", type: "iconSelect" }],
  example: () => ({
    id: newId(),
    type: "featureCard",
    props: { icon: "HandHeart" },
    text: {
      title: { en: "For associations & NGOs", de: "Für Vereine & NGOs" },
      body: {
        en: "We understand the challenges of small organisations. No jargon – just fast and honest help.",
        de: "Wir kennen die Herausforderungen kleiner Organisationen. Kein Fachjargon – nur ehrlich und schnelle Hilfe."
      }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const Icon = lucideIcon(stringProp(node, "icon") || "Sparkles");
    const title = textOf(node, "title", locale, mainLocale);
    const body = textOf(node, "body", locale, mainLocale);
    return (
      <div className={platformStyles.item}>
        <Icon aria-hidden size={24} />
        {title ? <h3>{title}</h3> : null}
        {body ? <p>{body}</p> : null}
      </div>
    );
  }
};
