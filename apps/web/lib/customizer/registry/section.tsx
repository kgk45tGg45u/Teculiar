// Generic section container (theme-neutral). Holds child nodes; the only structural prop is a
// layout `variant`. This is a skeleton def proving the container pipeline — the full inventory
// (Hero, Explainer grid, Steps, CTA…) is registered in sub-phase 3d.
import { newId } from "../id";
import { stringProp } from "../resolve";
import type { ElementDef } from "./types";

export const sectionDef: ElementDef = {
  type: "section",
  category: "section",
  label: { en: "Section", de: "Abschnitt" },
  icon: "LayoutTemplate",
  isContainer: true,
  textSlots: [],
  propSchema: [{ key: "variant", type: "select", options: ["default", "muted", "accent"] }],
  example: () => ({ id: newId(), type: "section", props: { variant: "default" }, children: [] }),
  Render: ({ node, children }) => {
    const variant = stringProp(node, "variant") || "default";
    return (
      <section className="customizer-section" data-variant={variant}>
        {children}
      </section>
    );
  }
};
