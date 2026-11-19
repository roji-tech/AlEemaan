-- Task 0114: inviting staff from their records, and one person's records in several branches. Additive: two nullable columns and their indexes.
ALTER TABLE "Invitation" ADD COLUMN "staffRecordId" TEXT;
ALTER TABLE "StaffRecord" ADD COLUMN "personId" TEXT;

CREATE INDEX "Invitation_staffRecordId_idx" ON "Invitation"("staffRecordId");
CREATE INDEX "StaffRecord_personId_idx" ON "StaffRecord"("personId");

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "StaffRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
