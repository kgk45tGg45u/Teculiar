// Hero section (theme-neutral). Mirrors the storefront Hero markup/styling exactly (hero.module.css +
// global section/eyebrow/display/lead classes) but takes all copy via the layout doc, so it renders
// identically on the live site while being fully editable in the builder.
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import heroStyles from "../../../components/marketing/hero.module.css";
import { lucideIcon } from "../icons";
import { newId } from "../id";
import { stringProp, textOf } from "../resolve";
import type { ElementDef } from "./types";

const SIGNAL_SLOTS: Array<[string, string]> = [
  ["stat1", "stat1Label"],
  ["stat2", "stat2Label"],
  ["stat3", "stat3Label"]
];

export const heroDef: ElementDef = {
  type: "hero",
  category: "section",
  label: { en: "Hero", de: "Hero" },
  icon: "Megaphone",
  isContainer: false,
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true },
    { key: "subtitle", multiline: true },
    { key: "primaryCta" },
    { key: "secondaryCta" },
    { key: "stat1" },
    { key: "stat1Label" },
    { key: "stat2" },
    { key: "stat2Label" },
    { key: "stat3" },
    { key: "stat3Label" }
  ],
  propSchema: [
    { key: "primaryHref", type: "link" },
    { key: "secondaryHref", type: "link" },
    { key: "eyebrowIcon", type: "iconSelect" },
    { key: "imageUrl", type: "text" }
  ],
  example: () => ({
    id: newId(),
    type: "hero",
    props: { primaryHref: "/de/webhosting", secondaryHref: "/de/kontakt", eyebrowIcon: "ShieldCheck", imageUrl: "" },
    text: {
      eyebrow: { en: "Fast and secure hosting from Berlin", de: "Schnell und sicheres Hosting aus Berlin" },
      title: { en: "Need some space?", de: "Brauchst du Freiraum?" },
      subtitle: {
        en: "Web solutions for individuals, associations, organisations and small businesses. Explained personally. Priced fairly.",
        de: "Weblösungen für Einzelpersonen, Vereine, Organisationen und kleine Unternehmen. Persönlich erklärt. Fair berechnet."
      },
      primaryCta: { en: "View hosting", de: "Hosting-pakete ansehen" },
      secondaryCta: { en: "Get free consultation", de: "Kostenlose Beratung" },
      stat1: { en: "99.9%", de: "99.9%" },
      stat1Label: { en: "Uptime", de: "Verfügbarkeit" },
      stat2: { en: "DE", de: "DE" },
      stat2Label: { en: "Servers & support", de: "Server & Support" },
      stat3: { en: "GDPR", de: "DSGVO" },
      stat3Label: { en: "Privacy included", de: "Datenschutz inklusive" }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const subtitle = textOf(node, "subtitle", locale, mainLocale);
    const primaryCta = textOf(node, "primaryCta", locale, mainLocale);
    const secondaryCta = textOf(node, "secondaryCta", locale, mainLocale);
    const imageUrl = stringProp(node, "imageUrl");
    const EyebrowIcon = lucideIcon(stringProp(node, "eyebrowIcon") || "ShieldCheck");
    const signals = SIGNAL_SLOTS.map(([value, label]) => ({
      value: textOf(node, value, locale, mainLocale),
      label: textOf(node, label, locale, mainLocale)
    })).filter((signal) => signal.value || signal.label);

    return (
      <section className={`section ${heroStyles.hero}`}>
        <div className="container">
          <div className={imageUrl ? heroStyles.heroInner : undefined}>
            <div className={imageUrl ? heroStyles.heroContent : undefined}>
              {eyebrow ? (
                <span className="eyebrow">
                  <EyebrowIcon aria-hidden size={16} />
                  {eyebrow}
                </span>
              ) : null}
              {title ? <h1 className="display">{title}</h1> : null}
              {subtitle ? <p className="lead">{subtitle}</p> : null}
              {primaryCta || secondaryCta ? (
                <div className={heroStyles.actions}>
                  {primaryCta ? <Button href={stringProp(node, "primaryHref") || "#"} icon={ArrowRight}>{primaryCta}</Button> : null}
                  {secondaryCta ? <Button href={stringProp(node, "secondaryHref") || "#"} icon={MessageCircle} variant="secondary">{secondaryCta}</Button> : null}
                </div>
              ) : null}
              {signals.length ? (
                <div className={heroStyles.signal}>
                  {signals.map((signal, index) => (
                    <div key={index}>
                      <strong>{signal.value}</strong>
                      <span>{signal.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {imageUrl ? (
              <div aria-hidden className={heroStyles.heroImage}>
                <img alt="" src={imageUrl} />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
};
