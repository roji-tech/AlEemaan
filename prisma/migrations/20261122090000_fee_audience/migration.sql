-- CreateEnum
CREATE TYPE "FeeAdmission" AS ENUM ('NEW', 'RETURNING');

-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN     "audienceAdmission" "FeeAdmission",
ADD COLUMN     "audienceGender" "Gender",
ADD COLUMN     "audienceResidence" "Residence",
ADD COLUMN     "optional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scholarshipCovers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackHandover" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StudentFeeOptOut" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "note" TEXT,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentFeeOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeItemHandover" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "receivedByUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeItemHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentFeeOptOut_branchId_feeStructureId_idx" ON "StudentFeeOptOut"("branchId", "feeStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeOptOut_branchId_id_key" ON "StudentFeeOptOut"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeOptOut_studentId_feeStructureId_key" ON "StudentFeeOptOut"("studentId", "feeStructureId");

-- CreateIndex
CREATE INDEX "FeeItemHandover_branchId_feeStructureId_idx" ON "FeeItemHandover"("branchId", "feeStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeItemHandover_branchId_id_key" ON "FeeItemHandover"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeItemHandover_studentId_feeStructureId_key" ON "FeeItemHandover"("studentId", "feeStructureId");

-- AddForeignKey
ALTER TABLE "StudentFeeOptOut" ADD CONSTRAINT "StudentFeeOptOut_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeOptOut" ADD CONSTRAINT "StudentFeeOptOut_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeOptOut" ADD CONSTRAINT "StudentFeeOptOut_branchId_feeStructureId_fkey" FOREIGN KEY ("branchId", "feeStructureId") REFERENCES "FeeStructure"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeItemHandover" ADD CONSTRAINT "FeeItemHandover_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeItemHandover" ADD CONSTRAINT "FeeItemHandover_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeItemHandover" ADD CONSTRAINT "FeeItemHandover_branchId_feeStructureId_fkey" FOREIGN KEY ("branchId", "feeStructureId") REFERENCES "FeeStructure"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

