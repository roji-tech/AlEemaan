-- CreateEnum
CREATE TYPE "FormKind" AS ENUM ('PRACTICE_SET', 'QUESTIONNAIRE', 'PAPER_WORK');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormAudienceKind" AS ENUM ('MEMBERS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "FormResponseStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" "FormKind" NOT NULL DEFAULT 'PRACTICE_SET',
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "maxDurationMinutes" INTEGER,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Form_title_check" CHECK (char_length(btrim("title")) >= 1 AND char_length("title") <= 200)
);

-- CreateTable
CREATE TABLE "FormAudience" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "kind" "FormAudienceKind" NOT NULL DEFAULT 'MEMBERS',
    "roles" JSONB NOT NULL DEFAULT '[]',
    "classGroupIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormQuestion" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "sourceVersion" INTEGER,
    "prompt" TEXT NOT NULL,
    "questionType" "BankQuestionType" NOT NULL DEFAULT 'SINGLE',
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" TEXT,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FormQuestion_prompt_check" CHECK (char_length(btrim("prompt")) >= 1 AND char_length("prompt") <= 20000),
    CONSTRAINT "FormQuestion_points_check" CHECK ("points" >= 0)
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT,
    "studentId" TEXT,
    "status" "FormResponseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION DEFAULT 0,
    "maxScore" DOUBLE PRECISION DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FormResponse_score_check" CHECK ("score" >= 0)
);

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "formQuestionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Form_branchId_kind_status_idx" ON "Form"("branchId", "kind", "status");

-- CreateIndex
CREATE INDEX "Form_branchId_createdAt_idx" ON "Form"("branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Form_branchId_id_key" ON "Form"("branchId", "id");

-- CreateIndex
CREATE INDEX "FormAudience_branchId_formId_idx" ON "FormAudience"("branchId", "formId");

-- CreateIndex
CREATE UNIQUE INDEX "FormAudience_branchId_id_key" ON "FormAudience"("branchId", "id");

-- CreateIndex
CREATE INDEX "FormQuestion_branchId_formId_idx" ON "FormQuestion"("branchId", "formId");

-- CreateIndex
CREATE INDEX "FormQuestion_sourceItemId_idx" ON "FormQuestion"("sourceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FormQuestion_branchId_id_key" ON "FormQuestion"("branchId", "id");

-- CreateIndex
CREATE INDEX "FormResponse_branchId_formId_status_idx" ON "FormResponse"("branchId", "formId", "status");

-- CreateIndex
CREATE INDEX "FormResponse_branchId_studentId_idx" ON "FormResponse"("branchId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_branchId_id_key" ON "FormResponse"("branchId", "id");

-- CreateIndex
CREATE INDEX "FormAnswer_branchId_responseId_idx" ON "FormAnswer"("branchId", "responseId");

-- CreateIndex
CREATE INDEX "FormAnswer_branchId_formQuestionId_idx" ON "FormAnswer"("branchId", "formQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "FormAnswer_branchId_id_key" ON "FormAnswer"("branchId", "id");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAudience" ADD CONSTRAINT "FormAudience_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAudience" ADD CONSTRAINT "FormAudience_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES "Form"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES "Form"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "QuestionBankItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES "Form"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_branchId_responseId_fkey" FOREIGN KEY ("branchId", "responseId") REFERENCES "FormResponse"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_branchId_formQuestionId_fkey" FOREIGN KEY ("branchId", "formQuestionId") REFERENCES "FormQuestion"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
