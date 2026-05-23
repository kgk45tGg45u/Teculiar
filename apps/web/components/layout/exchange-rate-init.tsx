"use client";

import { initExchangeRate } from "../../lib/api";

export function ExchangeRateInit({ rate, bufferCents }: { rate: number; bufferCents: number }) {
  // Called synchronously during render so client money() calls get the right rate on first paint
  initExchangeRate(rate, bufferCents);
  return null;
}
