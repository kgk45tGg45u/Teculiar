-- Product.featured — the data-driven "popular/beliebt" badge flag. Admins mark which
-- product card is highlighted on storefront grids (home hosting packages, reseller,
-- customizer productGrid) instead of the old hardcoded card-index heuristics.
--
-- Written to be re-runnable on production MariaDB (ADD COLUMN IF NOT EXISTS).

ALTER TABLE `Product` ADD COLUMN IF NOT EXISTS `featured` BOOLEAN NOT NULL DEFAULT false;
