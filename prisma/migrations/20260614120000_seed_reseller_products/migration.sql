-- Seed the "reseller" product category and four Reseller Hosting packages so the
-- /reseller storefront page has orderable products. Uses INSERT IGNORE so re-running
-- on an already-seeded database (MariaDB in production) is safe and idempotent.

INSERT IGNORE INTO `ProductCategory` (`id`, `name`, `slug`, `description`, `active`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES ('cat_reseller', 'Reseller', 'reseller', 'White-label reseller hosting packages', 1, 20, NOW(), NOW());

-- ── Products (type MANAGED_SERVICE: ordered + invoiced, reseller account set up manually) ──
INSERT IGNORE INTO `Product` (`id`, `name`, `type`, `slug`, `description`, `active`, `homepageVisible`, `categoryId`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES
  ('prod_reseller_start', 'Reseller Start', 'MANAGED_SERVICE', 'reseller-start',
   '25 Kundenkonten · 25 GB NVMe · 1 vCPU · 1 GB RAM · cPanel & DirectAdmin · White-Label.',
   1, 1, 'cat_reseller', 1, NOW(), NOW()),
  ('prod_reseller_plus', 'Reseller Plus', 'MANAGED_SERVICE', 'reseller-plus',
   '50 Kundenkonten · 50 GB NVMe · 1,5 vCPU · 2 GB RAM · cPanel & DirectAdmin · White-Label.',
   1, 1, 'cat_reseller', 2, NOW(), NOW()),
  ('prod_reseller_pro', 'Reseller Pro', 'MANAGED_SERVICE', 'reseller-pro',
   '100 Kundenkonten · 100 GB NVMe · 2 vCPU · 4 GB RAM · cPanel & DirectAdmin · White-Label.',
   1, 1, 'cat_reseller', 3, NOW(), NOW()),
  ('prod_reseller_max', 'Reseller Max', 'MANAGED_SERVICE', 'reseller-max',
   '200 Kundenkonten · 200 GB NVMe · 4 vCPU · 8 GB RAM · cPanel & DirectAdmin · White-Label.',
   1, 1, 'cat_reseller', 4, NOW(), NOW());

-- ── Monthly prices ──
INSERT IGNORE INTO `ProductPrice` (`id`, `productId`, `amountCents`, `setupFeeCents`, `billingCycle`, `currency`, `active`)
VALUES
  ('price_reseller_start_monthly', 'prod_reseller_start',  499, 0, 'MONTHLY', 'EUR', 1),
  ('price_reseller_plus_monthly',  'prod_reseller_plus',   899, 0, 'MONTHLY', 'EUR', 1),
  ('price_reseller_pro_monthly',   'prod_reseller_pro',   1699, 0, 'MONTHLY', 'EUR', 1),
  ('price_reseller_max_monthly',   'prod_reseller_max',   3299, 0, 'MONTHLY', 'EUR', 1);

-- ── Per-package specs (shown on the reseller cards) ──
INSERT IGNORE INTO `ProductConfig` (`id`, `productId`, `key`, `label`, `values`, `required`)
VALUES
  ('cfg_rs_start_accounts', 'prod_reseller_start', 'accounts', 'Kundenkonten', '["25"]',            0),
  ('cfg_rs_start_disk',     'prod_reseller_start', 'disk',     'NVMe-Speicher', '["25 GB"]',         0),
  ('cfg_rs_start_cpu',      'prod_reseller_start', 'cpu',      'vCPU',          '["1"]',             0),
  ('cfg_rs_start_ram',      'prod_reseller_start', 'ram',      'RAM',           '["1 GB"]',          0),
  ('cfg_rs_start_bw',       'prod_reseller_start', 'bandwidth','Traffic',       '["Unbegrenzt"]',    0),

  ('cfg_rs_plus_accounts',  'prod_reseller_plus',  'accounts', 'Kundenkonten', '["50"]',            0),
  ('cfg_rs_plus_disk',      'prod_reseller_plus',  'disk',     'NVMe-Speicher', '["50 GB"]',         0),
  ('cfg_rs_plus_cpu',       'prod_reseller_plus',  'cpu',      'vCPU',          '["1,5"]',           0),
  ('cfg_rs_plus_ram',       'prod_reseller_plus',  'ram',      'RAM',           '["2 GB"]',          0),
  ('cfg_rs_plus_bw',        'prod_reseller_plus',  'bandwidth','Traffic',       '["Unbegrenzt"]',    0),

  ('cfg_rs_pro_accounts',   'prod_reseller_pro',   'accounts', 'Kundenkonten', '["100"]',           0),
  ('cfg_rs_pro_disk',       'prod_reseller_pro',   'disk',     'NVMe-Speicher', '["100 GB"]',        0),
  ('cfg_rs_pro_cpu',        'prod_reseller_pro',   'cpu',      'vCPU',          '["2"]',             0),
  ('cfg_rs_pro_ram',        'prod_reseller_pro',   'ram',      'RAM',           '["4 GB"]',          0),
  ('cfg_rs_pro_bw',         'prod_reseller_pro',   'bandwidth','Traffic',       '["Unbegrenzt"]',    0),

  ('cfg_rs_max_accounts',   'prod_reseller_max',   'accounts', 'Kundenkonten', '["200"]',           0),
  ('cfg_rs_max_disk',       'prod_reseller_max',   'disk',     'NVMe-Speicher', '["200 GB"]',        0),
  ('cfg_rs_max_cpu',        'prod_reseller_max',   'cpu',      'vCPU',          '["4"]',             0),
  ('cfg_rs_max_ram',        'prod_reseller_max',   'ram',      'RAM',           '["8 GB"]',          0),
  ('cfg_rs_max_bw',         'prod_reseller_max',   'bandwidth','Traffic',       '["Unbegrenzt"]',    0);
