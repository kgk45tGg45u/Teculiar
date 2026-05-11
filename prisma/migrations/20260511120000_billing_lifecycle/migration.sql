-- Enum extensions for WHMCS-like lifecycle states.
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'ONE_TIME';
ALTER TYPE "ServiceStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ServiceStatus" ADD VALUE IF NOT EXISTS 'PROVISIONING_FAILED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "DomainStatus" ADD VALUE IF NOT EXISTS 'PENDING_TRANSFER';
ALTER TYPE "DomainStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "DomainStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Invoice accounting numbers and German invoice snapshots.
ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "tempInvoiceNumber" TEXT,
ADD COLUMN IF NOT EXISTS "finalInvoiceNumber" TEXT,
ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sellerSnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "adminNotes" TEXT;

UPDATE "Invoice"
SET "finalInvoiceNumber" = "invoiceNumber",
    "finalizedAt" = COALESCE("paidAt", "updatedAt")
WHERE "status" = 'PAID';

UPDATE "Invoice"
SET "tempInvoiceNumber" = CONCAT('N-', "invoiceNumber")
WHERE "status" <> 'PAID' AND "tempInvoiceNumber" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tempInvoiceNumber_key" ON "Invoice"("tempInvoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_finalInvoiceNumber_key" ON "Invoice"("finalInvoiceNumber");

-- Service lifecycle and module metadata.
ALTER TABLE "Service"
ADD COLUMN IF NOT EXISTS "orderId" TEXT,
ADD COLUMN IF NOT EXISTS "orderItemId" TEXT,
ADD COLUMN IF NOT EXISTS "initialInvoiceId" TEXT,
ADD COLUMN IF NOT EXISTS "domainRecordId" TEXT,
ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle",
ADD COLUMN IF NOT EXISTS "recurringAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "setupFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "customFields" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "moduleName" TEXT,
ADD COLUMN IF NOT EXISTS "moduleStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "moduleReference" TEXT,
ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "nextDueAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3);

-- Domain lifecycle metadata.
ALTER TABLE "DomainRecord"
ADD COLUMN IF NOT EXISTS "orderId" TEXT,
ADD COLUMN IF NOT EXISTS "orderItemId" TEXT,
ADD COLUMN IF NOT EXISTS "initialInvoiceId" TEXT,
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'register',
ADD COLUMN IF NOT EXISTS "registrarModule" TEXT,
ADD COLUMN IF NOT EXISTS "eppCode" TEXT,
ADD COLUMN IF NOT EXISTS "registrationDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "nextDueAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "registrationPeriodYears" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "firstPaymentAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "recurringAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "nameservers" JSONB;

CREATE INDEX IF NOT EXISTS "DomainRecord_orderItemId_idx" ON "DomainRecord"("orderItemId");
CREATE INDEX IF NOT EXISTS "DomainRecord_initialInvoiceId_idx" ON "DomainRecord"("initialInvoiceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DomainRecord_orderItemId_fkey') THEN
    ALTER TABLE "DomainRecord"
    ADD CONSTRAINT "DomainRecord_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Invoice item links to order items, services, domains, and lifecycle actions.
ALTER TABLE "InvoiceItem"
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN IF NOT EXISTS "orderItemId" TEXT,
ADD COLUMN IF NOT EXISTS "domainRecordId" TEXT,
ADD COLUMN IF NOT EXISTS "lifecycleAction" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "InvoiceItem_orderItemId_idx" ON "InvoiceItem"("orderItemId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_serviceId_idx" ON "InvoiceItem"("serviceId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_domainRecordId_idx" ON "InvoiceItem"("domainRecordId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceItem_orderItemId_fkey') THEN
    ALTER TABLE "InvoiceItem"
    ADD CONSTRAINT "InvoiceItem_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceItem_domainRecordId_fkey') THEN
    ALTER TABLE "InvoiceItem"
    ADD CONSTRAINT "InvoiceItem_domainRecordId_fkey"
    FOREIGN KEY ("domainRecordId") REFERENCES "DomainRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Module/audit detail for idempotent automation.
CREATE TABLE IF NOT EXISTS "ModuleLog" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "invoiceId" TEXT,
  "orderId" TEXT,
  "orderItemId" TEXT,
  "serviceId" TEXT,
  "domainRecordId" TEXT,
  "moduleName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "request" JSONB NOT NULL DEFAULT '{}',
  "response" JSONB NOT NULL DEFAULT '{}',
  "errorMessage" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModuleLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ModuleLog_idempotencyKey_key" ON "ModuleLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ModuleLog_invoiceId_idx" ON "ModuleLog"("invoiceId");
CREATE INDEX IF NOT EXISTS "ModuleLog_serviceId_idx" ON "ModuleLog"("serviceId");
CREATE INDEX IF NOT EXISTS "ModuleLog_domainRecordId_idx" ON "ModuleLog"("domainRecordId");
CREATE INDEX IF NOT EXISTS "ModuleLog_action_serviceId_idx" ON "ModuleLog"("action", "serviceId");
CREATE INDEX IF NOT EXISTS "ModuleLog_action_domainRecordId_idx" ON "ModuleLog"("action", "domainRecordId");
