-- AlterTable: Add classTeacherId to ClassArm
ALTER TABLE "ClassArm" ADD COLUMN "classTeacherId" TEXT;

-- CreateTable: AttendanceGrant
CREATE TABLE "AttendanceGrant" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceGrant_branchId_staffRecordId_classArmId_key" ON "AttendanceGrant"("branchId", "staffRecordId", "classArmId");

-- CreateIndex
CREATE INDEX "AttendanceGrant_branchId_idx" ON "AttendanceGrant"("branchId");

-- CreateIndex
CREATE INDEX "AttendanceGrant_staffRecordId_idx" ON "AttendanceGrant"("staffRecordId");

-- CreateIndex
CREATE INDEX "AttendanceGrant_classArmId_idx" ON "AttendanceGrant"("classArmId");

-- CreateIndex
CREATE INDEX "ClassArm_branchId_classTeacherId_idx" ON "ClassArm"("branchId", "classTeacherId");

-- AddForeignKey: ClassArm -> StaffRecord
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_branchId_classTeacherId_fkey" FOREIGN KEY ("branchId", "classTeacherId") REFERENCES "StaffRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey: AttendanceGrant -> Branch
ALTER TABLE "AttendanceGrant" ADD CONSTRAINT "AttendanceGrant_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AttendanceGrant -> StaffRecord
ALTER TABLE "AttendanceGrant" ADD CONSTRAINT "AttendanceGrant_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES "StaffRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AttendanceGrant -> ClassArm
ALTER TABLE "AttendanceGrant" ADD CONSTRAINT "AttendanceGrant_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES "ClassArm"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AttendanceGrant -> User
ALTER TABLE "AttendanceGrant" ADD CONSTRAINT "AttendanceGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deploy Backfill: Automatically seed AttendanceGrant from all active teaching assignments
INSERT INTO "AttendanceGrant" ("id", "branchId", "staffRecordId", "classArmId", "grantedByUserId", "grantedAt")
SELECT
    'ag_backfill_' || md5(ssa."branchId" || ':' || ssa."staffRecordId" || ':' || ssa."classArmId"),
    ssa."branchId",
    ssa."staffRecordId",
    ssa."classArmId",
    NULL,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "branchId", "staffRecordId", "classArmId"
    FROM "StaffSubjectAssignment"
) ssa
ON CONFLICT ("branchId", "staffRecordId", "classArmId") DO NOTHING;
