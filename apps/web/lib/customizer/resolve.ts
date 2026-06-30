// Per-locale resolution helpers for the renderer + element defs. Authored content falls back to the
// store's MAIN language (not English) — reuses `localized()` from storefront-theme.ts, which is
// already `map[locale] || map[mainLocale] || first-available`.
import { localized } from "../storefront-theme";
import type { JsonValue, Node, TokenRef } from "./types";

/** A node's text slot resolved for the active locale (main-language fallback). */
export function textOf(node: Node, slot: string, locale: string, mainLocale: string): string {
  return localized(node.text?.[slot], locale, mainLocale);
}

/** A node's structural prop (non-translatable). */
export function propOf(node: Node, key: string): JsonValue | undefined {
  return node.props?.[key];
}

export function stringProp(node: Node, key: string): string {
  const value = propOf(node, key);
  return typeof value === "string" ? value : "";
}

export function numberProp(node: Node, key: string, fallback = 0): number {
  const value = propOf(node, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A locale-aware token (price/number/date) for the active locale, formatted via Intl. */
export function formatToken(token: TokenRef | undefined, locale: string, currency: string): string {
  if (!token) {
    return "";
  }
  const intlLocale = locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US";
  if (token.kind === "price") {
    return new Intl.NumberFormat(intlLocale, { style: "currency", currency: token.currency || currency }).format(token.amountCents / 100);
  }
  if (token.kind === "number") {
    return new Intl.NumberFormat(intlLocale).format(token.value);
  }
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "long" }).format(new Date(token.iso));
}
