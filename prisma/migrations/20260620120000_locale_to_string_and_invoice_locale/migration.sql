-- Phase 1 i18n/currency: free the locale columns from the de/en `Locale` enum so admin-added
-- languages can be stored, and freeze each invoice's language with a captured Invoice.locale.
--
-- prod = MariaDB (this file runs via `prisma migrate deploy`); local dev = MySQL 8.3 and syncs
-- with `prisma db push` instead. The ENUM->VARCHAR MODIFYs are engine-portable and naturally
-- idempotent (re-applying the same type is a no-op). The new column uses ADD COLUMN IF NOT EXISTS
-- (MariaDB) so a re-run is safe.
--
-- Announcement.locale and Translation.targetLocale stay on the `Locale` enum on purpose — blog /
-- announcement content is still de/en (deferred to a later phase).

-- User.locale: ENUM('de','en') -> VARCHAR. Existing 'de'/'en' values carry over unchanged.
ALTER TABLE `User`          MODIFY COLUMN `locale` VARCHAR(191) NOT NULL DEFAULT 'de';

-- Content.locale: ENUM -> VARCHAR (always set explicitly on create, so no default).
ALTER TABLE `Content`       MODIFY COLUMN `locale` VARCHAR(191) NOT NULL;

-- EmailTemplate.locale: ENUM -> VARCHAR so per-locale overrides exist for any language.
ALTER TABLE `EmailTemplate` MODIFY COLUMN `locale` VARCHAR(191) NOT NULL;

-- Invoice.locale: new, captured at creation to freeze the invoice's language. Existing invoices
-- were all issued in German, so the 'de' default backfills them correctly.
ALTER TABLE `Invoice`
    ADD COLUMN IF NOT EXISTS `locale` VARCHAR(191) NOT NULL DEFAULT 'de';
