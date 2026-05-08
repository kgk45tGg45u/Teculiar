-- Add sellerSnapshot to Invoice for frozen seller address
ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "sellerSnapshot" JSONB NOT NULL DEFAULT '{}';
