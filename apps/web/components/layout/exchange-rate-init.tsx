"use client";

import { useEffect } from "react";
import { initExchangeRate } from "../../lib/api";

export function ExchangeRateInit({ rate, bufferCents }: { rate: number; bufferCents: number }) {
  // Initialize synchronously so money() calls in sibling client components get the right rate
  initExchangeRate(rate, bufferCents);

  // Re-sync if the server values change (e.g. admin updates the rate and client refreshes)
  useEffect(() => {
    initExchangeRate(rate, bufferCents);
  }, [rate, bufferCents]);

  return null;
}
