// Single source of truth for which locales the site serves, derived from the shared
// language-pack manifest so middleware, the sitemap and the toggle never drift apart.
// Imports only the tiny manifest.json (not the full pack bundle), so it stays edge-safe
// for use inside middleware.
import manifest from "@dezhost/locales/manifest.json";

export const SUPPORTED_LOCALES: string[] = manifest.languages;

// Build-time default for edge code (middleware) that cannot read the database. The runtime
// main language (Admin > Settings) is the authority for server components; this is only the
// fallback when no locale can be resolved. manifest.languages is primary-first.
export const DEFAULT_LOCALE: string = manifest.languages[0] ?? "de";

// A regex matching a leading "/<locale>" path segment, built from the supported list so
// there is no hard-coded /(de|en)/ to keep in sync.
export const LOCALE_PATH_PREFIX = new RegExp(`^/(${SUPPORTED_LOCALES.join("|")})(?=/|$)`);
