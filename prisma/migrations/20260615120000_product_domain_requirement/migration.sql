-- Per-product domain handling. Adds two columns to Product:
--   domainRequirement      – NECESSARY | OPTIONAL | NOT_NEEDED (drives the order form)
--   freeDomainBillingCycle – billing cycle from which a free domain is included (or NULL)
--
-- Written to be re-runnable on production MariaDB: ADD COLUMN IF NOT EXISTS is a MariaDB
-- extension, and the backfill UPDATEs only touch rows still at the default so re-running
-- never clobbers values an admin has since changed in the panel.

ALTER TABLE `Product` ADD COLUMN IF NOT EXISTS `domainRequirement` VARCHAR(191) NOT NULL DEFAULT 'NOT_NEEDED';
ALTER TABLE `Product` ADD COLUMN IF NOT EXISTS `freeDomainBillingCycle` VARCHAR(191) NULL;

-- Backfill existing products by type/category:
--   shared hosting → domain necessary (+ free domain on annual, matching previous behaviour)
--   virtual servers → domain optional
--   reseller packages → domain necessary
UPDATE `Product` SET `domainRequirement` = 'NECESSARY'
  WHERE `type` = 'SHARED_HOSTING' AND `domainRequirement` = 'NOT_NEEDED';

UPDATE `Product` SET `domainRequirement` = 'OPTIONAL'
  WHERE `type` = 'VPS' AND `domainRequirement` = 'NOT_NEEDED';

UPDATE `Product` SET `domainRequirement` = 'NECESSARY'
  WHERE `categoryId` = 'cat_reseller' AND `domainRequirement` = 'NOT_NEEDED';

UPDATE `Product` SET `freeDomainBillingCycle` = 'YEAR_1'
  WHERE `type` = 'SHARED_HOSTING' AND `freeDomainBillingCycle` IS NULL;
