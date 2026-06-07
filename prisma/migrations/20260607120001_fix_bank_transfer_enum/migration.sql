-- Corrected migration: add BANK_TRANSFER to PaymentMethodType enum.
-- Migration 20260607120000 had ALTER TABLE Invoice (wrong table) so it
-- was resolved as applied via Dockerfile and this migration replaces it.
-- All four MODIFY COLUMN statements are idempotent in MySQL — safe to
-- re-run if some columns were already updated by the broken migration.

ALTER TABLE `Transaction`
  MODIFY COLUMN `method` ENUM('CREDIT_CARD','PAYPAL','SEPA','CRYPTO','ACCOUNT_BALANCE','BANK_TRANSFER') NOT NULL;

ALTER TABLE `PaymentMethod`
  MODIFY COLUMN `type` ENUM('CREDIT_CARD','PAYPAL','SEPA','CRYPTO','ACCOUNT_BALANCE','BANK_TRANSFER') NOT NULL;

ALTER TABLE `Order`
  MODIFY COLUMN `paymentMethod` ENUM('CREDIT_CARD','PAYPAL','SEPA','CRYPTO','ACCOUNT_BALANCE','BANK_TRANSFER') NULL;

ALTER TABLE `PaymentProcessorConfig`
  MODIFY COLUMN `method` ENUM('CREDIT_CARD','PAYPAL','SEPA','CRYPTO','ACCOUNT_BALANCE','BANK_TRANSFER') NOT NULL;
