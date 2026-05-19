-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "provisioningModule" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- Seed default categories
INSERT INTO "ProductCategory" ("id", "name", "slug", "description", "provisioningModule", "sortOrder", "updatedAt")
VALUES
  ('cat_webhosting', 'Webhosting', 'webhosting', 'Shared hosting packages provisioned through the selected hosting module.', 'virtualmin', 10, CURRENT_TIMESTAMP),
  ('cat_domain', 'Domain', 'domain', 'Domain registration and transfer products.', 'resellbiz', 20, CURRENT_TIMESTAMP),
  ('cat_it_solutions', 'IT Solutions', 'it-solutions', 'Manual IT services until an automation module is configured.', NULL, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Attach existing products to categories
UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'webhosting')
WHERE "type" = 'SHARED_HOSTING';

UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'domain')
WHERE "type" = 'DOMAIN';

UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'it-solutions')
WHERE "type" IN ('NEXTCLOUD', 'CRM_SERVER', 'MANAGED_SERVICE', 'SUPPORT_SUBSCRIPTION');

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
