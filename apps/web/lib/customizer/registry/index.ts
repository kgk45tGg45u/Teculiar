// Registry index — the single map of registered element types, plus lookup/listing helpers used by
// the renderer (server) and the builder palette (client). Add new element defs here as 3d populates
// the inventory; each def file stays small and theme-neutral.
import { sectionDef } from "./section";
import { textBlockDef } from "./text-block";
import type { ElementCategory, ElementDef } from "./types";

const DEFS: ElementDef[] = [sectionDef, textBlockDef];

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
