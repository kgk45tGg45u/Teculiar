ALTER TABLE "PaymentMethod"
ADD COLUMN IF NOT EXISTS "providerCustomerId" TEXT,
ADD COLUMN IF NOT EXISTS "mandateId" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "automatic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "consentGivenAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PaymentMethod_userId_automatic_status_idx" ON "PaymentMethod"("userId", "automatic", "status");
