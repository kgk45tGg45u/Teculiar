import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Phase 3e — live render flip. A storefront route renders its published custom layout when one exists,
// else its built-in renderer. The signal is a non-null `publishedLayout` — NOT `Page.component`, which
// stays the physical route key the slug-routing middleware rewrites to (clobbering it 404s the page).
// The full publish→live→fallback loop is exercised against a running stack; these lock the contract.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const service = read("../../api/src/modules/customizer/customizer.service.ts");
const gate = read("../components/customizer/custom-page.tsx");
const aboutRoute = read("../app/[locale]/uber-uns/page.tsx");
const builderRoute = read("../app/admin/theme/customizer/[pageKey]/page.tsx");
const middleware = read("../middleware.ts");

test("the gate component exists and renders the published doc or falls back", () => {
  assert.ok(existsSync(new URL("../components/customizer/custom-page.tsx", import.meta.url)));
  assert.match(gate, /asLayoutDoc\(data\?\.publishedLayout\)/); // signal = a published layout doc
  assert.match(gate, /<LayoutRenderer/);
  assert.match(gate, /mode="live"/);
  assert.match(gate, /return <>\{children\}<\/>/); // fallback to the built-in renderer
  assert.doesNotMatch(gate, /=== "custom"/); // must NOT key off the component sentinel
});

test("service signals on publishedLayout and never overwrites component", () => {
  assert.doesNotMatch(service, /component: "custom"/); // publish + revert leave Page.component intact
  assert.match(service, /async storefrontPage/);
  assert.match(service, /mainLocale: layout \? \(await this\.billing\.i18nLanguages\(\)\)\.main : null/);
});

test("the About route gates its built-in renderer", () => {
  assert.match(aboutRoute, /<CustomPageGate locale=\{locale\} pageKey="uber-uns">/);
  assert.match(aboutRoute, /<AboutBuiltIn locale=\{locale\} \/>/);
  assert.match(aboutRoute, /async function AboutBuiltIn/); // built-in body extracted so it only runs on fallback
});

test("the builder route passes published state, not the component sentinel", () => {
  assert.match(builderRoute, /published=\{\(payload\?\.layoutVersion \?\? 0\) > 0\}/);
  assert.doesNotMatch(builderRoute, /component=\{/);
});

test("middleware still routes by Page.component (the route key the flip preserves)", () => {
  assert.match(middleware, /current\.component === rest \? \{ type: "pass" \} : \{ type: "rewrite", to: current\.component \}/);
});
