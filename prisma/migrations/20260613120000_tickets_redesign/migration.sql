-- Tickets redesign: dynamic departments, staff avatars/guest flag, reduced
-- ticket statuses, invoice/system reply messages, and form-routing settings.
--
-- Written MariaDB-idempotent (IF [NOT] EXISTS / INSERT IGNORE) so it is safe
-- to (re)apply against the production MariaDB via `prisma migrate deploy`.

-- ── Department ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Department` (
    `id`        VARCHAR(191) NOT NULL,
    `slug`      VARCHAR(191) NOT NULL,
    `name`      VARCHAR(191) NOT NULL,
    `email`     VARCHAR(191) NULL,
    `color`     VARCHAR(191) NULL,
    `active`    BOOLEAN      NOT NULL DEFAULT TRUE,
    `isDefault` BOOLEAN      NOT NULL DEFAULT FALSE,
    `sortOrder` INTEGER      NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Department_slug_key`(`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed departments from the previous TicketDepartment enum values. Support is
-- the fallback/default department.
INSERT IGNORE INTO `Department` (`id`,`slug`,`name`,`email`,`active`,`isDefault`,`sortOrder`,`createdAt`,`updatedAt`) VALUES
    ('dept_sales',   'sales',   'Sales',   'sales@dezhost.com',   TRUE, FALSE, 0, NOW(3), NOW(3)),
    ('dept_support', 'support', 'Support', 'support@dezhost.com', TRUE, TRUE,  1, NOW(3), NOW(3)),
    ('dept_abuse',   'abuse',   'Abuse',   'abuse@dezhost.com',   TRUE, FALSE, 2, NOW(3), NOW(3));

-- ── DepartmentMember ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `DepartmentMember` (
    `id`           VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `userId`       VARCHAR(191) NOT NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `DepartmentMember_departmentId_userId_key`(`departmentId`, `userId`),
    INDEX `DepartmentMember_userId_idx`(`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── User: staff avatar + guest flag ───────────────────────────────────────────
ALTER TABLE `User`
    ADD COLUMN IF NOT EXISTS `avatarUrl` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `isGuest`   BOOLEAN NOT NULL DEFAULT FALSE;

-- Flag previously-created public/contact-form users as guests.
UPDATE `User` SET `isGuest` = TRUE WHERE `passwordHash` LIKE 'guest-inquiry-%';

-- ── Ticket: enum department -> Department relation ────────────────────────────
ALTER TABLE `Ticket` ADD COLUMN IF NOT EXISTS `departmentId` VARCHAR(191) NULL;

UPDATE `Ticket` SET `departmentId` = CASE `department`
        WHEN 'SALES'   THEN 'dept_sales'
        WHEN 'SUPPORT' THEN 'dept_support'
        WHEN 'ABUSE'   THEN 'dept_abuse'
        ELSE 'dept_support'
    END
    WHERE `departmentId` IS NULL;

ALTER TABLE `Ticket` MODIFY COLUMN `departmentId` VARCHAR(191) NOT NULL;
ALTER TABLE `Ticket` DROP COLUMN IF EXISTS `department`;

-- ── Ticket: remap removed statuses, then shrink the enum ──────────────────────
UPDATE `Ticket` SET `status` = 'OPEN'           WHERE `status` = 'NEW';
UPDATE `Ticket` SET `status` = 'ANSWERED'       WHERE `status` = 'WAITING_ON_CLIENT';
UPDATE `Ticket` SET `status` = 'CUSTOMER_REPLY' WHERE `status` = 'WAITING_ON_STAFF';
UPDATE `Ticket` SET `status` = 'CLOSED'         WHERE `status` = 'RESOLVED';

ALTER TABLE `Ticket`
    MODIFY COLUMN `status` ENUM('OPEN','ANSWERED','CUSTOMER_REPLY','CLOSED') NOT NULL DEFAULT 'OPEN';

-- ── TicketReply: invoice / system messages ───────────────────────────────────
ALTER TABLE `TicketReply`
    ADD COLUMN IF NOT EXISTS `system`    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS `invoiceId` VARCHAR(191) NULL;

-- ── CannedReply: enum department -> Department relation ───────────────────────
ALTER TABLE `CannedReply` ADD COLUMN IF NOT EXISTS `departmentId` VARCHAR(191) NULL;

UPDATE `CannedReply` SET `departmentId` = CASE `department`
        WHEN 'SALES'   THEN 'dept_sales'
        WHEN 'SUPPORT' THEN 'dept_support'
        WHEN 'ABUSE'   THEN 'dept_abuse'
        ELSE 'dept_support'
    END
    WHERE `departmentId` IS NULL;

ALTER TABLE `CannedReply` MODIFY COLUMN `departmentId` VARCHAR(191) NOT NULL;
ALTER TABLE `CannedReply` DROP COLUMN IF EXISTS `department`;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX `Ticket_departmentId_idx`      ON `Ticket`(`departmentId`);
CREATE INDEX `TicketReply_invoiceId_idx`    ON `TicketReply`(`invoiceId`);
CREATE INDEX `CannedReply_departmentId_idx` ON `CannedReply`(`departmentId`);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
ALTER TABLE `DepartmentMember`
    ADD CONSTRAINT `DepartmentMember_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `DepartmentMember_userId_fkey`       FOREIGN KEY (`userId`)       REFERENCES `User`(`id`)       ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Ticket`
    ADD CONSTRAINT `Ticket_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `TicketReply`
    ADD CONSTRAINT `TicketReply_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `CannedReply`
    ADD CONSTRAINT `CannedReply_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Public form routing defaults ──────────────────────────────────────────────
-- Values are stored as JSON strings (the column is JSON). Using plain JSON
-- string literals avoids depending on the JSON_QUOTE() function. Non-critical:
-- if absent, the app falls back to the default department.
INSERT IGNORE INTO `SystemSetting` (`id`,`key`,`value`,`updatedAt`) VALUES
    ('set_contact_form_dept', 'contactFormDepartmentId', '"dept_support"', NOW(3)),
    ('set_inquiry_form_dept', 'inquiryFormDepartmentId', '"dept_sales"',   NOW(3));
