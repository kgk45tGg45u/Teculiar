import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isLocaleCode } from "./supported-locales";

// Widened from literal unions to plain strings so buyers can add arbitrary language packs
// and currencies. Allowed values are validated at runtime against the configured packs
// (SUPPORTED_LOCALES) / currency config rather than at the type level.
export type Locale = string;
export type Currency = string;

// Typed config shapes for the modular language/currency settings (Admin > Settings).
export type Language = {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  bcp47: string;
  isMain: boolean;
};

export type CurrencyDef = {
  code: string;
  symbol: string;
  decimals: number;
};

export const locales: Locale[] = SUPPORTED_LOCALES;
export const currencies: Currency[] = ["EUR", "USD"];
// Locale is scoped like the auth tokens: the admin panel keeps its own language separate from the
// client/storefront one, so a dual-account admin can run each account in a different language.
export const LOCALE_COOKIE = "dezhost_locale";
export const ADMIN_LOCALE_COOKIE = "dezhost_admin_locale";
export const CURRENCY_COOKIE = "dezhost_currency";

export const localeNames: Record<string, string> = {
  de: "Deutsch",
  en: "English"
};

export const localeFlags: Record<string, string> = {
  de: "🇩🇪",
  en: "🇺🇸"
};

export const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$"
};

// Resolve a saved/cookie/path locale, accepting any well-formed code (incl. admin-added
// languages) and defaulting to the main language. Unknown codes render with English fallback.
export function getLocale(value?: string | null): Locale {
  return isLocaleCode(value) ? value!.toLowerCase() : DEFAULT_LOCALE;
}

// Map a browser language tag (e.g. "en-US") to the best supported locale, else the default.
export function browserLocale(value?: string | null): Locale {
  const lower = value?.toLowerCase() ?? "";
  return SUPPORTED_LOCALES.find((locale) => lower.startsWith(locale)) ?? DEFAULT_LOCALE;
}

export function localeFromAcceptLanguage(value?: string | null): Locale {
  const first = value?.split(",").map((part) => part.trim()).filter(Boolean)[0];
  return browserLocale(first);
}
