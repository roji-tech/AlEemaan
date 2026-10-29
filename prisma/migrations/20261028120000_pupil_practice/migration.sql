-- CreateEnum
CREATE TYPE "PracticeFeedbackMode" AS ENUM ('EACH', 'END');

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "subjectLabel" TEXT,
    "subjectKey" TEXT,
    "topic" TEXT,
    "size" INTEGER NOT NULL,
    "feedbackMode" "PracticeFeedbackMode" NOT NULL DEFAULT 'EACH',
    "itemIds" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bankItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "answer" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSession_branchId_id_key" ON "PracticeSession"("branchId", "id");

-- CreateIndex
CREATE INDEX "PracticeSession_branchId_studentId_idx" ON "PracticeSession"("branchId", "studentId");

-- CreateIndex
CREATE INDEX "PracticeSession_branchId_studentId_startedAt_idx" ON "PracticeSession"("branchId", "studentId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_branchId_id_key" ON "PracticeAttempt"("branchId", "id");

-- CreateIndex
CREATE INDEX "PracticeAttempt_branchId_sessionId_idx" ON "PracticeAttempt"("branchId", "sessionId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_branchId_studentId_idx" ON "PracticeAttempt"("branchId", "studentId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_branchId_studentId_archivedAt_idx" ON "PracticeAttempt"("branchId", "studentId", "archivedAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_branchId_bankItemId_idx" ON "PracticeAttempt"("branchId", "bankItemId");

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_branchId_sessionId_fkey" FOREIGN KEY ("branchId", "sessionId") REFERENCES "PracticeSession"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
