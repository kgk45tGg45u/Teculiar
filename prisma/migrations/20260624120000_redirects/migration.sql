-- Phase 2 follow-up (Teculiar roadmap) — admin-managed URL redirects.
-- Replaces hard-coded redirects with a DB-backed table the storefront middleware consults:
-- an incoming request whose path equals `fromPath` is 301/302'd to `toPath` (internal path or
-- absolute URL). `permanent` picks 301 (true) vs 302 (false).
--
-- prod = MariaDB (`prisma migrate deploy`); local dev = MySQL 8.3 + `prisma db push`.
-- Brand-new table, written idempotent: CREATE TABLE IF NOT EXISTS so a re-run is a no-op.

CREATE TABLE IF NOT EXISTS `Redirect` (
    `id`        VARCHAR(191) NOT NULL,
    `fromPath`  VARCHAR(191) NOT NULL,
    `toPath`    VARCHAR(191) NOT NULL,
    `permanent` BOOLEAN      NOT NULL DEFAULT true,
    `enabled`   BOOLEAN      NOT NULL DEFAULT true,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Redirect_fromPath_key`(`fromPath`),
    INDEX `Redirect_enabled_idx`(`enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
