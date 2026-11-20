-- The name a branch prints in its report-card header (task 0116, found in the preview of 2026-11-20): the nursery card says "Nursery and Primary School" while the secondary cards say "School of
-- Science and Arabic Studies". Additive and nullable: null means the school's name, so nothing changes until a branch sets one. Nothing is backfilled.
ALTER TABLE "BranchProfile" ADD COLUMN "schoolName" TEXT;
