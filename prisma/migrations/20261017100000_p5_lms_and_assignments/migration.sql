
-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'RESUBMIT_REQUESTED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "classArmId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "dueDate" TIMESTAMP(3),
    "totalPoints" INTEGER NOT NULL DEFAULT 100,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "allowLate" BOOLEAN NOT NULL DEFAULT true,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningMaterial" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "timeLimitMinutes" INTEGER,
    "passingScore" DOUBLE PRECISION,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPassed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_branchId_subjectId_idx" ON "Assignment"("branchId", "subjectId");

-- CreateIndex
CREATE INDEX "Assignment_branchId_classGroupId_idx" ON "Assignment"("branchId", "classGroupId");

-- CreateIndex
CREATE INDEX "Assignment_branchId_classArmId_idx" ON "Assignment"("branchId", "classArmId");

-- CreateIndex
CREATE INDEX "Assignment_branchId_status_idx" ON "Assignment"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_branchId_id_key" ON "Assignment"("branchId", "id");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_branchId_assignmentId_idx" ON "AssignmentSubmission"("branchId", "assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_branchId_studentId_idx" ON "AssignmentSubmission"("branchId", "studentId");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_branchId_status_idx" ON "AssignmentSubmission"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_branchId_id_key" ON "AssignmentSubmission"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_branchId_assignmentId_studentId_key" ON "AssignmentSubmission"("branchId", "assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "LearningMaterial_branchId_subjectId_idx" ON "LearningMaterial"("branchId", "subjectId");

-- CreateIndex
CREATE INDEX "LearningMaterial_branchId_classGroupId_idx" ON "LearningMaterial"("branchId", "classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningMaterial_branchId_id_key" ON "LearningMaterial"("branchId", "id");

-- CreateIndex
CREATE INDEX "Quiz_branchId_subjectId_idx" ON "Quiz"("branchId", "subjectId");

-- CreateIndex
CREATE INDEX "Quiz_branchId_status_idx" ON "Quiz"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_branchId_id_key" ON "Quiz"("branchId", "id");

-- CreateIndex
CREATE INDEX "QuizQuestion_branchId_quizId_idx" ON "QuizQuestion"("branchId", "quizId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestion_branchId_id_key" ON "QuizQuestion"("branchId", "id");

-- CreateIndex
CREATE INDEX "QuizAttempt_branchId_quizId_idx" ON "QuizAttempt"("branchId", "quizId");

-- CreateIndex
CREATE INDEX "QuizAttempt_branchId_studentId_idx" ON "QuizAttempt"("branchId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_branchId_id_key" ON "QuizAttempt"("branchId", "id");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES "ClassArm"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_branchId_createdById_fkey" FOREIGN KEY ("branchId", "createdById") REFERENCES "StaffRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_branchId_assignmentId_fkey" FOREIGN KEY ("branchId", "assignmentId") REFERENCES "Assignment"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_branchId_gradedById_fkey" FOREIGN KEY ("branchId", "gradedById") REFERENCES "StaffRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_branchId_createdById_fkey" FOREIGN KEY ("branchId", "createdById") REFERENCES "StaffRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_branchId_createdById_fkey" FOREIGN KEY ("branchId", "createdById") REFERENCES "StaffRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_branchId_quizId_fkey" FOREIGN KEY ("branchId", "quizId") REFERENCES "Quiz"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_branchId_quizId_fkey" FOREIGN KEY ("branchId", "quizId") REFERENCES "Quiz"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

