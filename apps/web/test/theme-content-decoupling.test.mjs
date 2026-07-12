import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Phase 3a — content/theme decoupling. Content (Page, MenuItem, footer) is global and
// theme-independent; a Theme is a styling-only record. These static-source checks lock the
// contract (the repo has no DB in unit tests), mirroring the style of theme-seo-redirects.test.mjs.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const schema = read("../../../prisma/schema.prisma");
const repo = read("../../api/src/modules/theme/theme.repository.ts");
const service = read("../../api/src/modules/theme/theme.service.ts");
const seed = read("../../api/src/modules/theme/theme-seed.ts");
const migration = read("../../../prisma/migrations/20260629120000_decouple_content_from_theme/migration.sql");
const sidebar = read("../components/admin/admin-sidebar.tsx");

test("Prisma Page/MenuItem are global (no themeId); Theme is styling-only", () => {
  const page = schema.match(/model Page \{[\s\S]*?\n\}/)[0];
  const menuItem = schema.match(/model MenuItem \{[\s\S]*?\n\}/)[0];
  const theme = schema.match(/model Theme \{[\s\S]*?\n\}/)[0];

  assert.doesNotMatch(page, /themeId/, "Page must not carry themeId");
  assert.match(page, /key\s+String\s+@unique/, "Page.key is now globally unique");
  assert.doesNotMatch(menuItem, /themeId/, "MenuItem must not carry themeId");
  assert.match(menuItem, /@@index\(\[menu, order\]\)/, "MenuItem re-indexed on (menu, order)");
  assert.doesNotMatch(theme, /footer/, "footer moved out of Theme to a SystemSetting");
  assert.doesNotMatch(theme, /pages\s+Page\[\]|menuItems\s+MenuItem\[\]/, "Theme owns no content relations");
});

test("migration drops themeId FKs/columns and moves footer to the storefront.footer setting", () => {
  assert.match(migration, /storefront\.footer/);
  assert.match(migration, /Page` DROP FOREIGN KEY IF EXISTS `Page_themeId_fkey`/);
  assert.match(migration, /MenuItem` DROP FOREIGN KEY IF EXISTS `MenuItem_themeId_fkey`/);
  assert.match(migration, /Page` DROP COLUMN IF EXISTS `themeId`/);
  assert.match(migration, /MenuItem` DROP COLUMN IF EXISTS `themeId`/);
  assert.match(migration, /Theme` DROP COLUMN IF EXISTS `footer`/);
  assert.match(migration, /ADD UNIQUE INDEX IF NOT EXISTS `Page_key_key`/);
  assert.match(migration, /ADD INDEX IF NOT EXISTS `MenuItem_menu_order_idx`/);
});

test("repository reads/writes footer via the storefront.footer SystemSetting, seeds split", () => {
  assert.match(repo, /FOOTER_SETTING_KEY = "storefront\.footer"/);
  assert.match(repo, /async footer\(\)/);
  assert.match(repo, /systemSetting\.upsert/);
  assert.match(repo, /async ensureContentSeeded\(\)/);
  assert.match(repo, /async ensureStylingSeeded\(\)/);
  // global reads (no per-theme scoping)
  assert.match(repo, /this\.prisma\.page\.findMany\(\{ orderBy: \{ order: "asc" \} \}\)/);
  assert.doesNotMatch(repo, /pagesForTheme|menuItemsForTheme|themeId/);
});

test("service shapes storefront payload from global content + footer setting", () => {
  assert.match(service, /this\.repo\.footer\(\)/);
  assert.match(service, /this\.repo\.pages\(\)/);
  assert.match(service, /this\.repo\.menuItems\(\)/);
  assert.doesNotMatch(service, /\.themeId/, "no themeId scoping left in the service");
});

test("seed constants are theme-neutral (content is global)", () => {
  assert.match(seed, /export const CONTENT_PAGE_DEFS/);
  assert.match(seed, /export const MAIN_MENU/);
  assert.match(seed, /export const LEGAL_MENU/);
  assert.match(seed, /export const FOOTER_KEYS/);
  assert.doesNotMatch(seed, /BLUE_PAGE_DEFS|BLUE_MAIN_MENU|BLUE_LEGAL_MENU|BLUE_FOOTER_KEYS/);
});

test("Admin > Theme has no Blue child; the old route redirects", () => {
  assert.match(sidebar, /\{ href: "\/admin\/theme", label: c\.nav\.theme \}/);
  assert.doesNotMatch(sidebar, /\/admin\/theme\/blue/);
  assert.ok(existsSync(new URL("../app/admin/theme/page.tsx", import.meta.url)), "new /admin/theme page exists");
  const blue = read("../app/admin/theme/blue/page.tsx");
  // Phase 2.2: the redirect target is surface-aware (clean URLs on per-surface hosts).
  assert.match(blue, /redirect\(href\("\/admin\/theme"\)/);
});
