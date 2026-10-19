-- A school-wide scheme and a teacher's own scheme (P2e) are stored on a branch's AssessmentScheme row (the table needs a branch) but they are not THAT branch's
-- default. The "one live scheme per branch and class" rule counted them, so creating a school-wide scheme, a second one, or approving a teacher's scheme failed with a
-- unique violation in any branch that already had its own default. `hosted` marks such rows; the rule now ignores them. Additive: a new column with a default, and the
-- index is rebuilt on the same columns with one more condition. Run BEFORE the code.
ALTER TABLE "AssessmentScheme" ADD COLUMN "hosted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AssessmentScheme" s
SET "hosted" = true
WHERE EXISTS (
  SELECT 1 FROM "AssessmentSchemeScope" sc
  WHERE sc."schemeId" = s."id" AND sc."level" IN ('GLOBAL', 'TEACHER_SUBJECT')
);

DROP INDEX "AssessmentScheme_one_live_per_scope";
CREATE UNIQUE INDEX "AssessmentScheme_one_live_per_scope"
  ON "AssessmentScheme"("branchId", COALESCE("classGroupId", ''))
  WHERE "archivedAt" IS NULL AND NOT "hosted";
