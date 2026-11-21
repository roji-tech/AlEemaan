-- AlterTable
ALTER TABLE "ResultTemplateUse" ADD COLUMN     "snapshot" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastBranchId" TEXT;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "departmentId" TEXT;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_branchId_departmentId_fkey" FOREIGN KEY ("branchId", "departmentId") REFERENCES "Department"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

