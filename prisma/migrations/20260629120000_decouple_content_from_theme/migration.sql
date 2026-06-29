-- Phase 3a (Teculiar roadmap) — decouple content from theme.
-- Content (Page, MenuItem, footer) becomes GLOBAL and theme-independent; a Theme is a
-- styling-only record. This drops the `themeId` FK columns from Page/MenuItem, moves the
-- per-theme footer JSON into SystemSetting "storefront.footer", and re-keys Page on `key`
-- alone. Switching the active theme now re-skins the same global content.
--
-- prod = MariaDB (runs via `prisma migrate deploy`); local dev = MySQL 8.3 + `prisma db push`.
-- Written idempotent with MariaDB's `IF [NOT] EXISTS` clauses so a re-run is a no-op.

-- ── Move footer content out of Theme into the global storefront.footer setting ──────────────
-- Copy the active theme's footer (admins may have edited it in prod) before dropping the column.
-- No-op if the setting already exists or no theme carries a footer. The id is a fixed literal
-- (Prisma applies @default(cuid()) at the app layer; a stable string is fine for a manual row).
INSERT INTO `SystemSetting` (`id`, `key`, `value`, `updatedAt`)
SELECT 'storefront-footer', 'storefront.footer', `footer`, CURRENT_TIMESTAMP(3)
FROM `Theme`
WHERE `footer` IS NOT NULL
ORDER BY `active` DESC, `createdAt` ASC
LIMIT 1
ON DUPLICATE KEY UPDATE `id` = `SystemSetting`.`id`;

-- ── Page: drop themeId FK/column, re-key on `key` alone ─────────────────────────────────────
ALTER TABLE `Page` DROP FOREIGN KEY IF EXISTS `Page_themeId_fkey`;
ALTER TABLE `Page` DROP INDEX IF EXISTS `Page_themeId_key_key`;
ALTER TABLE `Page` DROP INDEX IF EXISTS `Page_themeId_fkey`;
ALTER TABLE `Page` DROP COLUMN IF EXISTS `themeId`;
ALTER TABLE `Page` ADD UNIQUE INDEX IF NOT EXISTS `Page_key_key`(`key`);

-- ── MenuItem: drop themeId FK/column, re-index on (menu, order) ──────────────────────────────
ALTER TABLE `MenuItem` DROP FOREIGN KEY IF EXISTS `MenuItem_themeId_fkey`;
ALTER TABLE `MenuItem` DROP INDEX IF EXISTS `MenuItem_themeId_menu_order_idx`;
ALTER TABLE `MenuItem` DROP COLUMN IF EXISTS `themeId`;
ALTER TABLE `MenuItem` ADD INDEX IF NOT EXISTS `MenuItem_menu_order_idx`(`menu`, `order`);

-- ── Theme: drop the now-global footer column ────────────────────────────────────────────────
ALTER TABLE `Theme` DROP COLUMN IF EXISTS `footer`;
