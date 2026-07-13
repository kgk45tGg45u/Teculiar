// @teculiar/locales — the canonical, shared language-pack bundle consumed by both
// apps/web and apps/api (and, later, by Teculiar buyer installs pulling from the CDN).
//
// English is the source-of-truth key set. Every other language falls back to English
// per key at runtime, so a partially translated pack never shows a blank string.
// Format rules (number/date/currency) live in each language's meta.json and fall back
// to en-GB — the most date-compatible neutral locale — when a rule is missing.

import manifest from "./manifest.json";

import enCommon from "./en/common.json";
import enAdmin from "./en/admin.json";
import enClient from "./en/client.json";
import enStorefront from "./en/storefront.json";
import enEmail from "./en/email.json";
import enInvoice from "./en/invoice.json";
import enMeta from "./en/meta.json";

import deCommon from "./de/common.json";
import deAdmin from "./de/admin.json";
import deClient from "./de/client.json";
import deStorefront from "./de/storefront.json";
import deEmail from "./de/email.json";
import deInvoice from "./de/invoice.json";
import deMeta from "./de/meta.json";

export type Namespace = "common" | "admin" | "client" | "storefront" | "email" | "invoice" | "meta";

export const NAMESPACES: Namespace[] = ["common", "admin", "client", "storefront", "email", "invoice", "meta"];

/** English is always the source-of-truth pack and the per-key fallback. */
export const SOURCE_LOCALE = "en";

export type LocaleMeta = {
  bcp47: string;
  numberFormat: string;
  dateFormat: string;
  defaultCurrency: string;
};

export type Manifest = {
  version: string;
  languages: string[];
  updatedAt: string;
};

type RawPack = Record<Namespace, Record<string, unknown>>;

const PACKS: Record<string, RawPack> = {
  en: { common: enCommon, admin: enAdmin, client: enClient, storefront: enStorefront, email: enEmail, invoice: enInvoice, meta: enMeta },
  de: { common: deCommon, admin: deAdmin, client: deClient, storefront: deStorefront, email: deEmail, invoice: deInvoice, meta: deMeta }
};

// The English bundle doubles as the static TypeScript shape, so consumers get
// autocomplete keyed off the source-of-truth pack.
const EN_BUNDLE = PACKS.en as RawPack;
export type Dictionary = {
  common: typeof enCommon;
  admin: typeof enAdmin;
  client: typeof enClient;
  storefront: typeof enStorefront;
  email: typeof enEmail;
  invoice: typeof enInvoice;
  meta: typeof enMeta;
};

/** Neutral fallback for missing format rules (most date-compatible). */
const META_FALLBACK: LocaleMeta = { bcp47: "en-GB", numberFormat: "en-GB", dateFormat: "en-GB", defaultCurrency: "EUR" };

export function getManifest(): Manifest {
  return manifest as Manifest;
}

/** Locale codes that ship with a built-in pack. */
export function availableLocales(): string[] {
  return Object.keys(PACKS);
}

export function hasPack(locale: string): boolean {
  return Object.prototype.hasOwnProperty.call(PACKS, locale);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merge `override` onto a copy of `base` (override wins; nested objects merge). */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T));
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? deepMerge(result[key], value)
      : value;
  }
  return result as T;
}

const dictionaryCache = new Map<string, Dictionary>();

/** A single namespace for a locale, with English merged underneath as a per-key fallback. */
export function loadNamespace<N extends Namespace>(locale: string, namespace: N): Dictionary[N] {
  return loadDictionary(locale)[namespace];
}

/** The full dictionary for a locale (English fallback baked in per key). Cached per locale. */
export function loadDictionary(locale: string): Dictionary {
  const cached = dictionaryCache.get(locale);
  if (cached) {
    return cached;
  }
  const localePack = PACKS[locale];
  const merged = {} as Dictionary;
  for (const ns of NAMESPACES) {
    (merged as Record<Namespace, unknown>)[ns] = localePack
      ? deepMerge(EN_BUNDLE[ns], localePack[ns])
      : EN_BUNDLE[ns];
  }
  dictionaryCache.set(locale, merged);
  return merged;
}

/**
 * Resolve a dotted key (e.g. "common.nav.hosting") for a locale, with English fallback.
 * Returns the key itself when missing even in English, so missing-key bugs are visible.
 */
export function t(locale: string, key: string): string {
  const parts = key.split(".");
  let node: unknown = loadDictionary(locale);
  for (const part of parts) {
    if (isPlainObject(node) && part in node) {
      node = node[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}

/** Format rules for a locale; each missing field falls back to en-GB. */
export function getMeta(locale: string): LocaleMeta {
  const raw = (PACKS[locale]?.meta ?? {}) as Partial<LocaleMeta>;
  return {
    bcp47: raw.bcp47 || META_FALLBACK.bcp47,
    numberFormat: raw.numberFormat || META_FALLBACK.numberFormat,
    dateFormat: raw.dateFormat || META_FALLBACK.dateFormat,
    defaultCurrency: raw.defaultCurrency || META_FALLBACK.defaultCurrency
  };
}
