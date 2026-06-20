// Backend i18n helper — a thin, dependency-free wrapper over the shared @dezhost/locales
// bundle so server-rendered artefacts (invoice PDFs, emails) localise the same way the web
// app does. Locale-aware money/date formatting uses each locale's meta (BCP-47), with an
// en-GB fallback for any locale whose meta is missing.
import { getMeta, loadDictionary, t as packT, type Dictionary } from "@dezhost/locales";

export { loadDictionary };
export type { Dictionary };

/** Dotted-key lookup (e.g. "invoice.title") with per-key English fallback. */
export function t(locale: string, key: string): string {
  return packT(locale, key);
}

/** Format a minor-unit amount in the given currency, localised via the locale's number format. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(getMeta(locale).numberFormat, { currency: currency || "EUR", style: "currency" }).format(cents / 100);
}

/** Localised date formatting; returns "-" for empty/invalid input. */
export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(getMeta(locale).dateFormat, options).format(date) : "-";
}
