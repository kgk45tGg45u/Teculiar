"use client";

import { useEffect, useState } from "react";
import { money } from "../../lib/api";

/**
 * Currency- and locale-aware price for marketing product grids. Amounts are stored in the main
 * currency; this converts them to the visitor's chosen currency and formats them for their locale.
 *
 * These grids are server components, so on the server `money()` falls back to the main currency
 * (there is no `window`). Rendering the amount through this client component — plus a one-shot
 * re-render after mount — applies the visitor's chosen currency on first paint, and the
 * language/currency toggle's `router.refresh()` re-renders it so toggling updates the price live.
 * `suppressHydrationWarning` tolerates the expected server (main currency) vs client difference.
 */
export function Price({ cents, className }: { cents: number; className?: string }) {
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <span className={className} suppressHydrationWarning>
      {money(cents)}
    </span>
  );
}
