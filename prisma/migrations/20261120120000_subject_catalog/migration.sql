-- Task 0119: the shared subject catalogue. Additive: one new table and one nullable column on Subject with its index and key. Nothing is changed or dropped.
--
-- A branch's Subject stays the branch's own row (results, offerings and assignments point at it with the branch-checked key); "catalogId" only says it is the same subject as the
-- catalogue entry. The partial unique indexes at the end are not in prisma/schema/academics.prisma because Prisma cannot express them (the same as Subject_live_name_key, which
-- `prisma migrate diff` tolerates): a live catalogue name is unique ignoring case, a live catalogue code is unique, and a branch has at most one live subject per catalogue entry.

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "catalogId" TEXT;

-- CreateTable
CREATE TABLE "SubjectCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subject_catalogId_idx" ON "Subject"("catalogId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "SubjectCatalog"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Partial unique indexes (not expressible in the Prisma schema).
CREATE UNIQUE INDEX "SubjectCatalog_live_name_key" ON "SubjectCatalog" (lower("name")) WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "SubjectCatalog_live_code_key" ON "SubjectCatalog" ("code") WHERE "code" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Subject_live_catalog_key" ON "Subject" ("branchId", "catalogId") WHERE "catalogId" IS NOT NULL AND "archivedAt" IS NULL;

-- Backfill: one catalogue entry for each distinct live subject name across the branches (ignoring case; the first spelling by id, and the first code that no earlier entry has taken), and
-- every live subject of that name is linked to it. A database with no subjects gets nothing; running it again finds every subject already linked and every name already in the catalogue.
WITH names AS (
  SELECT DISTINCT ON (lower("name")) lower("name") AS key, "name" AS name
  FROM "Subject"
  WHERE "archivedAt" IS NULL AND "catalogId" IS NULL
  ORDER BY lower("name"), "id"
),
codes AS (
  SELECT DISTINCT ON (lower("name")) lower("name") AS key, "code" AS code
  FROM "Subject"
  WHERE "archivedAt" IS NULL AND "catalogId" IS NULL AND "code" IS NOT NULL
  ORDER BY lower("name"), "id"
),
fresh AS (
  SELECT n.key, n.name, c.code
  FROM names n
  LEFT JOIN codes c ON c.key = n.key
  WHERE NOT EXISTS (SELECT 1 FROM "SubjectCatalog" k WHERE k."archivedAt" IS NULL AND lower(k."name") = n.key)
),
numbered AS (
  -- a code held by two different names goes to the first of them only; the others get none (the catalogue's live codes are unique)
  SELECT f.key, f.name,
         CASE WHEN f.code IS NOT NULL
               AND ROW_NUMBER() OVER (PARTITION BY f.code ORDER BY f.key) = 1
               AND NOT EXISTS (SELECT 1 FROM "SubjectCatalog" k WHERE k."archivedAt" IS NULL AND k."code" = f.code)
              THEN f.code END AS code
  FROM fresh f
)
INSERT INTO "SubjectCatalog" ("id", "name", "code", "updatedAt")
SELECT 'catalog_' || md5(key), name, code, CURRENT_TIMESTAMP FROM numbered
ON CONFLICT DO NOTHING;

UPDATE "Subject" AS s
SET "catalogId" = k."id"
FROM "SubjectCatalog" AS k
WHERE s."archivedAt" IS NULL
  AND s."catalogId" IS NULL
  AND k."archivedAt" IS NULL
  AND lower(k."name") = lower(s."name");
