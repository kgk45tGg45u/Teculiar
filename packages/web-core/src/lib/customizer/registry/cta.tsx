// Call-out / CTA section (theme-neutral). Mirrors the storefront PlatformSection callout: a two-column
// band with eyebrow + heading + body on the left and one or two action buttons on the right.
import { ArrowRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import platformStyles from "../../../components/marketing/platform-section.module.css";
import { newId } from "../id";
import { stringProp, textOf } from "../resolve";
import type { ElementDef } from "./types";

export const ctaDef: ElementDef = {
  type: "cta",
  category: "section",
  label: { en: "Call to action", de: "Handlungsaufruf" },
  icon: "MousePointerClick",
  isContainer: false,
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true },
    { key: "body", multiline: true },
    { key: "primaryCta" },
    { key: "secondaryCta" }
  ],
  propSchema: [
    { key: "primaryHref", type: "link" },
    { key: "secondaryHref", type: "link" }
  ],
  example: () => ({
    id: newId(),
    type: "cta",
    props: { primaryHref: "/de/kontakt", secondaryHref: "/de/webhosting" },
    text: {
      eyebrow: { en: "For associations & NGOs", de: "Für Vereine & NGOs" },
      title: {
        en: "You have a mission. We make sure it's visible online.",
        de: "Ihr habt eine Mission. Wir sorgen dafür, dass sie online sichtbar ist."
      },
      body: {
        en: "Whether a sports club, cultural initiative, political group or non-profit – we offer fair prices, personal advice and technical support you can actually understand.",
        de: "Ob Sportverein, Kulturinitiative, politische Gruppe oder gemeinnützige Organisation – wir bieten euch faire Preise, persönliche Beratung und technische Unterstützung, die ihr wirklich versteht."
      },
      primaryCta: { en: "Get free consultation", de: "Kostenlos beraten lassen" },
      secondaryCta: { en: "View hosting", de: "Hosting ansehen" }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const body = textOf(node, "body", locale, mainLocale);
    const primaryCta = textOf(node, "primaryCta", locale, mainLocale);
    const secondaryCta = textOf(node, "secondaryCta", locale, mainLocale);
    return (
      <section className={`section tight ${platformStyles.callout}`}>
        <div className="container">
          <div className={platformStyles.calloutInner}>
            <div>
              {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
              {title ? <h2>{title}</h2> : null}
              {body ? <p>{body}</p> : null}
            </div>
            {primaryCta || secondaryCta ? (
              <div className={platformStyles.calloutActions}>
                {primaryCta ? <Button href={stringProp(node, "primaryHref") || "#"} icon={ArrowRight}>{primaryCta}</Button> : null}
                {secondaryCta ? <Button href={stringProp(node, "secondaryHref") || "#"} variant="secondary">{secondaryCta}</Button> : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
};
