-- AlterTable
ALTER TABLE "Form" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Form" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Form_shareToken_key" ON "Form"("shareToken");

-- CreateTable
CREATE TABLE "FormParticipation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormParticipation_branchId_id_key" ON "FormParticipation"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormParticipation_branchId_formId_respondentId_key" ON "FormParticipation"("branchId", "formId", "respondentId");

-- CreateIndex
CREATE INDEX "FormParticipation_branchId_formId_idx" ON "FormParticipation"("branchId", "formId");

-- CreateIndex
CREATE INDEX "FormParticipation_branchId_respondentId_idx" ON "FormParticipation"("branchId", "respondentId");

-- AddForeignKey
ALTER TABLE "FormParticipation" ADD CONSTRAINT "FormParticipation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormParticipation" ADD CONSTRAINT "FormParticipation_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES "Form"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
