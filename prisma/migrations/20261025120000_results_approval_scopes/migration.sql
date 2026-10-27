-- Results are approved by assignment (task 0039, slice 1): sections, a class's optional section, and where each approver approves. ADDITIVE: two tables, one enum and one
-- nullable column; nothing existing changes and no existing row is touched. Nobody gets a scope from this migration: no one can approve results today except an
-- administrator (the permission CAN_APPROVE_RESULTS was stored and never read), and an administrator is held to no scope. The maintainer runs it on the hosted database
-- BEFORE the code that reads it is deployed there.
--
-- Section: a named group of classes of one branch (Primary, JSS, SSS). Archived, never deleted: classes and scopes point at it.
-- ResultApprovalScope: one row says "this member approves results for GENERAL (their whole branch), a SECTION, or one CLASS". Rows are added and removed, never edited.
-- No row means no approving (the application fails closed).

-- CreateEnum
CREATE TYPE "ApprovalScopeKind" AS ENUM ('GENERAL', 'SECTION', 'CLASS');

-- AlterTable
ALTER TABLE "ClassGroup" ADD COLUMN     "sectionId" TEXT;

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultApprovalScope" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ApprovalScopeKind" NOT NULL,
    "sectionId" TEXT,
    "classGroupId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultApprovalScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Section_branchId_idx" ON "Section"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_branchId_id_key" ON "Section"("branchId", "id");

-- CreateIndex
CREATE INDEX "ResultApprovalScope_branchId_userId_idx" ON "ResultApprovalScope"("branchId", "userId");

-- CreateIndex
CREATE INDEX "ClassGroup_branchId_sectionId_idx" ON "ClassGroup"("branchId", "sectionId");

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_branchId_sectionId_fkey" FOREIGN KEY ("branchId", "sectionId") REFERENCES "Section"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_userId_branchId_fkey" FOREIGN KEY ("userId", "branchId") REFERENCES "Membership"("userId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_branchId_sectionId_fkey" FOREIGN KEY ("branchId", "sectionId") REFERENCES "Section"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- What the schema file cannot say. A section needs a name; a live name is unique within its branch, ignoring case.
ALTER TABLE "Section" ADD CONSTRAINT "Section_name_given" CHECK (length(btrim("name", E' \t\r\n')) BETWEEN 1 AND 80);
CREATE UNIQUE INDEX "Section_live_name_key" ON "Section" ("branchId", lower("name")) WHERE "archivedAt" IS NULL;

-- A scope's kind and its target agree: GENERAL names nothing, SECTION names a section, CLASS names a class. The same member cannot hold the same scope twice.
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_kind_target" CHECK (
  ("kind" = 'GENERAL' AND "sectionId" IS NULL AND "classGroupId" IS NULL)
  OR ("kind" = 'SECTION' AND "sectionId" IS NOT NULL AND "classGroupId" IS NULL)
  OR ("kind" = 'CLASS' AND "classGroupId" IS NOT NULL AND "sectionId" IS NULL)
);
CREATE UNIQUE INDEX "ResultApprovalScope_target_key" ON "ResultApprovalScope" ("branchId", "userId", "kind", COALESCE("sectionId", ''), COALESCE("classGroupId", ''));
