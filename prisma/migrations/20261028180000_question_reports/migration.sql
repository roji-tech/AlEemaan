-- Question Reports (Task 0032 slice 5; design note §8.5)
-- ADDITIVE and safe on the live school: two enums and one new table.
-- Relations on Branch, User, StudentRecord, and QuestionBankItem produce no SQL modifications to existing tables.

-- CreateEnum
CREATE TYPE "QuestionReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "QuestionReportOutcome" AS ENUM ('FIXED', 'NOT_AN_ERROR', 'NEEDS_DISCUSSION');

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "itemId" TEXT NOT NULL,
    "itemVersion" INTEGER NOT NULL,
    "reporterRole" TEXT NOT NULL,
    "reporterSection" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterStudentId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "QuestionReportStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" "QuestionReportOutcome",
    "outcomeReason" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionReport_branchId_status_idx" ON "QuestionReport"("branchId", "status");

-- CreateIndex
CREATE INDEX "QuestionReport_itemId_status_idx" ON "QuestionReport"("itemId", "status");

-- CreateIndex
CREATE INDEX "QuestionReport_reporterUserId_idx" ON "QuestionReport"("reporterUserId");

-- CreateIndex
CREATE INDEX "QuestionReport_reporterStudentId_idx" ON "QuestionReport"("reporterStudentId");

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reporterStudentId_fkey" FOREIGN KEY ("reporterStudentId") REFERENCES "StudentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row rules
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reason_sane" CHECK (
  length(btrim("reason", E' \t\r\n\f\v\u00a0')) >= 5 AND length("reason") <= 1000
);

ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_role_sane" CHECK (
  "reporterRole" IN ('TEACHER', 'PUPIL')
);

ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolution_sane" CHECK (
  ("status" = 'OPEN' AND "resolvedAt" IS NULL AND "outcome" IS NULL)
  OR ("status" <> 'OPEN' AND "resolvedAt" IS NOT NULL)
);
