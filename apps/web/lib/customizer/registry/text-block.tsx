// Generic text block atom (theme-neutral): eyebrow + heading + paragraph, each translatable. A
// skeleton def proving the text-slot + translate pipeline; the full atom inventory lands in 3d.
import { newId } from "../id";
import { textOf } from "../resolve";
import type { ElementDef } from "./types";

export const textBlockDef: ElementDef = {
  type: "textBlock",
  category: "atom",
  label: { en: "Text block", de: "Textblock" },
  icon: "Type",
  isContainer: false,
  textSlots: [
    { key: "eyebrow" },
    { key: "title" },
    { key: "body", multiline: true }
  ],
  propSchema: [],
  example: () => ({
    id: newId(),
    type: "textBlock",
    text: {
      eyebrow: { en: "Eyebrow", de: "Augenbraue" },
      title: { en: "Heading", de: "Überschrift" },
      body: { en: "Supporting copy goes here.", de: "Begleittext steht hier." }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    const body = textOf(node, "body", locale, mainLocale);
    return (
      <div className="customizer-text-block">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        {title ? <h2>{title}</h2> : null}
        {body ? <p>{body}</p> : null}
      </div>
    );
  }
};
