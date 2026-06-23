-- Phase 2 (Teculiar roadmap) — Theme foundation.
-- Introduces the Theme concept and makes the storefront's menus, pages and footer
-- data-driven. A theme bundles its pages, menu items and footer content; the current
-- storefront becomes the theme "blue". Per-locale text lives in JSON columns keyed by
-- locale code, e.g. {"en":"IT Solutions","de":"IT-Lösungen"}.
--
-- prod = MariaDB (runs via `prisma migrate deploy`); local dev = MySQL 8.3 + `prisma db push`.
-- Written idempotent: CREATE TABLE IF NOT EXISTS so a re-run is a no-op. These are brand-new
-- tables, so FK constraints live inside the CREATE (skipped wholesale on re-run).

-- ── Theme ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Theme` (
    `id`        VARCHAR(191) NOT NULL,
    `key`       VARCHAR(191) NOT NULL,
    `name`      VARCHAR(191) NOT NULL,
    `thumbnail` VARCHAR(191) NULL,
    `active`    BOOLEAN      NOT NULL DEFAULT false,
    `footer`    JSON         NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Theme_key_key`(`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Page ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Page` (
    `id`             VARCHAR(191) NOT NULL,
    `themeId`        VARCHAR(191) NOT NULL,
    `key`            VARCHAR(191) NOT NULL,
    `component`      VARCHAR(191) NOT NULL,
    `name`           JSON         NOT NULL,
    `slug`           JSON         NOT NULL,
    `seoTitle`       JSON         NULL,
    `seoDescription` JSON         NULL,
    `published`      BOOLEAN      NOT NULL DEFAULT true,
    `isSystem`       BOOLEAN      NOT NULL DEFAULT true,
    `order`          INTEGER      NOT NULL DEFAULT 0,
    `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Page_themeId_key_key`(`themeId`, `key`),
    INDEX `Page_themeId_fkey`(`themeId`),
    CONSTRAINT `Page_themeId_fkey` FOREIGN KEY (`themeId`) REFERENCES `Theme`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── MenuItem ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `MenuItem` (
    `id`          VARCHAR(191)          NOT NULL,
    `themeId`     VARCHAR(191)          NOT NULL,
    `menu`        ENUM('MAIN', 'LEGAL') NOT NULL,
    `parentId`    VARCHAR(191)          NULL,
    `pageId`      VARCHAR(191)          NULL,
    `externalUrl` VARCHAR(191)          NULL,
    `label`       JSON                  NOT NULL,
    `newTab`      BOOLEAN               NOT NULL DEFAULT false,
    `order`       INTEGER               NOT NULL DEFAULT 0,
    `createdAt`   DATETIME(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)           NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `MenuItem_themeId_menu_order_idx`(`themeId`, `menu`, `order`),
    INDEX `MenuItem_parentId_fkey`(`parentId`),
    INDEX `MenuItem_pageId_fkey`(`pageId`),
    CONSTRAINT `MenuItem_themeId_fkey`  FOREIGN KEY (`themeId`)  REFERENCES `Theme`(`id`)    ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT `MenuItem_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT `MenuItem_pageId_fkey`   FOREIGN KEY (`pageId`)   REFERENCES `Page`(`id`)     ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
