// Catalogs for the Admin > Settings typeaheads (add a language pack / add a currency) and for
// rendering configured languages/currencies in the toggle. Names come from Intl.DisplayNames
// (mirroring lib/countries.ts); symbols come from Intl.NumberFormat parts.
import { localeFlags, localeNames } from "./i18n";

// Common BCP-47 language subtags offered in the "add a new language pack" typeahead.
const LANGUAGE_CODES =
  "en,de,fr,es,it,nl,pt,pl,ru,uk,tr,ar,he,fa,zh,ja,ko,hi,th,vi,id,ms,sv,da,nb,fi,cs,sk,sl,hr,sr,bg,ro,hu,el,et,lv,lt,ca,gl,eu".split(",");

// Best-effort representative flag per language; falls back to the configured locale flag, then a globe.
const LANGUAGE_FLAGS: Record<string, string> = {
  en: "🇺🇸", de: "🇩🇪", fr: "🇫🇷", es: "🇪🇸", it: "🇮🇹", nl: "🇳🇱", pt: "🇵🇹", pl: "🇵🇱", ru: "🇷🇺", uk: "🇺🇦",
  tr: "🇹🇷", ar: "🇸🇦", he: "🇮🇱", fa: "🇮🇷", zh: "🇨🇳", ja: "🇯🇵", ko: "🇰🇷", hi: "🇮🇳", th: "🇹🇭", vi: "🇻🇳",
  id: "🇮🇩", ms: "🇲🇾", sv: "🇸🇪", da: "🇩🇰", nb: "🇳🇴", fi: "🇫🇮", cs: "🇨🇿", sk: "🇸🇰", sl: "🇸🇮", hr: "🇭🇷",
  sr: "🇷🇸", bg: "🇧🇬", ro: "🇷🇴", hu: "🇭🇺", el: "🇬🇷", et: "🇪🇪", lv: "🇱🇻", lt: "🇱🇹", ca: "🇪🇸", gl: "🇪🇸", eu: "🇪🇸"
};

export function languageFlag(code: string): string {
  return LANGUAGE_FLAGS[code] ?? localeFlags[code] ?? "🌐";
}

export function languageName(code: string, displayLocale = "en"): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(code) ?? localeNames[code] ?? code;
  } catch {
    return localeNames[code] ?? code;
  }
}

export function languageNativeName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? localeNames[code] ?? code;
  } catch {
    return localeNames[code] ?? code;
  }
}

export type LanguageOption = { code: string; name: string; nativeName: string; flag: string };

export function languageCatalog(displayLocale = "en"): LanguageOption[] {
  return LANGUAGE_CODES.map((code) => ({
    code,
    name: languageName(code, displayLocale),
    nativeName: languageNativeName(code),
    flag: languageFlag(code)
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// Common ISO-4217 currency codes offered in the "add new currency" typeahead.
const CURRENCY_CODES =
  "EUR,USD,GBP,CHF,SEK,NOK,DKK,PLN,CZK,HUF,RON,BGN,HRK,ISK,TRY,RUB,UAH,CAD,AUD,NZD,JPY,CNY,HKD,TWD,SGD,KRW,INR,IDR,MYR,THB,PHP,VND,AED,SAR,QAR,ILS,ZAR,BRL,MXN,ARS,CLP,COP".split(",");

const CURRENCY_SYMBOLS_FALLBACK: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF" };

export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? CURRENCY_SYMBOLS_FALLBACK[code] ?? code;
  } catch {
    return CURRENCY_SYMBOLS_FALLBACK[code] ?? code;
  }
}

export function currencyName(code: string, displayLocale = "en"): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type CurrencyOption = { code: string; name: string; symbol: string };

export function currencyCatalog(displayLocale = "en"): CurrencyOption[] {
  return CURRENCY_CODES.map((code) => ({ code, name: currencyName(code, displayLocale), symbol: currencySymbol(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
