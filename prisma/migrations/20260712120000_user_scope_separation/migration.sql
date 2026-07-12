-- User.scope — admin (STAFF) and client (CLIENT) portals become fully separate auth worlds.
-- Email is unique PER SCOPE, so the same address can hold an independent staff account and
-- an independent client account. Existing users with a staff role are backfilled to STAFF.
--
-- Written to be re-runnable on production MariaDB (IF [NOT] EXISTS guards).

ALTER TABLE `User` ADD COLUMN IF NOT EXISTS `scope` ENUM('CLIENT', 'STAFF') NOT NULL DEFAULT 'CLIENT';

UPDATE `User` SET `scope` = 'STAFF'
WHERE `id` IN (
  SELECT `ur`.`userId` FROM `UserRole` `ur`
  JOIN `Role` `r` ON `r`.`id` = `ur`.`roleId`
  WHERE `r`.`slug` IN ('admin', 'super_admin', 'support_agent', 'sales_agent')
);

ALTER TABLE `User` DROP INDEX IF EXISTS `User_email_key`;
CREATE UNIQUE INDEX IF NOT EXISTS `User_email_scope_key` ON `User`(`email`, `scope`);
