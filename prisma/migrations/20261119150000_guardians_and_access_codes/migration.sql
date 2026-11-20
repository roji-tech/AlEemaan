-- Task 0113: guardians as records of their own (Guardian, StudentGuardian: the relationship, the main contact, a per-child block); the pupil's access code (hash only) and a version
-- that ends a pupil's sessions when it is regenerated; the per-branch switch for the old secrets (date of birth, guardian phone or e-mail); day or boarding
-- (R1). Additive.
-- CreateEnum
CREATE TYPE "Residence" AS ENUM ('DAY', 'BOARDING');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('MOTHER', 'FATHER', 'GUARDIAN', 'OTHER');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "legacyPortalSecrets" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "StudentRecord" ADD COLUMN     "portalVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pupilCodeAt" TIMESTAMP(3),
ADD COLUMN     "pupilCodeHash" TEXT,
ADD COLUMN     "residence" "Residence";

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "codeHash" TEXT,
    "codeAt" TIMESTAMP(3),
    "portalVersion" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGuardian" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "relationship" "GuardianRelationship",
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMP(3),
    "blockedById" TEXT,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guardian_phoneKey_idx" ON "Guardian"("phoneKey");

-- CreateIndex
CREATE INDEX "Guardian_email_idx" ON "Guardian"("email");

-- CreateIndex
CREATE INDEX "Guardian_name_idx" ON "Guardian"("name");

-- CreateIndex
CREATE INDEX "StudentGuardian_guardianId_idx" ON "StudentGuardian"("guardianId");

-- CreateIndex
CREATE INDEX "StudentGuardian_branchId_idx" ON "StudentGuardian"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardian_studentId_guardianId_key" ON "StudentGuardian"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "StudentRecord_branchId_residence_idx" ON "StudentRecord"("branchId", "residence");

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cheap insurance (task 0113 D2; the maintainer: "we don't have any guardian info yet"): any pupil whose guardian columns hold something gets one guardian and one main link, so nothing
-- typed before is lost. No merging. The ids are derived from the pupil's, so the statement is deterministic.
INSERT INTO "Guardian" ("id", "name", "phone", "phoneKey", "email", "createdAt", "updatedAt")
SELECT
  'gm' || md5(p."id"),
  COALESCE(NULLIF(btrim(p."guardianName"), ''), 'Guardian of ' || p."firstName" || ' ' || p."lastName"),
  NULLIF(regexp_replace(COALESCE(p."guardianPhone", ''), '[\s\-\(\)\.]', '', 'g'), ''),
  CASE WHEN length(p.d) < 7 THEN NULL WHEN p.d LIKE '234%' AND length(p.d) >= 12 THEN substr(p.d, 4) ELSE ltrim(p.d, '0') END,
  NULLIF(lower(btrim(COALESCE(p."guardianEmail", ''))), ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT s.*, regexp_replace(COALESCE(s."guardianPhone", ''), '\D', '', 'g') AS d
  FROM "StudentRecord" s
  WHERE btrim(COALESCE(s."guardianName", '')) <> '' OR btrim(COALESCE(s."guardianPhone", '')) <> '' OR btrim(COALESCE(s."guardianEmail", '')) <> ''
) p;

INSERT INTO "StudentGuardian" ("id", "studentId", "guardianId", "branchId", "isMain", "createdAt")
SELECT 'lm' || md5(s."id"), s."id", 'gm' || md5(s."id"), s."branchId", true, CURRENT_TIMESTAMP
FROM "StudentRecord" s
WHERE btrim(COALESCE(s."guardianName", '')) <> '' OR btrim(COALESCE(s."guardianPhone", '')) <> '' OR btrim(COALESCE(s."guardianEmail", '')) <> '';
