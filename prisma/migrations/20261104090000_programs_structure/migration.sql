-- Programs, slice P1 (task 0043): a program, the branches it runs in, its own level names, its tree of groups, its program admins and its append-only history.
--
-- ADDITIVE ONLY: six new tables and four new enums, nothing that exists is altered, no row is changed and nothing is read by the release before this one, so this can be run
-- BEFORE the code that uses it is deployed (the additive-migration rule of this repository). The hosted databases are migrated by the maintainer, never by an AI session.
--
-- What Prisma cannot express is added at the end: a unique name among live programs, a unique name among live siblings, and the checks that keep the tree and the dates sane
-- even if a future caller forgets to.

-- CreateEnum
CREATE TYPE "ProgramKind" AS ENUM ('ONGOING', 'FIXED_TERM');


-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');


-- CreateEnum
CREATE TYPE "ProgramStaffRole" AS ENUM ('ADMIN', 'SUPERVISOR', 'TEACHER', 'RECORDER');


-- CreateEnum
CREATE TYPE "ProgramStaffStatus" AS ENUM ('ACTIVE', 'ENDED');


-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ProgramKind" NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "startsOn" DATE,
    "endsOn" DATE,
    "ownBranchId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ProgramBranch" (
    "programId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramBranch_pkey" PRIMARY KEY ("programId","branchId")
);


-- CreateTable
CREATE TABLE "ProgramLevelLabel" (
    "programId" TEXT NOT NULL,
    "levelIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProgramLevelLabel_pkey" PRIMARY KEY ("programId","levelIndex")
);


-- CreateTable
CREATE TABLE "ProgramGroup" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "parentId" TEXT,
    "levelIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramGroup_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ProgramStaff" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "role" "ProgramStaffRole" NOT NULL,
    "status" "ProgramStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramStaff_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ProgramAudit" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAudit_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "Program_ownBranchId_key" ON "Program"("ownBranchId");


-- CreateIndex
CREATE INDEX "Program_status_idx" ON "Program"("status");


-- CreateIndex
CREATE INDEX "ProgramBranch_branchId_idx" ON "ProgramBranch"("branchId");


-- CreateIndex
CREATE INDEX "ProgramGroup_programId_parentId_idx" ON "ProgramGroup"("programId", "parentId");


-- CreateIndex
CREATE INDEX "ProgramStaff_userId_status_idx" ON "ProgramStaff"("userId", "status");


-- CreateIndex
CREATE INDEX "ProgramStaff_programId_status_idx" ON "ProgramStaff"("programId", "status");


-- CreateIndex
CREATE UNIQUE INDEX "ProgramStaff_programId_userId_role_key" ON "ProgramStaff"("programId", "userId", "role");


-- CreateIndex
CREATE INDEX "ProgramAudit_programId_createdAt_idx" ON "ProgramAudit"("programId", "createdAt");


-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_ownBranchId_fkey" FOREIGN KEY ("ownBranchId") REFERENCES "Branch"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramBranch" ADD CONSTRAINT "ProgramBranch_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramBranch" ADD CONSTRAINT "ProgramBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramLevelLabel" ADD CONSTRAINT "ProgramLevelLabel_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProgramGroup"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramStaff" ADD CONSTRAINT "ProgramStaff_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramStaff" ADD CONSTRAINT "ProgramStaff_userId_branchId_fkey" FOREIGN KEY ("userId", "branchId") REFERENCES "Membership"("userId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ProgramAudit" ADD CONSTRAINT "ProgramAudit_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A live program's name is unique (case-insensitive); an archived program frees its name.
CREATE UNIQUE INDEX "Program_live_name_key" ON "Program" (lower("name")) WHERE "status" <> 'ARCHIVED';

-- A live group's name is unique among its live siblings (case-insensitive). The top level has no parent, so a missing parent is compared as the empty string.
CREATE UNIQUE INDEX "ProgramGroup_live_name_key" ON "ProgramGroup" ("programId", COALESCE("parentId", ''), lower("name")) WHERE "archivedAt" IS NULL;

-- At most four levels (0 to 3); a group at the top has no parent and every other group has one.
ALTER TABLE "ProgramLevelLabel" ADD CONSTRAINT "ProgramLevelLabel_level_check" CHECK ("levelIndex" BETWEEN 0 AND 3);
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_level_check" CHECK ("levelIndex" BETWEEN 0 AND 3);
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_top_has_no_parent_check" CHECK (("parentId" IS NULL) = ("levelIndex" = 0));

-- A fixed-term program has a start and an end after it; an ongoing program never has an end.
ALTER TABLE "Program" ADD CONSTRAINT "Program_dates_check" CHECK (
  ("kind" = 'FIXED_TERM' AND "startsOn" IS NOT NULL AND "endsOn" IS NOT NULL AND "endsOn" > "startsOn")
  OR ("kind" = 'ONGOING' AND "endsOn" IS NULL)
);
