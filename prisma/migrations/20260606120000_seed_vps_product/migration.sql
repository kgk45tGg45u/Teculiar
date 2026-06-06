-- Seed the "virtual-servers" product category and Cloud VPS Starter product.
-- Uses INSERT IGNORE so re-running on an already-seeded database is safe.

INSERT IGNORE INTO `ProductCategory` (`id`, `name`, `slug`, `description`, `active`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES ('cat_virtual_servers', 'Virtual Servers', 'virtual-servers', 'Cloud VPS products', 1, 10, NOW(), NOW());

INSERT IGNORE INTO `Product` (`id`, `name`, `type`, `slug`, `description`, `active`, `homepageVisible`, `categoryId`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES (
  'prod_vps_starter',
  'Cloud VPS Starter',
  'VPS',
  'cloud-vps-starter',
  '2 vCPU · 4 GB RAM · 40 GB NVMe SSD · 20 TB Traffic · Root-Zugang · DDoS-Schutz · German data centres.',
  1, 1,
  'cat_virtual_servers',
  1, NOW(), NOW()
);

INSERT IGNORE INTO `ProductPrice` (`id`, `productId`, `amountCents`, `setupFeeCents`, `billingCycle`, `currency`, `active`)
VALUES ('price_vps_starter_monthly', 'prod_vps_starter', 799, 0, 'MONTHLY', 'EUR', 1);

INSERT IGNORE INTO `ProductConfig` (`id`, `productId`, `key`, `label`, `values`, `required`)
VALUES
  ('cfg_vps1_cpu',  'prod_vps_starter', 'cpu',       'vCPU',                '"2"',              0),
  ('cfg_vps1_ram',  'prod_vps_starter', 'ram',       'RAM',                 '"4 GB"',           0),
  ('cfg_vps1_disk', 'prod_vps_starter', 'disk',      'Storage',             '"40 GB NVMe SSD"', 0),
  ('cfg_vps1_bw',   'prod_vps_starter', 'bandwidth', 'Bandwidth',           '"20 TB/month"',    0),
  ('cfg_vps1_loc',  'prod_vps_starter', 'location',  'Location',            '"Germany"',        0);
