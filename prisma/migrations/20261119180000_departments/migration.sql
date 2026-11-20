-- Task 0101 D7: departments and heads of department. Additive: two new tables, one nullable column on Subject, their indexes and keys. Nothing is changed or dropped.
-- Whether a branch uses departments is a per-branch setting (SettingValue key `academics.useDepartments`), not a column here.
--
-- The two partial unique indexes at the end are not in prisma/schema/academics.prisma because Prisma cannot express them (the same as ClassGroup_live_name_key, which `prisma migrate diff`
-- tolerates): a live department name is unique per branch ignoring case, and a department has at most one head.

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMember" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "isHead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Department_branchId_idx" ON "Department"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_branchId_id_key" ON "Department"("branchId", "id");

-- CreateIndex
CREATE INDEX "DepartmentMember_branchId_idx" ON "DepartmentMember"("branchId");

-- CreateIndex
CREATE INDEX "DepartmentMember_staffRecordId_idx" ON "DepartmentMember"("staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMember_departmentId_staffRecordId_key" ON "DepartmentMember"("departmentId", "staffRecordId");

-- CreateIndex
CREATE INDEX "Subject_branchId_departmentId_idx" ON "Subject"("branchId", "departmentId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_branchId_departmentId_fkey" FOREIGN KEY ("branchId", "departmentId") REFERENCES "Department"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_branchId_departmentId_fkey" FOREIGN KEY ("branchId", "departmentId") REFERENCES "Department"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMember" ADD CONSTRAINT "DepartmentMember_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES "StaffRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A live name is unique per branch, ignoring case (an archived department frees its name).
CREATE UNIQUE INDEX "Department_live_name_key" ON "Department" ("branchId", lower("name")) WHERE "archivedAt" IS NULL;

-- A department has at most one head.
CREATE UNIQUE INDEX "DepartmentMember_one_head_key" ON "DepartmentMember" ("departmentId") WHERE "isHead";
