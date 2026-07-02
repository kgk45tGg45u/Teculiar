import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const themeLib = read("../../../packages/web-core/src/lib/storefront-theme.ts");
const sitemap = read("../../storefront/app/sitemap.xml/route.ts");
const middleware = read("../../storefront/middleware.ts");
const layout = read("../../storefront/app/[locale]/layout.tsx");
const cron = read("../../api/src/modules/cron/cron.service.ts");
const redirectsService = read("../../api/src/modules/redirects/redirects.service.ts");
const enAdmin = JSON.parse(read("../../../packages/locales/en/admin.json"));
const deAdmin = JSON.parse(read("../../../packages/locales/de/admin.json"));

test("storefront-theme exposes localized-slug + hreflang helpers", () => {
  assert.match(themeLib, /export function pageSlug/);
  assert.match(themeLib, /export function pagePath/);
  assert.match(themeLib, /export function storefrontAlternates/);
  // home page (empty main-language slug) resolves to the locale root, not the component name
  assert.match(themeLib, /page\.slug\[mainLocale\] === ""/);
  // single-language stores get no hreflang (mirrors the translate-UX ≥2 rule)
  assert.match(themeLib, /langs\.length < 2/);
  // x-default points at the main language
  assert.match(themeLib, /x-default/);
});

test("sitemap emits per-locale slugs with hreflang alternates and a theme fallback", () => {
  assert.match(sitemap, /\/storefront\/theme/);
  assert.match(sitemap, /pagePath\(/);
  assert.match(sitemap, /xhtml:link rel="alternate" hreflang=/);
  assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(sitemap, /x-default/);
  assert.match(sitemap, /FALLBACK_PATHS/); // still serves something if the theme can't be fetched
});

test("layout renders hreflang + canonical from the request path", () => {
  assert.match(layout, /storefrontAlternates/);
  assert.match(layout, /x-pathname/);
  assert.match(layout, /alternates/);
});

test("middleware reads admin-managed redirects and 301/302s them", () => {
  assert.match(middleware, /\/storefront\/redirects/);
  assert.match(middleware, /matchRedirect/);
  assert.match(middleware, /redirect\.permanent \? 301 : 302/);
  // visitor-facing path is exposed to server components for hreflang/canonical
  assert.match(middleware, /requestHeaders\.set\("x-pathname"/);
});

test("cron sitemap status mirrors the dynamic route's URL math", () => {
  assert.match(cron, /this\.theme\.storefrontTheme\(\)/);
  assert.match(cron, /SITEMAP_EXTRA_PATHS/);
  assert.match(cron, /SITEMAP_FALLBACK_PATHS/);
  assert.match(cron, /source: "dynamic-route"/);
});

test("redirects service validates from/to paths and blocks loops", () => {
  assert.match(redirectsService, /must start with "\/"/);
  assert.match(redirectsService, /https\?:\\\/\\\//); // absolute URL allowed for `to`
  assert.match(redirectsService, /can't point to itself/);
});

test("redirects admin pack keys exist in en + de", () => {
  for (const pack of [enAdmin, deAdmin]) {
    const tb = pack.themeBuilder;
    for (const key of ["tabRedirects", "redirectsHeading", "redirectsHint", "colFrom", "colTo", "colPermanent", "colEnabled", "addRedirect"]) {
      assert.ok(tb[key], `missing themeBuilder.${key}`);
    }
  }
});
