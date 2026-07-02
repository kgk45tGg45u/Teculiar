import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Phase 3b — Customizer foundation: layout schema, API module, registry skeleton, LayoutRenderer.
// Static-source checks lock the contract (the full draft→publish→revert lifecycle is exercised
// separately against a running API); mirrors the style of theme-content-decoupling.test.mjs.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const schema = read("../../../prisma/schema.prisma");
const migration = read("../../../prisma/migrations/20260629130000_page_layout_docs/migration.sql");
const service = read("../../api/src/modules/customizer/customizer.service.ts");
const controller = read("../../api/src/modules/customizer/customizer.controller.ts");
const moduleFile = read("../../api/src/modules/customizer/customizer.module.ts");
const appModule = read("../../api/src/app.module.ts");
const cmsModule = read("../../api/src/modules/cms/cms.module.ts");
const types = read("../../../packages/web-core/src/lib/customizer/types.ts");
const registryIndex = read("../../../packages/web-core/src/lib/customizer/registry/index.ts");
const renderer = read("../../../packages/web-core/src/lib/customizer/layout-renderer.tsx");
const resolve = read("../../../packages/web-core/src/lib/customizer/resolve.ts");

test("Page carries versioned layout-doc storage + PageVersion snapshot model", () => {
  const page = schema.match(/model Page \{[\s\S]*?\n\}/)[0];
  for (const col of ["publishedLayout Json?", "draftLayout    Json?", "draftUpdatedAt DateTime?", "layoutVersion  Int           @default(0)"]) {
    assert.ok(page.includes(col), `Page missing column: ${col}`);
  }
  assert.match(schema, /model PageVersion \{[\s\S]*?@@unique\(\[pageId, version\]\)[\s\S]*?\}/);
});

test("migration adds layout columns (additive) + PageVersion table", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS `publishedLayout`/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS `draftLayout`/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS `layoutVersion`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `PageVersion`/);
  assert.match(migration, /UNIQUE INDEX `PageVersion_pageId_version_key`/);
});

test("Customizer service covers the full lifecycle + reuses DeepSeek/i18n", () => {
  for (const m of ["async getPage", "async saveDraft", "async publish", "async listVersions", "async revert", "async translate", "async storefrontPage"]) {
    assert.ok(service.includes(m), `service missing ${m}`);
  }
  assert.doesNotMatch(service, /component: "custom"/); // 3e: publish must NOT clobber the route key; publishedLayout is the signal
  assert.match(service, /pageVersion\.create/); // snapshots on publish + revert
  assert.match(service, /this\.ai\.callDeepseek/);
  assert.match(service, /this\.billing\.i18nLanguages\(\)/);
  assert.match(service, /this\.billing\.deepseekApiKey\(\)/);
  assert.match(service, /assertLayoutShape/); // coarse { schemaVersion, root[] } guard
  assert.match(service, /BadGatewayException/); // upstream translate failure → clean 502, not 500
});

test("Customizer controller: guarded admin routes + public storefront read", () => {
  assert.match(controller, /@UseGuards\(JwtAuthGuard, RolesGuard\)/);
  assert.match(controller, /@Roles\("admin", "super_admin"\)/);
  assert.match(controller, /@Controller\("admin\/dev\/customizer"\)/);
  assert.match(controller, /@Patch\(":pageId\/draft"\)/);
  assert.match(controller, /@Post\(":pageId\/publish"\)/);
  assert.match(controller, /@Post\(":pageId\/revert\/:version"\)/);
  // static "translate" route declared before ":pageId" so it isn't shadowed
  assert.ok(controller.indexOf('@Post("translate")') < controller.indexOf('@Get(":pageId")'), "translate route must precede :pageId");
  assert.match(controller, /@Controller\("storefront"\)[\s\S]*@Get\("page\/:key"\)/);
});

test("Customizer module wired into the app, reusing Billing + Cms", () => {
  assert.match(moduleFile, /imports: \[BillingModule, CmsModule\]/);
  assert.match(appModule, /CustomizerModule/);
  assert.match(cmsModule, /exports: \[CmsService, AiBlogService\]/); // AiBlogService now injectable elsewhere
});

test("layout doc types + guards exist", () => {
  assert.match(types, /export type LayoutDoc = \{ schemaVersion: number; root: Node\[\] \}/);
  assert.match(types, /export function isLayoutDoc/);
  assert.match(types, /export function emptyLayout/);
});

test("registry skeleton: lookup + at least one container and one atom", () => {
  assert.match(registryIndex, /export function getElementDef/);
  assert.match(registryIndex, /export function listElements/);
  assert.match(registryIndex, /sectionDef/);
  assert.match(registryIndex, /textBlockDef/);
});

test("renderer skips unknown types live, shows placeholder in preview; main-language fallback", () => {
  assert.match(renderer, /getElementDef/);
  assert.match(renderer, /mode === "preview"/);
  assert.match(renderer, /return null; \/\/ live: silently skip/);
  assert.match(resolve, /localized\(node\.text/); // authored text resolves with main-language fallback
});

test("Customizer builder route + page assets exist", () => {
  assert.ok(existsSync(new URL("../../../packages/web-core/src/lib/customizer/layout-renderer.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../../packages/web-core/src/lib/customizer/registry/section.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../../packages/web-core/src/lib/customizer/registry/text-block.tsx", import.meta.url)));
});
