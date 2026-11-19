-- Task 0101 D1 (batch 3a): draft staff and draft pupils. A draft is saved unfinished and is left out of everything that counts or acts on people until it is completed.
-- Additive: two boolean columns with a default of false (every existing record stays a normal record) and one index each.

-- AlterTable
ALTER TABLE "StaffRecord" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentRecord" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "StaffRecord_branchId_isDraft_idx" ON "StaffRecord"("branchId", "isDraft");

-- CreateIndex
CREATE INDEX "StudentRecord_branchId_isDraft_idx" ON "StudentRecord"("branchId", "isDraft");
