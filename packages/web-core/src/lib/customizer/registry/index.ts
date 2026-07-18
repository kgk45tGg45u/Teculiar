// Registry index — the single map of registered element types, plus lookup/listing helpers used by
// the renderer (server) and the builder palette (client). One def file per cohesive cluster; each def
// is theme-neutral and reuses the storefront's styling so preview == live.
import { badgeDef, buttonDef, iconDef, priceTokenDef, proseDef } from "./atoms";
import { ctaDef } from "./cta";
import { domainSearchDef } from "./domain-search";
import { faqDef, faqItemDef } from "./faq";
import { featureCardDef, featureGridDef } from "./feature";
import { heroDef } from "./hero";
import { pricingPlanDef, pricingTableDef } from "./pricing";
import { productGridDef } from "./product";
import { sectionDef } from "./section";
import { stepDef, stepsDef } from "./steps";
import { textBlockDef } from "./text-block";
import type { ElementCategory, ElementDef } from "./types";

// Order here drives the palette order within each category group.
const DEFS: ElementDef[] = [
  // sections / containers
  heroDef,
  sectionDef,
  featureGridDef,
  stepsDef,
  ctaDef,
  faqDef,
  pricingTableDef,
  // cards (children of containers)
  featureCardDef,
  stepDef,
  faqItemDef,
  pricingPlanDef,
  // atoms
  textBlockDef,
  buttonDef,
  badgeDef,
  iconDef,
  proseDef,
  // dynamic
  productGridDef,
  domainSearchDef,
  // tokens
  priceTokenDef
];

const REGISTRY: Record<string, ElementDef> = Object.fromEntries(DEFS.map((def) => [def.type, def]));

/** The ElementDef for a node type, or undefined if the type isn't registered. */
export function getElementDef(type: string): ElementDef | undefined {
  return REGISTRY[type];
}

/** All registered defs (palette). Optionally filtered by category. */
export function listElements(category?: ElementCategory): ElementDef[] {
  return category ? DEFS.filter((def) => def.category === category) : DEFS;
}

export function isRegistered(type: string): boolean {
  return type in REGISTRY;
}

export type { ElementDef } from "./types";
