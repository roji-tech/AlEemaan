-- Programs, slice P2 (task 0043, section 9): the people of a program, step 2 of 2 (step 1 is 20261105090000_standing_participant_subject).
--
-- ADDITIVE ONLY: two enums, one new table, one new column on StandingEvent, a unique index on ProgramGroup that only adds a guarantee (a group id is already unique on its own),
-- and constraints that keep the new table sensible even if a caller forgets to. Nothing that exists is changed in a way an earlier release would notice: the release before this
-- one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The one constraint that is replaced (StandingEvent_subject_check, StandingEvent_action_check)
-- is made wider, and every row that exists satisfies the new one.

-- CreateEnum
CREATE TYPE "ParticipantKind" AS ENUM ('STUDENT', 'STAFF', 'GUARDIAN', 'ADULT', 'CHILD');

-- CreateEnum
CREATE TYPE "ProgramPlaceStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'COMPLETED');

-- CreateIndex: lets a participant point at a group OF ITS OWN PROGRAM with a composite key (the database then refuses a group of another program).
CREATE UNIQUE INDEX "ProgramGroup_programId_id_key" ON "ProgramGroup"("programId", "id");

-- AlterTable
ALTER TABLE "StandingEvent" ADD COLUMN "participantId" TEXT;

-- CreateIndex
CREATE INDEX "StandingEvent_participantId_createdAt_idx" ON "StandingEvent"("participantId", "createdAt");

-- CreateTable
CREATE TABLE "ProgramParticipant" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "ParticipantKind" NOT NULL,
    "studentId" TEXT,
    "staffRecordId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "gender" "Gender",
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "groupId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "ProgramPlaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedOn" DATE NOT NULL,
    "endedOn" DATE,
    "endedReason" TEXT,
    "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
    "standingUntil" DATE,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_studentId_key" ON "ProgramParticipant"("programId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_staffRecordId_key" ON "ProgramParticipant"("programId", "staffRecordId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_programId_status_idx" ON "ProgramParticipant"("programId", "status");

-- CreateIndex
CREATE INDEX "ProgramParticipant_programId_groupId_idx" ON "ProgramParticipant"("programId", "groupId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_programId_branchId_idx" ON "ProgramParticipant"("programId", "branchId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_studentId_idx" ON "ProgramParticipant"("studentId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_staffRecordId_idx" ON "ProgramParticipant"("staffRecordId");

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: a group of THIS program.
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES "ProgramGroup"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: a branch the program RUNS IN (so a branch cannot be unlinked while people are in the program through it).
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_programId_branchId_fkey" FOREIGN KEY ("programId", "branchId") REFERENCES "ProgramBranch"("programId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: a pupil or a member of staff is in the program through the branch of their own record, and the database refuses any other.
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES "StaffRecord"("branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express. A pupil or a member of staff is LINKED (their name and birth date live on the school's record, so none are copied here); everyone else is typed in and
-- needs a first and a last name; a child also needs a birth date and a guardian's name and phone (a NULL passes a CHECK, so each is tested with coalesce).
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_kind_check" CHECK (
  ("kind" = 'STUDENT' AND "studentId" IS NOT NULL AND "staffRecordId" IS NULL
     AND "firstName" IS NULL AND "lastName" IS NULL AND "gender" IS NULL AND "dateOfBirth" IS NULL AND "phone" IS NULL AND "email" IS NULL AND "guardianName" IS NULL AND "guardianPhone" IS NULL)
  OR ("kind" = 'STAFF' AND "staffRecordId" IS NOT NULL AND "studentId" IS NULL
     AND "firstName" IS NULL AND "lastName" IS NULL AND "gender" IS NULL AND "dateOfBirth" IS NULL AND "phone" IS NULL AND "email" IS NULL AND "guardianName" IS NULL AND "guardianPhone" IS NULL)
  OR ("kind" IN ('GUARDIAN', 'ADULT', 'CHILD') AND "studentId" IS NULL AND "staffRecordId" IS NULL
     AND coalesce(char_length(btrim("firstName")), 0) > 0 AND coalesce(char_length(btrim("lastName")), 0) > 0)
);
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_child_check" CHECK (
  "kind" <> 'CHILD' OR ("dateOfBirth" IS NOT NULL AND coalesce(char_length(btrim("guardianName")), 0) > 0 AND coalesce(char_length(btrim("guardianPhone")), 0) > 0)
);
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_length_check" CHECK (
  coalesce(char_length("firstName"), 0) <= 60 AND coalesce(char_length("lastName"), 0) <= 60 AND coalesce(char_length("phone"), 0) <= 30
  AND coalesce(char_length("guardianPhone"), 0) <= 30 AND coalesce(char_length("email"), 0) <= 120 AND coalesce(char_length("guardianName"), 0) <= 120
  AND coalesce(char_length("endedReason"), 0) <= 500
);
-- Standing on the row itself counts only for a person with no school record (a linked person's standing lives on the school's record and nowhere else); such a person is active,
-- suspended or expelled, and only a suspension has an end date.
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_standing_check" CHECK (
  "standing" IN ('ACTIVE', 'SUSPENDED', 'EXPELLED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED')
  AND ("kind" IN ('GUARDIAN', 'ADULT', 'CHILD') OR ("standing" = 'ACTIVE' AND "standingUntil" IS NULL))
);
-- A place that is still active has not ended, and an end is never before the start.
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_dates_check" CHECK (
  ("endedOn" IS NULL OR "endedOn" >= "joinedOn") AND ("status" <> 'ACTIVE' OR "endedOn" IS NULL)
);

-- The history of standing gains the subject PARTICIPANT (no foreign key, like the rest of it: the history outlives what it is about).
ALTER TABLE "StandingEvent" DROP CONSTRAINT "StandingEvent_subject_check";
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_subject_check" CHECK (
  ("subject" = 'STUDENT' AND "studentId" IS NOT NULL AND "staffRecordId" IS NULL AND "membershipId" IS NULL AND "participantId" IS NULL)
  OR ("subject" = 'STAFF' AND "studentId" IS NULL AND ("staffRecordId" IS NOT NULL OR "membershipId" IS NOT NULL) AND "participantId" IS NULL)
  OR ("subject" = 'PARTICIPANT' AND "participantId" IS NOT NULL AND "studentId" IS NULL AND "staffRecordId" IS NULL AND "membershipId" IS NULL)
);
ALTER TABLE "StandingEvent" DROP CONSTRAINT "StandingEvent_action_check";
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_action_check" CHECK (
  ("action" <> 'EXPELLED' OR "subject" IN ('STUDENT', 'PARTICIPANT')) AND ("action" <> 'TERMINATED' OR "subject" = 'STAFF')
);
