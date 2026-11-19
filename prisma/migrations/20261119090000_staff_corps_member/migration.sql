-- Task 0111 (task 0101 D5): an NYSC corps member flag and a title (Mr, Mrs, Dr…) on a staff record. Both additive: every existing record is "not a corps member" and has no title
-- until an administrator sets them. (The job title and the qualification already had columns: `designation`, `qualification`.)
ALTER TABLE "StaffRecord" ADD COLUMN "corpsMember" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StaffRecord" ADD COLUMN "title" TEXT;
