// Per-viewport (responsive) numeric props for layout-doc elements — e.g. a grid's column count, which
// differs on desktop / tablet / mobile. Stored as { base, md, sm } in node.props; rendered via CSS
// custom properties consumed by registry/responsive.module.css media queries (inline styles can't hold
// media queries, but a CSS var read inside one can). md falls back to base, sm to md/base.
import type { CSSProperties } from "react";
import type { Node } from "./types";

// base = desktop (default), md = tablet (≤1024px), sm = mobile (≤640px).
export type ResponsiveNumber = { base: number; md: number | null; sm: number | null };

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Read a responsive numeric prop. Tolerates a legacy plain number and missing values. */
export function responsiveProp(node: Node, key: string, fallback: number): ResponsiveNumber {
  const value = node.props?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const map = value as Record<string, unknown>;
    return { base: finite(map.base) ?? fallback, md: finite(map.md), sm: finite(map.sm) };
  }
  if (typeof value === "number") {
    return { base: value, md: null, sm: null };
  }
  return { base: fallback, md: null, sm: null };
}

/** CSS custom properties for a responsive column count, consumed by `.grid` in responsive.module.css. */
export function gridColumnsVars(cols: ResponsiveNumber): CSSProperties {
  return {
    "--cols": cols.base,
    "--cols-md": cols.md ?? cols.base,
    "--cols-sm": cols.sm ?? cols.md ?? cols.base
  } as CSSProperties;
}
