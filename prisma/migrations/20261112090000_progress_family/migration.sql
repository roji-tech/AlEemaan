-- Progress records, slice R3 (task 0044): what pupils and guardians see, and the record that a week was seen.
--
-- ADDITIVE ONLY: three columns on Program (the pupil's view and the guardian's view default ON, as the maintainer decided; the guardian sees a SUMMARY), one enum, one table.
-- The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261111090000_progress_verification.

-- CreateEnum
CREATE TYPE "ProgressGuardianDetail" AS ENUM ('SUMMARY', 'FULL');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "progressGuardianDetail" "ProgressGuardianDetail" NOT NULL DEFAULT 'SUMMARY',
ADD COLUMN "progressGuardianView" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "progressStudentView" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProgressSeen" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSeen_recordId_actor_weekStart_key" ON "ProgressSeen"("recordId", "actor", "weekStart");

-- AddForeignKey
ALTER TABLE "ProgressSeen" ADD CONSTRAINT "ProgressSeen_programId_recordId_fkey" FOREIGN KEY ("programId", "recordId") REFERENCES "ProgressRecord"("programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "ProgressSeen" ADD CONSTRAINT "ProgressSeen_actor_check" CHECK ("actor" IN ('PUPIL', 'GUARDIAN'));
