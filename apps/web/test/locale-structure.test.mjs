import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const i18n = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const usePrefs = readFileSync(new URL("../lib/use-prefs.ts", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/layout/site-header.tsx", import.meta.url), "utf8");
const menuLink = readFileSync(new URL("../components/layout/menu-link.tsx", import.meta.url), "utf8");

test("locale preference is scoped per admin/client like the auth tokens", () => {
  // The client/public scope keeps dezhost_locale; the admin panel has its own cookie so the two
  // scopes don't share a language (a dual-account admin can run each account in a different one).
  assert.match(i18n, /LOCALE_COOKIE = "dezhost_locale"/);
  assert.match(i18n, /ADMIN_LOCALE_COOKIE = "dezhost_admin_locale"/);
  // currentLocale/storeLocale/persistClientLocale resolve the cookie by scope.
  assert.match(api, /localeCookieForScope/);
  assert.match(api, /ADMIN_LOCALE_COOKIE/);
});

test("currency preference is scoped per admin/client too, and read reactively", () => {
  // Currency mirrors the locale scoping so changing it in /admin never leaks to the public site.
  assert.match(i18n, /CURRENCY_COOKIE = "dezhost_currency"/);
  assert.match(i18n, /ADMIN_CURRENCY_COOKIE = "dezhost_admin_currency"/);
  assert.match(api, /currencyCookieForScope/);
  // storeCurrency/storeLocale broadcast a change so live consumers (toggle, <Price>) re-read instead
  // of showing a stale snapshot; the hook also re-reads on bfcache restore / back-forward.
  assert.match(api, /PREFS_CHANGED_EVENT/);
  assert.match(usePrefs, /pageshow/);
  assert.match(usePrefs, /popstate/);
});

test("middleware chooses saved locale before browser locale and keeps public prefixes", () => {
  assert.match(middleware, /request\.cookies\.get\(LOCALE_COOKIE\)/);
  assert.match(middleware, /accept-language/);
  assert.match(middleware, /url\.pathname = `\/\$\{locale\}/);
});

test("money() converts the main-currency amount to the chosen display currency for the locale", () => {
  assert.match(api, /export function money\(cents: number, _currency = _currencyConfig\.main, locale/);
  assert.match(api, /const target = currentCurrency\(\)/);
  assert.match(api, /convert\(cents, target\)/);
  assert.match(api, /export function cycleLabel\(cycle: string, locale/);
});

test("public header exposes language toggle", () => {
  assert.match(header, /LanguageToggle/);
  assert.match(header, /locale=\{locale\}/);
});

test("header menu links close ancestor details after navigation clicks", () => {
  assert.match(header, /MenuLink/);
  assert.match(menuLink, /HTMLDetailsElement/);
  assert.match(menuLink, /element\.open = false/);
  assert.match(menuLink, /event\.defaultPrevented/);
});
