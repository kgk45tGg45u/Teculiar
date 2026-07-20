-- Phase 7.1 product catalog i18n: per-locale name/description maps on products + categories.
-- Written to be re-runnable on production MariaDB (IF NOT EXISTS guards).

ALTER TABLE `Product` ADD COLUMN IF NOT EXISTS `nameTranslations` JSON NOT NULL DEFAULT ('{}');
ALTER TABLE `Product` ADD COLUMN IF NOT EXISTS `descriptionTranslations` JSON NOT NULL DEFAULT ('{}');
ALTER TABLE `ProductCategory` ADD COLUMN IF NOT EXISTS `nameTranslations` JSON NOT NULL DEFAULT ('{}');
ALTER TABLE `ProductCategory` ADD COLUMN IF NOT EXISTS `descriptionTranslations` JSON NOT NULL DEFAULT ('{}');
