"use client";

import { useEffect } from "react";
import { initCurrencyConfig, type CurrencyConfig } from "../../lib/api";

/**
 * Injects the server-resolved currency config (main currency, enabled currencies, per-currency
 * rate + buffer) into the client so money() in sibling client components converts correctly.
 * Replaces the old USD-only ExchangeRateInit.
 */
export function CurrencyConfigInit({ config }: { config: CurrencyConfig }) {
  // Initialize synchronously so money() calls during the same render get the right config.
  initCurrencyConfig(config);

  // Re-sync if the server config changes (e.g. admin updates a rate and the client refreshes).
  useEffect(() => {
    initCurrencyConfig(config);
  }, [JSON.stringify(config)]);

  return null;
}
