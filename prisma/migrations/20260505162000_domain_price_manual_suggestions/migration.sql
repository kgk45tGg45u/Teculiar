ALTER TABLE "DomainTldPrice" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DomainTldPrice" ADD COLUMN "suggested" BOOLEAN NOT NULL DEFAULT false;

UPDATE "DomainTldPrice" SET "manual" = true WHERE "tld" = 'de';
