-- CreateEnum
CREATE TYPE "PromotionBatchStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'REVERTED');

-- CreateEnum
CREATE TYPE "PromotionDecision" AS ENUM ('PROMOTED', 'REPEATED', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DecisionMode" AS ENUM ('AUTOMATIC', 'OVERRIDDEN');

-- CreateTable
CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "targetSessionId" TEXT NOT NULL,
    "sourceClassGroupId" TEXT NOT NULL,
    "targetClassGroupId" TEXT,
    "status" "PromotionBatchStatus" NOT NULL DEFAULT 'COMMITTED',
    "passMark" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "totalEvaluated" INTEGER NOT NULL DEFAULT 0,
    "totalPromoted" INTEGER NOT NULL DEFAULT 0,
    "totalRepeated" INTEGER NOT NULL DEFAULT 0,
    "totalGraduated" INTEGER NOT NULL DEFAULT 0,
    "executedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceEnrollmentId" TEXT NOT NULL,
    "targetEnrollmentId" TEXT,
    "overallAverage" DOUBLE PRECISION,
    "termAverages" JSONB,
    "decision" "PromotionDecision" NOT NULL,
    "decisionMode" "DecisionMode" NOT NULL DEFAULT 'AUTOMATIC',
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionBatch_branchId_sourceSessionId_idx" ON "PromotionBatch"("branchId", "sourceSessionId");

-- CreateIndex
CREATE INDEX "PromotionBatch_branchId_targetSessionId_idx" ON "PromotionBatch"("branchId", "targetSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionBatch_branchId_id_key" ON "PromotionBatch"("branchId", "id");

-- CreateIndex
CREATE INDEX "PromotionRecord_batchId_idx" ON "PromotionRecord"("batchId");

-- CreateIndex
CREATE INDEX "PromotionRecord_studentId_idx" ON "PromotionRecord"("studentId");

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_targetSessionId_fkey" FOREIGN KEY ("targetSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_branchId_sourceClassGroupId_fkey" FOREIGN KEY ("branchId", "sourceClassGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_branchId_targetClassGroupId_fkey" FOREIGN KEY ("branchId", "targetClassGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PromotionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_sourceEnrollmentId_fkey" FOREIGN KEY ("sourceEnrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_targetEnrollmentId_fkey" FOREIGN KEY ("targetEnrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
