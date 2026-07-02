// Element registry — single source of truth for every Customizer element type (theme-neutral).
// One ElementDef per type declares its palette metadata, edit-modal schema (text slots + prop
// fields), example content on drop, and React renderer. Shared by the renderer (server) and the
// builder (client) so palette, edit modal, validation, and rendering all agree.
//
// Phase 3b ships the registry FRAMEWORK + a couple of generic defs; the full element inventory
// (Hero, Explainer grid/cards, Steps, CTA, FAQ, dynamic product grids, tokens…) is populated in 3d.
import type { ReactNode } from "react";
import type { LocaleMap, Node } from "../types";

export type RenderMode = "live" | "preview";

export type RenderProps = {
  node: Node;
  locale: string;
  mainLocale: string;
  mode: RenderMode;
  children?: ReactNode; // rendered child nodes (containers only)
};

// Edit-modal: a translatable text slot (drives the ≥2-language translate modal + DeepSeek button).
export type TextSlot = { key: string; multiline?: boolean };

// Edit-modal: a non-translatable structural input. `number` is a single value; `responsiveNumber`
// edits a per-viewport { base, md, sm } value (desktop / tablet / mobile).
export type PropField =
  | { key: string; type: "text" | "link" | "iconSelect" }
  | { key: string; type: "select"; options: string[] }
  | { key: string; type: "number" }
  | { key: string; type: "responsiveNumber" };

export type ElementCategory = "section" | "card" | "atom" | "dynamic" | "token";

export type ElementDef = {
  type: string; // generic registry key (matches Node.type)
  category: ElementCategory;
  label: LocaleMap; // palette label, per-locale
  icon: string; // lucide icon name for the palette
  isContainer: boolean; // can hold children
  accepts?: string[]; // child types a container accepts (e.g. explainerSection → ["explainerCard"])
  textSlots: TextSlot[]; // translatable slots → edit modal
  propSchema: PropField[]; // typed structural inputs → edit modal
  example: () => Node; // pre-filled example node dropped onto the canvas
  Render: (props: RenderProps) => ReactNode; // wraps the reusable presentational component
};
