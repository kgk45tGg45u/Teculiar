// Customizer layout document (Phase 3). A page's content + structure — theme-independent — is a
// versioned JSON tree of typed nodes. Each node carries its registry `type`, non-translatable
// `props`, translatable `text` slots (per-locale maps), locale-aware `tokens` (price/number/date),
// and `children` (sections → sub-sections → cards). Read whole, stored in a Page JSON column.
// Shared by the live renderer (server) and the builder/preview (client) so both agree on the shape.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Per-locale text, e.g. { en: "Web Hosting", de: "Webhosting" }. Resolved with main-language fallback.
export type LocaleMap = Record<string, string>;

// Locale-aware values rendered through the system's currency/number/date formatting.
export type TokenRef =
  | { kind: "price"; amountCents: number; currency?: string }
  | { kind: "number"; value: number }
  | { kind: "date"; iso: string };

export type Node = {
  id: string; // stable nanoid → DnD key + edit target
  type: string; // generic registry key ("hero", "explainerSection", "textBlock"…) — never theme-prefixed
  props?: Record<string, JsonValue>; // non-translatable structural config (icon, href, grid cols, variant…)
  text?: Record<string, LocaleMap>; // translatable slots: text.title.de / .en …
  tokens?: Record<string, TokenRef>; // locale-aware price/number/date refs
  children?: Node[]; // nesting (containers only)
};

export type LayoutDoc = { schemaVersion: number; root: Node[] };

export const LAYOUT_SCHEMA_VERSION = 1;

export function emptyLayout(): LayoutDoc {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, root: [] };
}

/** Narrow an unknown value (e.g. a DB JSON column) to a LayoutDoc. Tolerant: only checks the frame. */
export function isLayoutDoc(value: unknown): value is LayoutDoc {
  if (!value || typeof value !== "object") {
    return false;
  }
  const doc = value as { schemaVersion?: unknown; root?: unknown };
  return typeof doc.schemaVersion === "number" && Array.isArray(doc.root);
}

/** Coerce an unknown DB value into a LayoutDoc, or null when it isn't one. */
export function asLayoutDoc(value: unknown): LayoutDoc | null {
  return isLayoutDoc(value) ? value : null;
}

/** Depth-first walk of every node in a doc (parents before children). */
export function walkNodes(nodes: Node[] | undefined, visit: (node: Node) => void): void {
  for (const node of nodes ?? []) {
    visit(node);
    walkNodes(node.children, visit);
  }
}
