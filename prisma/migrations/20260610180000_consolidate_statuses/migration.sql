-- Consolidate Order, Invoice and Service status enums.
--
--   Order:   PENDING_PAYMENT -> PENDING, PAID -> PROVISIONING (payment moves straight to provisioning)
--   Invoice: DRAFT / UNSENT / UNPAID -> PENDING (single "awaiting payment" status; paid = no badge)
--   Service: ORDERED -> PENDING, PENDING_CANCEL -> ACTIVE (cancellation tracked via cancelAt)
--
-- Data is remapped BEFORE each enum is narrowed so no existing row is left with a removed value.

-- 1. Orders --------------------------------------------------------------------------------------
-- Widen the enum to include the new PENDING value so existing rows can be remapped first.
ALTER TABLE `Order`
  MODIFY `status` ENUM('PENDING_PAYMENT','PAID','PROVISIONING','COMPLETE','FAILED','CANCELLED','PENDING') NOT NULL DEFAULT 'PENDING_PAYMENT';

UPDATE `Order` SET `status` = 'PENDING'      WHERE `status` = 'PENDING_PAYMENT';
UPDATE `Order` SET `status` = 'PROVISIONING' WHERE `status` = 'PAID';

ALTER TABLE `Order`
  MODIFY `status` ENUM('PENDING','PROVISIONING','COMPLETE','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING';

-- 2. Invoices ------------------------------------------------------------------------------------
UPDATE `Invoice` SET `status` = 'PENDING' WHERE `status` IN ('DRAFT','UNSENT','UNPAID');

ALTER TABLE `Invoice`
  MODIFY `status` ENUM('PENDING','PAID','OVERDUE','FAILED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING';

-- 3. Services ------------------------------------------------------------------------------------
UPDATE `Service` SET `status` = 'PENDING' WHERE `status` = 'ORDERED';
UPDATE `Service` SET `status` = 'ACTIVE'  WHERE `status` = 'PENDING_CANCEL';

ALTER TABLE `Service`
  MODIFY `status` ENUM('PENDING','PROVISIONING','ACTIVE','SUSPENDED','CANCELLED','TERMINATED','FAILED','PROVISIONING_FAILED') NOT NULL DEFAULT 'PENDING';
