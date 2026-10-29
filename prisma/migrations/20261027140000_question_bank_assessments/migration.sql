-- Task 0032 Slice 3: Use in assessments (copy on use, offer-back, template hiding)
-- Additive migration: links QuizQuestion to QuestionBankItem and adds exam template controls.

-- AlterTable Quiz
ALTER TABLE "Quiz" ADD COLUMN "isExamTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quiz" ADD COLUMN "examWindowStart" TIMESTAMP(3);
ALTER TABLE "Quiz" ADD COLUMN "examWindowEnd" TIMESTAMP(3);

-- AlterTable QuizQuestion
ALTER TABLE "QuizQuestion" ADD COLUMN "sourceItemId" TEXT;
ALTER TABLE "QuizQuestion" ADD COLUMN "sourceVersion" INTEGER;
ALTER TABLE "QuizQuestion" ADD COLUMN "exposedToPractice" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "QuizQuestion_sourceItemId_idx" ON "QuizQuestion"("sourceItemId");

-- AlterTable QuestionBankItem
ALTER TABLE "QuestionBankItem" ADD COLUMN "visibleAfterQuizId" TEXT;

-- CreateIndex
CREATE INDEX "QuestionBankItem_visibleAfterQuizId_idx" ON "QuestionBankItem"("visibleAfterQuizId");
