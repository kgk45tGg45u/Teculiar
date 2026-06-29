-- Phase 3b (Teculiar roadmap) — Customizer layout documents.
-- Adds the versioned JSON layout doc storage to the global Page (draft on Save, published on
-- Publish) plus a PageVersion snapshot table for rollback. All additive: existing pages keep their
-- built-in renderer until a layout is published (component flips to "custom") — nothing breaks.
--
-- prod = MariaDB (`prisma migrate deploy`); local dev = MySQL 8.3 + `prisma db push`.
-- Idempotent via MariaDB's `IF NOT EXISTS` clauses so a re-run is a no-op.

-- ── Page: layout doc columns ────────────────────────────────────────────────────────────────
ALTER TABLE `Page` ADD COLUMN IF NOT EXISTS `publishedLayout` JSON        NULL;
ALTER TABLE `Page` ADD COLUMN IF NOT EXISTS `draftLayout`     JSON        NULL;
ALTER TABLE `Page` ADD COLUMN IF NOT EXISTS `draftUpdatedAt`  DATETIME(3) NULL;
ALTER TABLE `Page` ADD COLUMN IF NOT EXISTS `layoutVersion`   INTEGER     NOT NULL DEFAULT 0;

-- ── PageVersion: published-layout snapshot history ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `PageVersion` (
    `id`          VARCHAR(191) NOT NULL,
    `pageId`      VARCHAR(191) NOT NULL,
    `version`     INTEGER      NOT NULL,
    `layout`      JSON         NOT NULL,
    `label`       VARCHAR(191) NULL,
    `publishedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedBy` VARCHAR(191) NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `PageVersion_pageId_version_key`(`pageId`, `version`),
    INDEX `PageVersion_pageId_version_idx`(`pageId`, `version`),
    CONSTRAINT `PageVersion_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `Page`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
