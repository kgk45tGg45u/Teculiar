import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const i18n = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/layout/site-header.tsx", import.meta.url), "utf8");
const menuLink = readFileSync(new URL("../components/layout/menu-link.tsx", import.meta.url), "utf8");

test("locale preference has one shared cookie used by public and portals", () => {
  assert.match(i18n, /LOCALE_COOKIE/);
  assert.match(i18n, /dezhost_locale/);
  assert.match(middleware, /LOCALE_COOKIE/);
  assert.match(api, /LOCALE_COOKIE/);
});

test("middleware chooses saved locale before browser locale and keeps public prefixes", () => {
  assert.match(middleware, /request\.cookies\.get\(LOCALE_COOKIE\)/);
  assert.match(middleware, /accept-language/);
  assert.match(middleware, /url\.pathname = `\/\$\{locale\}/);
});

test("format helpers accept locale and use USD display for English", () => {
  assert.match(api, /export function money\(cents: number, currency = "EUR", locale/);
  assert.match(api, /displayCurrencyForLocale/);
  assert.match(api, /locale === "en" \? "USD" : currency/);
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
