"use client";

import { useEffect, useState } from "react";
import { PREFS_CHANGED_EVENT, currentCurrency } from "./api";
import type { Currency } from "./i18n";

// Re-read triggers. `pageshow` covers both normal navigation AND back/forward bfcache restores
// (where effects don't re-run, so it's the only reliable signal); `popstate` covers SPA
// back/forward; `focus`/`storage` cover tab refocus and cross-tab changes.
const SYNC_EVENTS = [PREFS_CHANGED_EVENT, "pageshow", "popstate", "focus", "storage"] as const;

/**
 * Reactive read of the visitor's chosen display currency. Unlike reading `currentCurrency()` once at
 * mount, this stays in sync when the preference changes (here or in another tab) and — crucially —
 * when the page is restored from the back/forward (bfcache) snapshot, so the header toggle and every
 * <Price> never disagree or show a stale currency. Currency is scope-aware, so `/admin` and the
 * public site read their own cookies.
 *
 * Pass `initial` to control the first (SSR-stable) value and avoid a hydration mismatch where it
 * matters; defaults to the configured main currency.
 */
export function useCurrency(initial?: Currency): Currency {
  const [currency, setCurrency] = useState<Currency>(initial ?? "EUR");
  useEffect(() => {
    const sync = () => setCurrency(currentCurrency());
    sync();
    SYNC_EVENTS.forEach((event) => window.addEventListener(event, sync));
    return () => SYNC_EVENTS.forEach((event) => window.removeEventListener(event, sync));
  }, []);
  return currency;
}
