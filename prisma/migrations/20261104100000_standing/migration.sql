-- Standing (task 0045): suspension, expulsion and termination on the school's own records.
--
-- ADDITIVE ONLY: four new enums, one enum value (EnrollmentStatus EXPELLED), seven new columns that all default to "nothing happened" (ACTIVE, no end date), and one new table.
-- No row is changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the
-- maintainer, never by an AI session.
--
-- What Prisma cannot express is added at the end: checks that keep a standing sensible even if a caller forgets to (a pupil is never "terminated", a member of staff is never
-- "expelled", only a suspension has an end date), and a trigger that makes the history append-only.

-- CreateEnum
CREATE TYPE "StandingState" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPELLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "StandingSubject" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "StandingEventAction" AS ENUM ('SUSPENDED', 'EXPELLED', 'TERMINATED', 'LIFTED', 'REINSTATED');

-- CreateEnum
CREATE TYPE "StandingScope" AS ENUM ('BRANCH', 'SCHOOL');

-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'EXPELLED';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "standingUntil" DATE;

-- AlterTable
ALTER TABLE "StaffRecord" ADD COLUMN     "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "standingUntil" DATE;

-- AlterTable
ALTER TABLE "StudentRecord" ADD COLUMN     "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "standingUntil" DATE;

-- CreateTable
CREATE TABLE "StandingEvent" (
    "id" TEXT NOT NULL,
    "subject" "StandingSubject" NOT NULL,
    "studentId" TEXT,
    "staffRecordId" TEXT,
    "membershipId" TEXT,
    "userId" TEXT,
    "branchId" TEXT NOT NULL,
    "action" "StandingEventAction" NOT NULL,
    "scope" "StandingScope" NOT NULL DEFAULT 'BRANCH',
    "reason" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandingEvent_studentId_createdAt_idx" ON "StandingEvent"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StandingEvent_staffRecordId_createdAt_idx" ON "StandingEvent"("staffRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "StandingEvent_membershipId_createdAt_idx" ON "StandingEvent"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "StandingEvent_branchId_createdAt_idx" ON "StandingEvent"("branchId", "createdAt");

-- A pupil is active, suspended or expelled; a member of staff (and a membership) is active, suspended or terminated; only a suspension has an end date.
ALTER TABLE "StudentRecord" ADD CONSTRAINT "StudentRecord_standing_check" CHECK ("standing" IN ('ACTIVE', 'SUSPENDED', 'EXPELLED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED'));
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_standing_check" CHECK ("standing" IN ('ACTIVE', 'SUSPENDED', 'TERMINATED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED'));
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_standing_check" CHECK ("standing" IN ('ACTIVE', 'SUSPENDED', 'TERMINATED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED'));

-- The history: a reason of 3 to 500 characters, a subject that matches the ids it carries, and an action that fits its subject.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_reason_check" CHECK (char_length("reason") BETWEEN 3 AND 500);
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_subject_check" CHECK (
  ("subject" = 'STUDENT' AND "studentId" IS NOT NULL AND "staffRecordId" IS NULL AND "membershipId" IS NULL)
  OR ("subject" = 'STAFF' AND "studentId" IS NULL AND ("staffRecordId" IS NOT NULL OR "membershipId" IS NOT NULL))
);
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_action_check" CHECK (("action" <> 'EXPELLED' OR "subject" = 'STUDENT') AND ("action" <> 'TERMINATED' OR "subject" = 'STAFF'));

-- Append-only: no row of the history is ever changed or removed (TRUNCATE, which a test database uses to start clean, is not a row operation and is not affected).
CREATE FUNCTION "standing_event_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StandingEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StandingEvent_append_only" BEFORE UPDATE OR DELETE ON "StandingEvent" FOR EACH ROW EXECUTE FUNCTION "standing_event_append_only"();
