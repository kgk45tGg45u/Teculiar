-- Phase 6.1 product addons: per-locale name/description maps + soft-delete flag.
-- Written to be re-runnable on production MariaDB (IF NOT EXISTS guards).

ALTER TABLE `AddOn` ADD COLUMN IF NOT EXISTS `nameTranslations` JSON NOT NULL DEFAULT ('{}');
ALTER TABLE `AddOn` ADD COLUMN IF NOT EXISTS `descriptionTranslations` JSON NOT NULL DEFAULT ('{}');
ALTER TABLE `AddOn` ADD COLUMN IF NOT EXISTS `active` BOOLEAN NOT NULL DEFAULT true;
