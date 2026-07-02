// Process/"how it works" steps (theme-neutral). Mirrors the storefront PlatformSection steps block:
// a header over numbered step cards, with an optional call-to-action button below.
import { ArrowRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import platformStyles from "../../../components/marketing/platform-section.module.css";
import { newId } from "../id";
import { stringProp, textOf } from "../resolve";
import type { ElementDef } from "./types";

export const stepsDef: ElementDef = {
  type: "steps",
  category: "section",
  label: { en: "Steps", de: "Schritte" },
  icon: "ListOrdered",
  isContainer: true,
  accepts: ["step"],
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true },
    { key: "ctaLabel" }
  ],
  propSchema: [{ key: "ctaHref", type: "link" }],
  example: () => ({
    id: newId(),
    type: "steps",
    props: { ctaHref: "/de/kontakt" },
    text: {
      eyebrow: { en: "How it works", de: "So einfach geht's" },
      title: { en: "From idea to finished website.", de: "Von der Idee zur fertigen Website." },
      ctaLabel: { en: "Get started", de: "Jetzt starten" }
    },
    children: [stepDef.example(), stepDef.example()]
  }),
  Render: ({ node, locale, mainLocale, children }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const ctaLabel = textOf(node, "ctaLabel", locale, mainLocale);
    return (
      <section className={`section ${platformStyles.stepsSection}`}>
        <div className="container">
          <div className={platformStyles.header}>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          <div className={platformStyles.steps}>{children}</div>
          {ctaLabel ? (
            <div className={platformStyles.stepsCta}>
              <Button href={stringProp(node, "ctaHref") || "#"} icon={ArrowRight}>{ctaLabel}</Button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }
};

export const stepDef: ElementDef = {
  type: "step",
  category: "card",
  label: { en: "Step", de: "Schritt" },
  icon: "Hash",
  isContainer: false,
  textSlots: [
    { key: "title" },
    { key: "body", multiline: true }
  ],
  propSchema: [{ key: "num", type: "text" }],
  example: () => ({
    id: newId(),
    type: "step",
    props: { num: "01" },
    text: {
      title: { en: "Tell us your idea", de: "Idee erzählen" },
      body: {
        en: "Just write to us about what you need. We answer you quickly.",
        de: "Schreib uns einfach, was du brauchst. Wir melden uns schnell zurück."
      }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const num = stringProp(node, "num");
    const title = textOf(node, "title", locale, mainLocale);
    const body = textOf(node, "body", locale, mainLocale);
    return (
      <div className={platformStyles.step}>
        {num ? <span className={platformStyles.stepNum}>{num}</span> : null}
        {title ? <h3>{title}</h3> : null}
        {body ? <p>{body}</p> : null}
      </div>
    );
  }
};
