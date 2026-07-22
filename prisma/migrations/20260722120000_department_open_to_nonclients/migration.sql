-- Phase 7.3 sales-vs-support routing: departments flag whether they accept mail from
-- unknown (non-client) senders. Sales = open (auto guest contact); support = clients-only.
-- Re-runnable on production MariaDB (IF NOT EXISTS guard).

ALTER TABLE `Department` ADD COLUMN IF NOT EXISTS `openToNonClients` BOOLEAN NOT NULL DEFAULT false;

-- Seed the sales department as open so existing installs keep auto-creating guest contacts
-- for sales enquiries; support stays clients-only by default.
UPDATE `Department` SET `openToNonClients` = true WHERE `slug` = 'sales';
