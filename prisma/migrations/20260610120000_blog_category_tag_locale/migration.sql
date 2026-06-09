-- Add locale field to BlogCategory and BlogTag.
-- Existing rows default to 'de'. Old single-column slug unique is replaced
-- with a compound (slug, locale) unique so the same slug can exist per locale.
--
-- Handles two production states:
--   A) Tables already exist with old slug @unique (most common) → ALTER to add locale
--   B) Tables don't exist yet at all → CREATE TABLE with correct schema from the start

-- ── BlogCategory ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `BlogCategory` (
    `id`        VARCHAR(191) NOT NULL,
    `name`      VARCHAR(191) NOT NULL,
    `slug`      VARCHAR(191) NOT NULL,
    `locale`    VARCHAR(191) NOT NULL DEFAULT 'de',
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `BlogCategory_slug_locale_key`(`slug`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- If the table already existed (CREATE TABLE was skipped) and is missing locale:
ALTER TABLE `BlogCategory`
    ADD COLUMN IF NOT EXISTS `locale` VARCHAR(191) NOT NULL DEFAULT 'de';

-- Swap the unique index from slug-only to (slug, locale).
-- Drop is a no-op if the index doesn't exist; MySQL ignores missing DROP with IF EXISTS.
ALTER TABLE `BlogCategory` DROP INDEX IF EXISTS `BlogCategory_slug_key`;

CREATE UNIQUE INDEX IF NOT EXISTS `BlogCategory_slug_locale_key`
    ON `BlogCategory`(`slug`, `locale`);

-- ── BlogTag ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `BlogTag` (
    `id`        VARCHAR(191) NOT NULL,
    `name`      VARCHAR(191) NOT NULL,
    `slug`      VARCHAR(191) NOT NULL,
    `locale`    VARCHAR(191) NOT NULL DEFAULT 'de',
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `BlogTag_slug_locale_key`(`slug`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BlogTag`
    ADD COLUMN IF NOT EXISTS `locale` VARCHAR(191) NOT NULL DEFAULT 'de';

ALTER TABLE `BlogTag` DROP INDEX IF EXISTS `BlogTag_slug_key`;

CREATE UNIQUE INDEX IF NOT EXISTS `BlogTag_slug_locale_key`
    ON `BlogTag`(`slug`, `locale`);

-- ── ContentCategory junction (if missing) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS `ContentCategory` (
    `contentId`  VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    PRIMARY KEY (`contentId`, `categoryId`),
    INDEX `ContentCategory_categoryId_fkey`(`categoryId`),
    CONSTRAINT `ContentCategory_contentId_fkey`  FOREIGN KEY (`contentId`)  REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ContentCategory_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `BlogCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── ContentTag junction (if missing) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `ContentTag` (
    `contentId` VARCHAR(191) NOT NULL,
    `tagId`     VARCHAR(191) NOT NULL,
    PRIMARY KEY (`contentId`, `tagId`),
    INDEX `ContentTag_tagId_fkey`(`tagId`),
    CONSTRAINT `ContentTag_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ContentTag_tagId_fkey`     FOREIGN KEY (`tagId`)     REFERENCES `BlogTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
