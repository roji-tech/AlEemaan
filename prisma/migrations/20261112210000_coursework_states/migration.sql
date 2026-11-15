-- Coursework states (task 0066).
--
-- 1. An assignment can be CLOSED: pupils still see it (and their own hand-in and mark), hand-ins are refused.
-- 2. A study material gets a draft state (status) and a type (materialType). Rows written before this migration were all visible to pupils, so they become
--    PUBLISHED; they never had a type, so they become OTHER. No row is rewritten beyond those two defaults.

-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'CLOSED';

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('DOCUMENT', 'VIDEO_LINK', 'PRESENTATION', 'NOTES', 'OTHER');

-- AlterTable
ALTER TABLE "LearningMaterial" ADD COLUMN     "materialType" "MaterialType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "status" "MaterialStatus" NOT NULL DEFAULT 'PUBLISHED';

-- CreateIndex
CREATE INDEX "LearningMaterial_branchId_status_idx" ON "LearningMaterial"("branchId", "status");
