-- Staff records and teaching assignments, Slice P1c (plan "Build design - Slice P1c"). ADDITIVE and safe on the live school: two new tables and one enum,
-- nothing existing changes. Run BEFORE the code that reads it (ADR 0003). Ported from Octalve Edu's people migration with `branchId` for `tenantId` and no
-- row-level security (AlEemaan's guard is withBranch, ADR 0015).
--
-- A staff record is how the BRANCH knows a person; a sign-in account is a Membership it may be linked to - once, and only a member of the SAME branch (the
-- composite foreign key). Records are archived, never deleted.

-- CreateEnum
CREATE TYPE "StaffCategory" AS ENUM ('TEACHING', 'NON_TEACHING');

-- CreateTable
CREATE TABLE "StaffRecord" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "category" "StaffCategory" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSubjectAssignment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSubjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRecord_branchId_idx" ON "StaffRecord"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRecord_branchId_id_key" ON "StaffRecord"("branchId", "id");

-- CreateIndex
CREATE INDEX "StaffSubjectAssignment_branchId_idx" ON "StaffSubjectAssignment"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSubjectAssignment_staffRecordId_subjectId_classArmId_key" ON "StaffSubjectAssignment"("staffRecordId", "subjectId", "classArmId");

-- AddForeignKey
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_userId_branchId_fkey" FOREIGN KEY ("userId", "branchId") REFERENCES "Membership"("userId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSubjectAssignment" ADD CONSTRAINT "StaffSubjectAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSubjectAssignment" ADD CONSTRAINT "StaffSubjectAssignment_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES "StaffRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSubjectAssignment" ADD CONSTRAINT "StaffSubjectAssignment_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSubjectAssignment" ADD CONSTRAINT "StaffSubjectAssignment_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES "ClassArm"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Shapes the database insists on, whichever code writes.
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_names_valid" CHECK (length(btrim("firstName")) BETWEEN 1 AND 80 AND length(btrim("lastName")) BETWEEN 1 AND 80);
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_phone_shape" CHECK ("phone" IS NULL OR ("phone" ~ '^[0-9+() -]{7,20}$'));
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_email_shape" CHECK ("email" IS NULL OR ("email" = lower("email") AND length("email") <= 254 AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));

-- One account links to one record per branch; live emails are unique per branch.
CREATE UNIQUE INDEX "StaffRecord_account_once" ON "StaffRecord"("branchId", "userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX "StaffRecord_email_live" ON "StaffRecord"("branchId", lower("email")) WHERE "email" IS NOT NULL AND "archivedAt" IS NULL;
