-- Progress records, slice R4 (task 0044): the display of a record in Arabic and Hijri dates.
--
-- ADDITIVE ONLY: one column on Program, the number of days the Hijri date is moved (the day the moon is sighted differs by place), default 0, from -2 to 2.
-- The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261112090000_progress_family.

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "progressHijriAdjust" INTEGER NOT NULL DEFAULT 0;

-- AddCheck
ALTER TABLE "Program" ADD CONSTRAINT "Program_progressHijriAdjust_check" CHECK ("progressHijriAdjust" BETWEEN -2 AND 2);
