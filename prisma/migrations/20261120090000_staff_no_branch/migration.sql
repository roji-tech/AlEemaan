-- Staff with no branch yet (task 0101 D3). Additive: one column loosened, one partial unique index.
-- A record with no branch belongs to nobody's branch list: only a superadmin sees or edits it, until it is placed in a branch.
-- The foreign keys keep working: a composite key with a null column is not checked, and every table that points at a staff record needs a non-null branch,
-- so a record with no branch has no assignments, class-teacher role, attendance grants, timetable slots, program places or coursework by construction.

-- AlterTable
ALTER TABLE "StaffRecord" ALTER COLUMN "branchId" DROP NOT NULL;

-- A live record's e-mail is unique per branch (StaffRecord_email_live); a null branch never collides, so unplaced records keep their own rule: unique among themselves.
CREATE UNIQUE INDEX "StaffRecord_email_unplaced" ON "StaffRecord" (lower("email")) WHERE ("branchId" IS NULL AND "email" IS NOT NULL AND "archivedAt" IS NULL);
