-- Academic structure, Slice P1a (plan "Build design - Slice P1"). ADDITIVE and safe on the live school: new tables and one nullable column; no existing row
-- changes meaning. Run BEFORE the code that reads it (ADR 0003).
--
-- Part 1 is the schema; part 2 adds what Prisma cannot express (live-name uniqueness as partial indexes, CHECKs); part 3 backfills real classes and arms from the
-- className / arm strings the enrolments already hold, and links the enrolments. The backfill is INSERT ... SELECT plus setting the new nullable column; it is
-- idempotent (running it twice adds nothing).

-- AlterTable
ALTER TABLE "StudentEnrollment" ADD COLUMN     "classArmId" TEXT;

-- CreateTable
CREATE TABLE "ClassGroup" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassArm" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassArm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectOffering" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassGroup_branchId_idx" ON "ClassGroup"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroup_branchId_id_key" ON "ClassGroup"("branchId", "id");

-- CreateIndex
CREATE INDEX "ClassArm_branchId_classGroupId_idx" ON "ClassArm"("branchId", "classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassArm_branchId_id_key" ON "ClassArm"("branchId", "id");

-- CreateIndex
CREATE INDEX "Subject_branchId_idx" ON "Subject"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_branchId_id_key" ON "Subject"("branchId", "id");

-- CreateIndex
CREATE INDEX "SubjectOffering_branchId_idx" ON "SubjectOffering"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectOffering_classGroupId_subjectId_key" ON "SubjectOffering"("classGroupId", "subjectId");

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES "ClassArm"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ===== Part 2: what Prisma cannot express =====
-- Live names are unique (ignoring case) per branch / per class; a live subject code is unique per branch. An archived row frees its name.
CREATE UNIQUE INDEX "ClassGroup_live_name_key" ON "ClassGroup" ("branchId", lower("name")) WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ClassArm_live_name_key" ON "ClassArm" ("classGroupId", lower("name")) WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Subject_live_code_key" ON "Subject" ("branchId", "code") WHERE "code" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Subject_live_name_key" ON "Subject" ("branchId", lower("name")) WHERE "archivedAt" IS NULL;
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_code_upper" CHECK ("code" IS NULL OR "code" = upper(btrim("code")));

-- ===== Part 3: backfill from the strings =====
-- The display name is the most frequent spelling among the enrolments (ties: the first in sort order). One class per distinct (branch, className); one arm per distinct (branch, className, arm), "Main" when the enrolment has no arm. Ids are derived from the
-- values, so running this again finds the same ids and inserts nothing (ON CONFLICT DO NOTHING on the primary key).
INSERT INTO "ClassGroup" ("id", "branchId", "name", "sortOrder")
SELECT 'cg_' || md5(e."branchId" || '|' || lower(btrim(e."className"))), e."branchId", mode() WITHIN GROUP (ORDER BY btrim(e."className")), 0
  FROM "StudentEnrollment" e
 WHERE btrim(e."className") <> ''
 GROUP BY e."branchId", lower(btrim(e."className"))
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ClassArm" ("id", "branchId", "classGroupId", "name")
SELECT 'ca_' || md5(e."branchId" || '|' || lower(btrim(e."className")) || '|' || lower(COALESCE(NULLIF(btrim(e."arm"), ''), 'Main'))),
       e."branchId",
       'cg_' || md5(e."branchId" || '|' || lower(btrim(e."className"))),
       mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(btrim(e."arm"), ''), 'Main'))
  FROM "StudentEnrollment" e
 WHERE btrim(e."className") <> ''
 GROUP BY e."branchId", lower(btrim(e."className")), lower(COALESCE(NULLIF(btrim(e."arm"), ''), 'Main'))
ON CONFLICT ("id") DO NOTHING;

UPDATE "StudentEnrollment" e
   SET "classArmId" = 'ca_' || md5(e."branchId" || '|' || lower(btrim(e."className")) || '|' || lower(COALESCE(NULLIF(btrim(e."arm"), ''), 'Main')))
 WHERE e."classArmId" IS NULL AND btrim(e."className") <> '';
