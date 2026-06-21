import type { TaxContext } from "./domain";

// EU member states (seller is always DE). Used for reverse-charge and export rules.
export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
]);

// German standard VAT — the ultimate fallback when neither the buyer's country nor the
// configured default country carries a rate.
export const DEFAULT_VAT_PERCENT = 19;

export type TaxCountryConfig = {
  // Global VAT switch. When false, no VAT is charged anywhere regardless of the country rates.
  enabled: boolean;
  // ISO country code whose rate applies to buyers from any country without its own entry.
  default: string;
  // VAT percentage per uppercase ISO country code.
  rates: Record<string, number>;
};

export const DEFAULT_TAX_COUNTRY_CONFIG: TaxCountryConfig = {
  enabled: true,
  default: "DE",
  rates: { DE: DEFAULT_VAT_PERCENT }
};

// The VAT percentage for a buyer country: its own rate, else the configured default country's
// rate, else the German standard rate. A country with no rate falls back to the main country's
// VAT — never silently to 0 (the bug that hid VAT on checkout).
export function vatPercentForCountry(config: TaxCountryConfig, country?: string | null): number {
  const rates = config.rates ?? {};
  const code = (country ?? "").toUpperCase();
  if (code && typeof rates[code] === "number") {
    return rates[code];
  }
  const fallback = (config.default ?? "").toUpperCase();
  if (fallback && typeof rates[fallback] === "number") {
    return rates[fallback];
  }
  return DEFAULT_VAT_PERCENT;
}

export type VatResolution = { rate: number; reverseCharge: boolean; reason: string };

// Single source of truth for the VAT a buyer pays — used by the API (invoice/order creation)
// and the web checkout estimate alike. Resolves the country rate from `config`, then applies
// EU reverse-charge and non-EU export rules on top.
export function resolveVat(context: TaxContext, config: TaxCountryConfig): VatResolution {
  // Global kill-switch: VAT charging turned off in admin settings.
  if (!config.enabled) {
    return { rate: 0, reverseCharge: false, reason: "VAT disabled" };
  }
  const seller = (context.sellerCountryCode ?? "DE").toUpperCase();
  // Treat a missing buyer country as the default country so checkout never falls through to the
  // non-EU export branch before a country is chosen.
  const buyer = (context.buyerCountryCode || config.default || seller).toUpperCase();
  const rate = vatPercentForCountry(config, buyer);

  // EU B2B cross-border with a valid VAT ID → reverse charge (buyer self-accounts), 0% here.
  if (buyer !== seller && EU_COUNTRIES.has(buyer) && context.isBusinessCustomer && context.buyerVatId) {
    return { rate: 0, reverseCharge: true, reason: "EU reverse charge" };
  }

  // Exports outside the EU carry no German VAT.
  if (!EU_COUNTRIES.has(buyer)) {
    return { rate: 0, reverseCharge: false, reason: "Non-EU export" };
  }

  return { rate, reverseCharge: false, reason: rate > 0 ? "VAT" : "No VAT" };
}

// Normalizes an untrusted `tax.countries` setting (admin input or legacy data) into a usable
// config. Defaults the country to DE and drops non-numeric/negative rates. Always keeps a rate
// for the default country so `vatPercentForCountry` has a real fallback.
export function sanitizeTaxCountryConfig(input: {
  enabled?: unknown;
  default?: unknown;
  rates?: unknown;
}): TaxCountryConfig {
  // Default to enabled for legacy configs that predate the global switch.
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const def = typeof input.default === "string" && input.default ? input.default.toUpperCase() : "DE";
  const ratesIn = input.rates && typeof input.rates === "object" ? (input.rates as Record<string, unknown>) : {};
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(ratesIn)) {
    const key = code.toUpperCase();
    const rate = Number(value);
    if (key && Number.isFinite(rate) && rate >= 0) {
      rates[key] = rate;
    }
  }
  if (typeof rates[def] !== "number") {
    rates[def] = DEFAULT_VAT_PERCENT;
  }
  return { enabled, default: def, rates };
}
