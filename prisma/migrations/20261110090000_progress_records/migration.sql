-- Progress records, slice R1 (task 0044): a running log kept for each person in a program - the template a program uses, one record per place, dated entries, and an append-only
-- history of every save.
--
-- ADDITIVE ONLY: two columns on Program (the program's own switch, default OFF, and the preset it uses), one enum, four tables. Nothing that exists is changed, and the release before this
-- one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session.
-- Run it after 20261109090000_program_completion.

-- CreateEnum
CREATE TYPE "ProgressEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "progressEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "progressTemplate" TEXT;

-- CreateTable
CREATE TABLE "ProgressTemplate" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schema" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEntry" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "values" JSONB NOT NULL,
    "status" "ProgressEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "lastEditedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "returnComment" TEXT,
    "publishedValues" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEntryRevision" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beforeValues" JSONB,
    "afterValues" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTemplate_programId_key_version_key" ON "ProgressTemplate"("programId", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTemplate_programId_id_key" ON "ProgressTemplate"("programId", "id");

-- CreateIndex
CREATE INDEX "ProgressRecord_programId_idx" ON "ProgressRecord"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_participantId_key" ON "ProgressRecord"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_programId_participantId_key" ON "ProgressRecord"("programId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_programId_id_key" ON "ProgressRecord"("programId", "id");

-- CreateIndex
CREATE INDEX "ProgressEntry_recordId_trackKey_entryDate_idx" ON "ProgressEntry"("recordId", "trackKey", "entryDate");

-- CreateIndex
CREATE INDEX "ProgressEntry_programId_status_idx" ON "ProgressEntry"("programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEntry_programId_id_key" ON "ProgressEntry"("programId", "id");

-- CreateIndex
CREATE INDEX "ProgressEntryRevision_entryId_createdAt_idx" ON "ProgressEntryRevision"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressEntryRevision_programId_createdAt_idx" ON "ProgressEntryRevision"("programId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProgressTemplate" ADD CONSTRAINT "ProgressTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES "ProgramParticipant"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_programId_templateId_fkey" FOREIGN KEY ("programId", "templateId") REFERENCES "ProgressTemplate"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_programId_recordId_fkey" FOREIGN KEY ("programId", "recordId") REFERENCES "ProgressRecord"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "ProgressTemplate" ADD CONSTRAINT "ProgressTemplate_key_check" CHECK (char_length("key") BETWEEN 1 AND 40 AND "version" >= 1 AND jsonb_typeof("schema") = 'object');
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_profile_check" CHECK (jsonb_typeof("profile") = 'object' AND "version" >= 1);
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_values_check" CHECK (jsonb_typeof("values") = 'object' AND char_length("trackKey") BETWEEN 1 AND 40 AND "version" >= 1);
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_return_check" CHECK (coalesce(char_length("returnComment"), 0) <= 300);
-- A verified entry always has its verifier, its time and the copy families see.
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_verified_check" CHECK ("status" <> 'VERIFIED' OR ("publishedValues" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL));
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_published_check" CHECK ("publishedValues" IS NULL OR jsonb_typeof("publishedValues") = 'object');
ALTER TABLE "ProgressEntryRevision" ADD CONSTRAINT "ProgressEntryRevision_note_check" CHECK (coalesce(char_length("note"), 0) <= 300 AND char_length("action") BETWEEN 1 AND 30);

-- Append-only: a template is never changed (a change would be a new version) and no row of the history is ever changed or removed. TRUNCATE, which a test database uses to start clean, is not a row operation.
CREATE FUNCTION "progress_template_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProgressTemplate is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProgressTemplate_immutable" BEFORE UPDATE OR DELETE ON "ProgressTemplate" FOR EACH ROW EXECUTE FUNCTION "progress_template_immutable"();

CREATE FUNCTION "progress_entry_revision_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProgressEntryRevision is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProgressEntryRevision_append_only" BEFORE UPDATE OR DELETE ON "ProgressEntryRevision" FOR EACH ROW EXECUTE FUNCTION "progress_entry_revision_append_only"();
