-- Phase 6.2 product-first provisioning module: the product's own provisioningModule now wins over
-- its category's. Backfill every categorized product that has no own module so behavior is
-- unchanged after the flip:
--   * category has a module        -> copy it onto the product
--   * category module NULL/empty   -> 'none' (old code treated a categorized product with an
--                                    unset category module as MANUAL provisioning; 'none' is the
--                                    explicit manual marker in the new chain)
-- Uncategorized products stay NULL (old and new code both resolve them to the type default).
-- Re-runnable: only touches rows whose provisioningModule is still NULL/empty.

UPDATE `Product` `p`
JOIN `ProductCategory` `c` ON `c`.`id` = `p`.`categoryId`
SET `p`.`provisioningModule` = COALESCE(NULLIF(`c`.`provisioningModule`, ''), 'none')
WHERE (`p`.`provisioningModule` IS NULL OR `p`.`provisioningModule` = '');
