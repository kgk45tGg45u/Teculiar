import { loadDictionary, type Dictionary } from "@dezhost/locales";

export type { Dictionary };

/**
 * Active dictionary for a locale, sourced from the shared @dezhost/locales packs with
 * per-key English fallback baked in. Synchronous (static imports), so server and client
 * components call it the same way.
 *
 * Shape: { common (nav/cta/status/billingCycle), admin, client, storefront, email,
 * invoice, meta }.
 */
export function getDictionary(locale: string): Dictionary {
  return loadDictionary(locale);
}
