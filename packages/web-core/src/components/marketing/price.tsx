"use client";

import { money } from "../../lib/api";
import { useCurrency } from "../../lib/use-prefs";

/**
 * Currency- and locale-aware price for marketing product grids. Amounts are stored in the main
 * currency; this converts them to the visitor's chosen currency and formats them for their locale.
 *
 * These grids are server components, so on the server `money()` falls back to the main currency
 * (there is no `window`). `useCurrency()` re-reads the chosen currency after mount and keeps it in
 * sync — on toggle, on browser back/forward, and on bfcache restore — so the price never lags behind
 * the header toggle. `suppressHydrationWarning` tolerates the expected server (main currency) vs
 * client difference on first paint.
 */
export function Price({ cents, className }: { cents: number; className?: string }) {
  // Subscribe so the component re-renders when the currency changes; `money()` reads the live value.
  useCurrency();
  return (
    <span className={className} suppressHydrationWarning>
      {money(cents)}
    </span>
  );
}
