"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PREFS_CHANGED_EVENT, currentLocale } from "../../lib/api";
import type { Locale } from "../../lib/i18n";

// Same re-read triggers as useCurrency: PREFS change (toggle), bfcache restore + SPA back/forward,
// tab refocus and cross-tab storage edits.
const SYNC_EVENTS = [PREFS_CHANGED_EVENT, "pageshow", "popstate", "focus", "storage"] as const;

const LocaleContext = createContext<Locale | null>(null);

/**
 * Seeds client components with the SERVER-resolved locale so SSR and hydration agree.
 *
 * `currentLocale()` can't read the per-request cookie during SSR (no `window`), so a client component
 * that renders localized text would SSR with the build-time default and hydrate with the cookie value
 * — a hydration mismatch whenever the visitor's language differs from the default. The layout already
 * resolves the cookie locale server-side (`requestLocale`) and passes it here as `locale`; the provider
 * uses it as the SSR-stable initial value, then keeps the tree in sync after mount (toggle, back/forward,
 * other tabs) exactly like useCurrency.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [value, setValue] = useState<Locale>(locale);
  useEffect(() => {
    const sync = () => setValue(currentLocale());
    sync();
    SYNC_EVENTS.forEach((event) => window.addEventListener(event, sync));
    return () => SYNC_EVENTS.forEach((event) => window.removeEventListener(event, sync));
  }, []);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Reactive, SSR-stable display locale for client components. Returns the provider's value (the
 * server-resolved cookie locale during SSR/hydration, the live cookie afterwards). Falls back to
 * `currentLocale()` when used outside a provider so non-admin call sites keep their old behavior.
 */
export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  const [fallback, setFallback] = useState<Locale>(ctx ?? currentLocale());
  useEffect(() => {
    if (ctx !== null) {
      return;
    }
    const sync = () => setFallback(currentLocale());
    sync();
    SYNC_EVENTS.forEach((event) => window.addEventListener(event, sync));
    return () => SYNC_EVENTS.forEach((event) => window.removeEventListener(event, sync));
  }, [ctx]);
  return ctx ?? fallback;
}
