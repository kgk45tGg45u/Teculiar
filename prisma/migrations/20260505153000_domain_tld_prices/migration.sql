CREATE TABLE "DomainTldPrice" (
    "id" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "years" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainTldPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainTldPrice_tld_action_years_key" ON "DomainTldPrice"("tld", "action", "years");
CREATE INDEX "DomainTldPrice_tld_idx" ON "DomainTldPrice"("tld");
