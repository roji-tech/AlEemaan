-- Programs, slice P3b (task 0043, section 8.11): assessments of a program - a dated sitting with a maximum, scores for the people in the groups it is given to, optional grade bands,
-- and an append-only history of every score.
--
-- ADDITIVE ONLY: two columns on Program (the program's own switch, default OFF, and the grade bands), two enums, four tables. Nothing that exists is changed, and the release before this one
-- never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session.
-- Run it after 20261106090000_program_attendance.

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "assessmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "gradeBands" JSONB;

-- CreateEnum
CREATE TYPE "ProgramAssessmentStatus" AS ENUM ('DRAFT', 'OPEN', 'MARKED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramScoreCode" AS ENUM ('ABSENT', 'EXCUSED', 'EXEMPT', 'NOT_SITTING');

-- CreateTable
CREATE TABLE "ProgramAssessment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "maxScore" DECIMAL(7,2) NOT NULL,
    "passMark" DECIMAL(7,2),
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProgramAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: the groups an assessment is given to; none means the whole program.
CREATE TABLE "ProgramAssessmentGroup" (
    "assessmentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,

    CONSTRAINT "ProgramAssessmentGroup_pkey" PRIMARY KEY ("assessmentId","groupId")
);

-- CreateTable
CREATE TABLE "ProgramScore" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "score" DECIMAL(7,2),
    "code" "ProgramScoreCode",
    "comment" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable: no foreign keys on purpose (the history outlives what it is about).
CREATE TABLE "ProgramScoreChange" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "beforeScore" DECIMAL(7,2),
    "beforeCode" "ProgramScoreCode",
    "afterScore" DECIMAL(7,2),
    "afterCode" "ProgramScoreCode",
    "reason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramScoreChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAssessment_programId_id_key" ON "ProgramAssessment"("programId", "id");
CREATE INDEX "ProgramAssessment_programId_status_idx" ON "ProgramAssessment"("programId", "status");
CREATE INDEX "ProgramAssessmentGroup_groupId_idx" ON "ProgramAssessmentGroup"("groupId");
CREATE UNIQUE INDEX "ProgramScore_assessmentId_participantId_key" ON "ProgramScore"("assessmentId", "participantId");
CREATE INDEX "ProgramScore_programId_participantId_idx" ON "ProgramScore"("programId", "participantId");
CREATE INDEX "ProgramScore_programId_branchId_idx" ON "ProgramScore"("programId", "branchId");
CREATE INDEX "ProgramScoreChange_programId_assessmentId_idx" ON "ProgramScoreChange"("programId", "assessmentId");
CREATE INDEX "ProgramScoreChange_participantId_createdAt_idx" ON "ProgramScoreChange"("participantId", "createdAt");

-- AddForeignKey: an assessment of THIS program; its groups and scores belong to the same program.
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramAssessmentGroup" ADD CONSTRAINT "ProgramAssessmentGroup_programId_assessmentId_fkey" FOREIGN KEY ("programId", "assessmentId") REFERENCES "ProgramAssessment"("programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramAssessmentGroup" ADD CONSTRAINT "ProgramAssessmentGroup_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES "ProgramGroup"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_programId_assessmentId_fkey" FOREIGN KEY ("programId", "assessmentId") REFERENCES "ProgramAssessment"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES "ProgramParticipant"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_title_check" CHECK (char_length("title") BETWEEN 1 AND 120 AND "title" = btrim("title"));
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_kind_check" CHECK (char_length("kind") <= 40);
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_max_check" CHECK ("maxScore" > 0 AND "maxScore" <= 1000);
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_pass_check" CHECK ("passMark" IS NULL OR ("passMark" >= 0 AND "passMark" <= "maxScore"));
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_weight_check" CHECK ("weight" > 0 AND "weight" <= 100);
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_published_check" CHECK (("status" = 'PUBLISHED') = ("publishedAt" IS NOT NULL) OR "status" = 'ARCHIVED');
-- A score is a number or a code, never both and never neither.
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_one_of_check" CHECK (("score" IS NOT NULL) <> ("code" IS NOT NULL));
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1000));
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_comment_check" CHECK (coalesce(char_length("comment"), 0) <= 500);
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_version_check" CHECK ("version" >= 1);
ALTER TABLE "ProgramScoreChange" ADD CONSTRAINT "ProgramScoreChange_reason_check" CHECK (coalesce(char_length("reason"), 0) <= 500);
ALTER TABLE "Program" ADD CONSTRAINT "Program_gradeBands_check" CHECK ("gradeBands" IS NULL OR jsonb_typeof("gradeBands") = 'array');

-- Append-only: no row of the score history is ever changed or removed (TRUNCATE, which a test database uses to start clean, is not a row operation and is not affected).
CREATE FUNCTION "program_score_change_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProgramScoreChange is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgramScoreChange_append_only" BEFORE UPDATE OR DELETE ON "ProgramScoreChange" FOR EACH ROW EXECUTE FUNCTION "program_score_change_append_only"();
