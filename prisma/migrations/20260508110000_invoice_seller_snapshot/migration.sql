-- Add sellerSnapshot and footerLines to Invoice for frozen seller address and footer
ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "sellerSnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "footerLines" JSONB NOT NULL DEFAULT '[]';
