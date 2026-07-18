import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Phase 3d — element registry population. The renderer/builder run through the registry, so static
// checks here lock the registered inventory + that each element reuses the storefront's styling
// (preview == live). Mirrors the style of customizer-foundation.test.mjs.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const json = (rel) => JSON.parse(read(rel));

const index = read("../../../packages/web-core/src/lib/customizer/registry/index.ts");
const pricing = read("../../../packages/web-core/src/lib/customizer/registry/pricing.tsx");
const hero = read("../../../packages/web-core/src/lib/customizer/registry/hero.tsx");
const feature = read("../../../packages/web-core/src/lib/customizer/registry/feature.tsx");
const steps = read("../../../packages/web-core/src/lib/customizer/registry/steps.tsx");
const cta = read("../../../packages/web-core/src/lib/customizer/registry/cta.tsx");
const faq = read("../../../packages/web-core/src/lib/customizer/registry/faq.tsx");
const atoms = read("../../../packages/web-core/src/lib/customizer/registry/atoms.tsx");
const product = read("../../../packages/web-core/src/lib/customizer/registry/product.tsx");
const palette = read("../components/admin/customizer/palette.tsx");
const enAdmin = json("../../../packages/locales/en/admin.json");
const deAdmin = json("../../../packages/locales/de/admin.json");

const DEF_NAMES = [
  "heroDef", "sectionDef", "featureGridDef", "stepsDef", "ctaDef", "faqDef", "pricingTableDef",
  "featureCardDef", "stepDef", "faqItemDef", "pricingPlanDef",
  "textBlockDef", "buttonDef", "badgeDef", "iconDef", "proseDef",
  "productGridDef", "priceTokenDef"
];

test("registry index registers the full element inventory", () => {
  for (const name of DEF_NAMES) {
    assert.ok(index.includes(name), `index missing ${name}`);
  }
  for (const file of ["hero.tsx", "feature.tsx", "steps.tsx", "cta.tsx", "faq.tsx", "atoms.tsx", "product.tsx", "faq.module.css"]) {
    assert.ok(existsSync(new URL(`../../../packages/web-core/src/lib/customizer/registry/${file}`, import.meta.url)), `missing ${file}`);
  }
});

test("all five element categories are represented", () => {
  const sources = [hero, feature, steps, cta, faq, atoms, product];
  for (const category of ["section", "card", "atom", "dynamic", "token"]) {
    assert.ok(sources.some((src) => src.includes(`category: "${category}"`)), `no element in category ${category}`);
  }
});

test("elements reuse storefront styling for live==preview parity", () => {
  assert.match(hero, /hero\.module\.css/);
  assert.match(feature, /platform-section\.module\.css/);
  assert.match(steps, /platform-section\.module\.css/);
  assert.match(cta, /platform-section\.module\.css/);
  assert.match(atoms, /components\/ui\/button|components\/ui\/badge/);
});

test("dynamic productGrid: category + responsive columns, fetches products live, placeholder in preview", () => {
  assert.match(product, /category: "dynamic"/);
  assert.match(product, /key: "category", type: "text"/);
  assert.match(product, /key: "columns", type: "responsiveNumber"/);
  assert.match(product, /storefront\/products\?category=/); // live data fetch by category
  assert.match(product, /mode === "preview"/);
});

test("containers declare accepted child types", () => {
  assert.match(feature, /accepts: \["featureCard"\]/);
  assert.match(steps, /accepts: \["step"\]/);
  assert.match(faq, /accepts: \["faqItem"\]/);
  assert.match(pricing, /accepts: \["pricingPlan"\]/);
});

test("pricingTable (Phase 4.2): authorable plans, locale-aware price, shared featured badge", () => {
  // Container + card pair, styled with the product-grid card CSS so preview == live.
  assert.match(pricing, /type: "pricingTable"/);
  assert.match(pricing, /type: "pricingPlan"/);
  assert.match(pricing, /product-grid\.module\.css/);
  // Price formatting goes through the shared locale-aware token formatter (like priceToken).
  assert.match(pricing, /formatToken\(\{ kind: "price"/);
  // Featured plans reuse the single shared badge (Phase 1.9) + card outline.
  assert.match(pricing, /PopularBadge/);
  assert.match(pricing, /featuredCardClass/);
  // Edit-modal keys stay within the labelled slot/prop vocabulary (no locale-pack drift).
  for (const key of ["title", "suffix", "body", "ctaLabel"]) {
    assert.ok(enAdmin.customizer.slots[key] && deAdmin.customizer.slots[key], `slot label missing: ${key}`);
  }
  for (const key of ["amountCents", "currency", "href", "variant", "columns"]) {
    assert.ok(enAdmin.customizer.props[key] && deAdmin.customizer.props[key], `prop label missing: ${key}`);
  }
});

test("palette groups by category; packs carry categories + slot labels (en + de)", () => {
  assert.match(palette, /listElements\(category\)/);
  assert.match(palette, /t\.categories\[category\]/);
  assert.deepEqual(Object.keys(enAdmin.customizer.categories).sort(), ["atom", "card", "dynamic", "section", "token"]);
  assert.deepEqual(Object.keys(enAdmin.customizer.categories).sort(), Object.keys(deAdmin.customizer.categories).sort());
  assert.deepEqual(Object.keys(enAdmin.customizer.slots).sort(), Object.keys(deAdmin.customizer.slots).sort());
  for (const slot of ["primaryCta", "question", "answer", "subtitle"]) {
    assert.ok(enAdmin.customizer.slots[slot] && deAdmin.customizer.slots[slot], `slot label missing: ${slot}`);
  }
});
