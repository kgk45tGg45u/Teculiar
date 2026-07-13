// Single source of truth for which locales the site serves, derived from the shared
// language-pack manifest so middleware, the sitemap and the toggle never drift apart.
// Imports only the tiny manifest.json (not the full pack bundle), so it stays edge-safe
// for use inside middleware.
import manifest from "@teculiar/locales/manifest.json";

export const SUPPORTED_LOCALES: string[] = manifest.languages;

// Build-time default for edge code (middleware) that cannot read the database. The runtime
// main language (Admin > Settings) is the authority for server components; this is only the
// fallback when no locale can be resolved. manifest.languages is primary-first.
export const DEFAULT_LOCALE: string = manifest.languages[0] ?? "de";

// A well-formed locale code: a 2-letter language subtag with an optional 2-letter region
// (e.g. "de", "it", "pt-br"). Routing accepts ANY such code, not just the shipped packs, so
// languages an admin adds at runtime (which the build-time manifest can't know about) still
// route to /<locale>/… instead of being treated as a non-locale path. Unknown-but-well-formed
// locales simply render with the English per-key fallback.
export const LOCALE_CODE_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export function isLocaleCode(value?: string | null): boolean {
  return Boolean(value && LOCALE_CODE_PATTERN.test(value));
}

// A regex matching a leading "/<locale>" path segment (any well-formed code), used by the
// toggle to swap the locale in the current path.
export const LOCALE_PATH_PREFIX = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i;
