-- Additive migration for Manual Marking foundation (Task 0032 Slice 9)

-- CreateEnum
CREATE TYPE "FormMarkingMethod" AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE "FormMarkingStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PARTIALLY_MARKED', 'MARKED');

-- AlterTable FormQuestion
ALTER TABLE "FormQuestion" ADD COLUMN "markingMethod" "FormMarkingMethod" NOT NULL DEFAULT 'AUTO';

-- AlterTable FormResponse
ALTER TABLE "FormResponse" ADD COLUMN "markingStatus" "FormMarkingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "markedById" TEXT,
ADD COLUMN "markedAt" TIMESTAMP(3);

-- AlterTable FormAnswer
ALTER TABLE "FormAnswer" ADD COLUMN "markingStatus" "FormMarkingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "markedById" TEXT,
ADD COLUMN "markedAt" TIMESTAMP(3),
ADD COLUMN "feedback" TEXT;

-- CreateTable FormMarkingAudit
CREATE TABLE "FormMarkingAudit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "answerId" TEXT,
    "formId" TEXT NOT NULL,
    "studentId" TEXT,
    "scoreAwarded" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "feedback" VARCHAR(2000),
    "action" VARCHAR(50) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormMarkingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormMarkingAudit_branchId_id_key" ON "FormMarkingAudit"("branchId", "id");
CREATE INDEX "FormMarkingAudit_branchId_responseId_idx" ON "FormMarkingAudit"("branchId", "responseId");
CREATE INDEX "FormMarkingAudit_branchId_answerId_idx" ON "FormMarkingAudit"("branchId", "answerId");
CREATE INDEX "FormMarkingAudit_branchId_formId_idx" ON "FormMarkingAudit"("branchId", "formId");
CREATE INDEX "FormMarkingAudit_branchId_createdAt_idx" ON "FormMarkingAudit"("branchId", "createdAt");

CREATE INDEX "FormResponse_branchId_formId_markingStatus_idx" ON "FormResponse"("branchId", "formId", "markingStatus");
CREATE INDEX "FormAnswer_branchId_markingStatus_idx" ON "FormAnswer"("branchId", "markingStatus");

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_branchId_responseId_fkey" FOREIGN KEY ("branchId", "responseId") REFERENCES "FormResponse"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_branchId_answerId_fkey" FOREIGN KEY ("branchId", "answerId") REFERENCES "FormAnswer"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_action_len" CHECK (char_length("action") >= 1 AND char_length("action") <= 50);
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_feedback_len" CHECK ("feedback" IS NULL OR char_length("feedback") <= 2000);
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_score_valid" CHECK ("scoreAwarded" >= 0 AND "maxScore" >= 0);

-- Trigger: append-only audit
CREATE TRIGGER "FormMarkingAudit_append_only" BEFORE UPDATE OR DELETE ON "FormMarkingAudit" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
