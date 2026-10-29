-- CreateEnum
CREATE TYPE "PrintTargetKind" AS ENUM ('QUESTION_BANK_ITEM', 'FORM', 'QUIZ', 'PRACTICE_SESSION', 'FORM_RESPONSE');

-- CreateTable
CREATE TABLE "QuestionBankPrintLog" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "targetKind" "PrintTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "watermark" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "reason" VARCHAR(500),
    "recipientStudentId" TEXT,
    "ipAddress" VARCHAR(100),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankPrintLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankPrintLog_branchId_id_key" ON "QuestionBankPrintLog"("branchId", "id");
CREATE INDEX "QuestionBankPrintLog_branchId_targetKind_targetId_idx" ON "QuestionBankPrintLog"("branchId", "targetKind", "targetId");
CREATE INDEX "QuestionBankPrintLog_branchId_userId_idx" ON "QuestionBankPrintLog"("branchId", "userId");
CREATE INDEX "QuestionBankPrintLog_branchId_studentId_idx" ON "QuestionBankPrintLog"("branchId", "studentId");
CREATE INDEX "QuestionBankPrintLog_branchId_recipientStudentId_idx" ON "QuestionBankPrintLog"("branchId", "recipientStudentId");
CREATE INDEX "QuestionBankPrintLog_branchId_createdAt_idx" ON "QuestionBankPrintLog"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_branchId_recipientStudentId_fkey" FOREIGN KEY ("branchId", "recipientStudentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_pageCount_check" CHECK ("pageCount" >= 1);
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_title_len" CHECK (char_length("title") >= 1 AND char_length("title") <= 255);
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_watermark_len" CHECK (char_length("watermark") >= 1);

-- Trigger: append-only audit
CREATE TRIGGER "QuestionBankPrintLog_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankPrintLog" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
