-- Programs, slice P3 (task 0043, section 10): program staff with the groups they are assigned to, sessions, the roll call, and the correction history.
--
-- ADDITIVE ONLY: two columns on Program that default to "attendance on, flag below 75%", four new tables, two unique indexes that only add a guarantee (an id is already unique on its
-- own), and constraints. Nothing that exists is changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted
-- databases are migrated by the maintainer, never by an AI session. Run it after 20261105100000_program_people.

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lowAttendancePercent" INTEGER NOT NULL DEFAULT 75;

-- CreateIndex: lets a table point at a staff place or a participant OF ITS OWN PROGRAM with a composite key.
CREATE UNIQUE INDEX "ProgramStaff_programId_id_key" ON "ProgramStaff"("programId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_id_key" ON "ProgramParticipant"("programId", "id");

-- CreateTable
CREATE TABLE "ProgramStaffGroup" (
    "programStaffId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramStaffGroup_pkey" PRIMARY KEY ("programStaffId", "groupId")
);

-- CreateTable
CREATE TABLE "ProgramSession" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAttendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: no foreign keys on purpose (the history outlives what it is about), like StandingEvent.
CREATE TABLE "ProgramAttendanceChange" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "beforeStatus" "AttendanceStatus" NOT NULL,
    "afterStatus" "AttendanceStatus" NOT NULL,
    "beforeRemarks" TEXT,
    "afterRemarks" TEXT,
    "reason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAttendanceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramStaffGroup_groupId_idx" ON "ProgramStaffGroup"("groupId");

-- CreateIndex
CREATE INDEX "ProgramSession_programId_date_idx" ON "ProgramSession"("programId", "date");

-- CreateIndex: one session per program, group, day and label (an empty label counts as one value).
CREATE UNIQUE INDEX "ProgramSession_programId_groupId_date_label_key" ON "ProgramSession"("programId", "groupId", "date", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAttendance_sessionId_participantId_key" ON "ProgramAttendance"("sessionId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramAttendance_programId_participantId_idx" ON "ProgramAttendance"("programId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramAttendance_programId_branchId_idx" ON "ProgramAttendance"("programId", "branchId");

-- CreateIndex
CREATE INDEX "ProgramAttendanceChange_programId_sessionId_idx" ON "ProgramAttendanceChange"("programId", "sessionId");

-- CreateIndex
CREATE INDEX "ProgramAttendanceChange_participantId_createdAt_idx" ON "ProgramAttendanceChange"("participantId", "createdAt");

-- AddForeignKey: a staff place of THIS program, and a group of THIS program.
ALTER TABLE "ProgramStaffGroup" ADD CONSTRAINT "ProgramStaffGroup_programId_programStaffId_fkey" FOREIGN KEY ("programId", "programStaffId") REFERENCES "ProgramStaff"("programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStaffGroup" ADD CONSTRAINT "ProgramStaffGroup_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES "ProgramGroup"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES "ProgramGroup"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgramSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: a participant of THIS program.
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES "ProgramParticipant"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "Program" ADD CONSTRAINT "Program_lowAttendancePercent_check" CHECK ("lowAttendancePercent" BETWEEN 1 AND 100);
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_label_check" CHECK (char_length("label") <= 40 AND "label" = btrim("label"));
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_remarks_check" CHECK (coalesce(char_length("remarks"), 0) <= 200);
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_version_check" CHECK ("version" >= 1);
ALTER TABLE "ProgramAttendanceChange" ADD CONSTRAINT "ProgramAttendanceChange_reason_check" CHECK (coalesce(char_length("reason"), 0) <= 500);

-- Append-only: no row of the correction history is ever changed or removed (TRUNCATE, which a test database uses to start clean, is not a row operation and is not affected).
CREATE FUNCTION "program_attendance_change_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProgramAttendanceChange is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgramAttendanceChange_append_only" BEFORE UPDATE OR DELETE ON "ProgramAttendanceChange" FOR EACH ROW EXECUTE FUNCTION "program_attendance_change_append_only"();
