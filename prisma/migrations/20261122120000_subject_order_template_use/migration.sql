-- AlterTable
ALTER TABLE "SubjectOffering" ADD COLUMN     "sortOrder" INTEGER;

-- CreateTable
CREATE TABLE "ResultTemplateUse" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultTemplateUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultTemplateUse_templateId_idx" ON "ResultTemplateUse"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplateUse_branchId_periodId_classGroupId_key" ON "ResultTemplateUse"("branchId", "periodId", "classGroupId");

-- AddForeignKey
ALTER TABLE "ResultTemplateUse" ADD CONSTRAINT "ResultTemplateUse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateUse" ADD CONSTRAINT "ResultTemplateUse_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateUse" ADD CONSTRAINT "ResultTemplateUse_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateUse" ADD CONSTRAINT "ResultTemplateUse_branchId_templateId_fkey" FOREIGN KEY ("branchId", "templateId") REFERENCES "ResultTemplate"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

