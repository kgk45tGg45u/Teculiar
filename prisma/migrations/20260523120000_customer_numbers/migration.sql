CREATE SEQUENCE "User_customerNumber_seq";

ALTER TABLE "User" ADD COLUMN "customerNumber" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id)::integer AS number
  FROM "User"
)
UPDATE "User"
SET "customerNumber" = numbered.number
FROM numbered
WHERE "User".id = numbered.id;

SELECT setval('"User_customerNumber_seq"', COALESCE((SELECT MAX("customerNumber") FROM "User"), 0) + 1, false);

ALTER TABLE "User" ALTER COLUMN "customerNumber" SET DEFAULT nextval('"User_customerNumber_seq"');
ALTER TABLE "User" ALTER COLUMN "customerNumber" SET NOT NULL;
ALTER SEQUENCE "User_customerNumber_seq" OWNED BY "User"."customerNumber";

CREATE UNIQUE INDEX "User_customerNumber_key" ON "User"("customerNumber");
