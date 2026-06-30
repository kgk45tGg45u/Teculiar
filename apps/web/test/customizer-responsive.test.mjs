import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Per-viewport (responsive) element settings — e.g. grid column counts that differ on desktop /
// tablet / mobile — plus the stable DndContext id that fixes the builder's SSR hydration mismatch.
// Rendering across viewports is exercised with Playwright; these lock the contract.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const json = (rel) => JSON.parse(read(rel));

const responsive = read("../lib/customizer/responsive.ts");
const responsiveCss = read("../lib/customizer/registry/responsive.module.css");
const feature = read("../lib/customizer/registry/feature.tsx");
const product = read("../lib/customizer/registry/product.tsx");
const editModal = read("../components/admin/customizer/edit-modal.tsx");
const builder = read("../components/admin/customizer/builder.tsx");
const types = read("../lib/customizer/registry/types.ts");
const enAdmin = json("../../../packages/locales/en/admin.json");
const deAdmin = json("../../../packages/locales/de/admin.json");

test("builder gives DndContext a stable id (kills the SSR hydration mismatch)", () => {
  assert.match(builder, /id="customizer-builder"/);
});

test("responsive helper + CSS drive per-viewport column counts via CSS vars", () => {
  assert.ok(existsSync(new URL("../lib/customizer/responsive.ts", import.meta.url)));
  assert.match(responsive, /export type ResponsiveNumber = \{ base: number; md: number \| null; sm: number \| null \}/);
  assert.match(responsive, /export function responsiveProp/);
  assert.match(responsive, /export function gridColumnsVars/);
  assert.match(responsiveCss, /repeat\(var\(--cols/);
  assert.match(responsiveCss, /@media \(max-width: 1024px\)/); // tablet
  assert.match(responsiveCss, /@media \(max-width: 640px\)/); // mobile
});

test("PropField separates a single number from a responsive number", () => {
  assert.match(types, /\{ key: string; type: "number" \}/);
  assert.match(types, /\{ key: string; type: "responsiveNumber" \}/);
});

test("feature grid + product grid expose responsive columns", () => {
  assert.match(feature, /key: "columns", type: "responsiveNumber"/);
  assert.match(feature, /gridColumnsVars\(cols\)/);
  assert.match(product, /key: "columns", type: "responsiveNumber"/);
  assert.match(product, /gridColumnsVars\(cols\)/);
});

test("edit modal renders a desktop/tablet/mobile control for responsive props", () => {
  assert.match(editModal, /function ResponsiveInput/);
  assert.match(editModal, /t\.viewports\.desktop/);
  assert.match(editModal, /t\.viewports\.tablet/);
  assert.match(editModal, /t\.viewports\.mobile/);
});

test("packs carry viewport + prop labels (en + de)", () => {
  assert.deepEqual(Object.keys(enAdmin.customizer.viewports).sort(), ["desktop", "mobile", "tablet"]);
  assert.deepEqual(Object.keys(enAdmin.customizer.viewports).sort(), Object.keys(deAdmin.customizer.viewports).sort());
  assert.deepEqual(Object.keys(enAdmin.customizer.props).sort(), Object.keys(deAdmin.customizer.props).sort());
  for (const key of ["category", "columns"]) {
    assert.ok(enAdmin.customizer.props[key] && deAdmin.customizer.props[key], `prop label missing: ${key}`);
  }
});
