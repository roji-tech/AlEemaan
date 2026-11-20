-- Task 0116 D15: a grade scale can be UNCONFIRMED. The junior secondary card prints grade names (A Excellent, B Good, C Average, E Fair) but no ranges, so the seeded junior scale's cut-offs are
-- a guess. While `unconfirmed` is true, results graded on the scale cannot be published (the results workflow refuses, naming where to confirm); an administrator confirms the bands, or edits
-- and saves them, and it clears. Additive: one column, false everywhere except the seeded junior scale of each branch (the senior ranges are printed on the card, so that scale is confirmed).
ALTER TABLE "GradeScale" ADD COLUMN "unconfirmed" BOOLEAN NOT NULL DEFAULT false;

-- The junior scale the previous migration seeded (id 'rts_' || md5(branch || ':scale-junior'), the same text lib/results/seed-templates.ts uses).
UPDATE "GradeScale" SET "unconfirmed" = true WHERE "id" = 'rts_' || md5("branchId" || ':scale-junior');
