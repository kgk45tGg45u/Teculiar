import { dictionary, type Locale } from "./i18n";

// The full string dictionary shape for one locale (keyed off the inline source).
export type Dictionary = (typeof dictionary)[keyof typeof dictionary];

/**
 * Synchronous dictionary accessor with English fallback for unknown locales.
 *
 * For now this is backed by the inline `dictionary` in i18n.ts; the web sweep swaps the
 * implementation to read the shared `@dezhost/locales` packs (with per-key English
 * fallback) without changing any call site.
 */
export function getDictionary(locale: Locale): Dictionary {
  return (dictionary as Record<string, Dictionary>)[locale] ?? dictionary.en;
}
