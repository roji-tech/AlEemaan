-- Task 0116 (report-card sets): trait groups, traits, per-pupil per-term trait ratings and entered attendance, and the school's four printed report cards as result templates for EVERY
-- existing branch. Additive: four new tables, then rows. Nothing existing is changed and no class is placed in any new template (the maintainer places them).
--
-- 1. A rating is 1 to 5 and an entered attendance number is not negative (CHECKs; Prisma cannot express them).
-- 2. The backfill is generated from src/lib/results/seed-templates.ts by scripts/gen-report-template-sql.mjs. Ids are 'rts_' || md5(branch || ':' || what), the same text the application
--    uses when it seeds a branch made later, so running both never makes a second copy. Each insert is skipped where its id exists or a live row of the branch already has the name.
--    The grade scales are never made the branch's default scale.
--
-- Generated: the backfill part below is the output of the script; edit the data file and regenerate rather than editing it here.


-- CreateTable
CREATE TABLE "ResultTemplateTraitGroup" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "showSign" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultTemplateTraitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultTemplateTrait" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultTemplateTrait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraitRating" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "traitId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraitRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAttendance" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "timesOpen" INTEGER,
    "timesPresent" INTEGER,
    "timesAbsent" INTEGER,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultTemplateTraitGroup_templateId_idx" ON "ResultTemplateTraitGroup"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplateTraitGroup_branchId_id_key" ON "ResultTemplateTraitGroup"("branchId", "id");

-- CreateIndex
CREATE INDEX "ResultTemplateTrait_templateId_idx" ON "ResultTemplateTrait"("templateId");

-- CreateIndex
CREATE INDEX "ResultTemplateTrait_groupId_idx" ON "ResultTemplateTrait"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplateTrait_branchId_id_key" ON "ResultTemplateTrait"("branchId", "id");

-- CreateIndex
CREATE INDEX "TraitRating_branchId_periodId_idx" ON "TraitRating"("branchId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "TraitRating_studentId_periodId_traitId_key" ON "TraitRating"("studentId", "periodId", "traitId");

-- CreateIndex
CREATE INDEX "ReportAttendance_branchId_periodId_idx" ON "ReportAttendance"("branchId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportAttendance_studentId_periodId_key" ON "ReportAttendance"("studentId", "periodId");

-- AddForeignKey
ALTER TABLE "ResultTemplateTraitGroup" ADD CONSTRAINT "ResultTemplateTraitGroup_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateTraitGroup" ADD CONSTRAINT "ResultTemplateTraitGroup_branchId_templateId_fkey" FOREIGN KEY ("branchId", "templateId") REFERENCES "ResultTemplate"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateTrait" ADD CONSTRAINT "ResultTemplateTrait_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateTrait" ADD CONSTRAINT "ResultTemplateTrait_branchId_templateId_fkey" FOREIGN KEY ("branchId", "templateId") REFERENCES "ResultTemplate"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateTrait" ADD CONSTRAINT "ResultTemplateTrait_branchId_groupId_fkey" FOREIGN KEY ("branchId", "groupId") REFERENCES "ResultTemplateTraitGroup"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraitRating" ADD CONSTRAINT "TraitRating_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraitRating" ADD CONSTRAINT "TraitRating_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraitRating" ADD CONSTRAINT "TraitRating_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraitRating" ADD CONSTRAINT "TraitRating_branchId_traitId_fkey" FOREIGN KEY ("branchId", "traitId") REFERENCES "ResultTemplateTrait"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraitRating" ADD CONSTRAINT "TraitRating_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAttendance" ADD CONSTRAINT "ReportAttendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAttendance" ADD CONSTRAINT "ReportAttendance_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAttendance" ADD CONSTRAINT "ReportAttendance_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAttendance" ADD CONSTRAINT "ReportAttendance_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Checks
ALTER TABLE "TraitRating" ADD CONSTRAINT "TraitRating_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "ReportAttendance" ADD CONSTRAINT "ReportAttendance_counts_not_negative" CHECK (
  ("timesOpen" IS NULL OR "timesOpen" >= 0) AND ("timesPresent" IS NULL OR "timesPresent" >= 0) AND ("timesAbsent" IS NULL OR "timesAbsent" >= 0)
);

-- Backfill: the four report-card templates for every existing branch
-- The marks structure the four cards share (hosted: it belongs to templates, not to a class or the branch default). Skipped where a live scheme already has the name.
INSERT INTO "AssessmentScheme" ("id", "branchId", "name", "totalMax", "examMax", "hosted", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':scheme'), b."id", 'Report card marks (CA 40 + exam 60)', 100, 60, true, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "AssessmentScheme" s WHERE s."id" = 'rts_' || md5(b."id" || ':scheme'))
  AND NOT EXISTS (SELECT 1 FROM "AssessmentScheme" s WHERE s."branchId" = b."id" AND s."name" = 'Report card marks (CA 40 + exam 60)' AND s."archivedAt" IS NULL);

INSERT INTO "AssessmentComponent" ("id", "branchId", "schemeId", "name", "maxScore", "sortOrder")
SELECT 'rts_' || md5(s."branchId" || ':component:0'), s."branchId", s."id", 'Continuous assessment', 40, 0
FROM "AssessmentScheme" s
JOIN "Branch" b ON s."id" = 'rts_' || md5(b."id" || ':scheme')
WHERE NOT EXISTS (SELECT 1 FROM "AssessmentComponent" c WHERE c."schemeId" = s."id");

-- Grade scale "plain" (never the branch's default scale).
INSERT INTO "GradeScale" ("id", "branchId", "name", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':scale-plain'), b."id", 'Report card scale: marks only (letters not printed)', false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-plain'))
  AND NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."branchId" = b."id" AND g."name" = 'Report card scale: marks only (letters not printed)' AND g."archivedAt" IS NULL);

INSERT INTO "GradeBand" ("id", "branchId", "scaleId", "minScore", "maxScore", "letter", "remark", "sortOrder")
SELECT 'rts_' || md5(g."branchId" || ':band:scale-plain') || '_' || v.i, g."branchId", g."id", v.min, v.max, v.letter, v.remark, v.i
FROM "GradeScale" g
JOIN "Branch" b ON g."id" = 'rts_' || md5(b."id" || ':scale-plain')
CROSS JOIN (VALUES
  (0, 0, 40, 'F', 'Fail'),
  (1, 40, 50, 'D', 'Fair'),
  (2, 50, 60, 'C', 'Good'),
  (3, 60, 70, 'B', 'Very good'),
  (4, 70, 100, 'A', 'Excellent')
) AS v(i, min, max, letter, remark)
WHERE NOT EXISTS (SELECT 1 FROM "GradeBand" x WHERE x."scaleId" = g."id");

-- Grade scale "junior" (never the branch's default scale).
INSERT INTO "GradeScale" ("id", "branchId", "name", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':scale-junior'), b."id", 'Junior secondary report card scale', false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-junior'))
  AND NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."branchId" = b."id" AND g."name" = 'Junior secondary report card scale' AND g."archivedAt" IS NULL);

INSERT INTO "GradeBand" ("id", "branchId", "scaleId", "minScore", "maxScore", "letter", "remark", "sortOrder")
SELECT 'rts_' || md5(g."branchId" || ':band:scale-junior') || '_' || v.i, g."branchId", g."id", v.min, v.max, v.letter, v.remark, v.i
FROM "GradeScale" g
JOIN "Branch" b ON g."id" = 'rts_' || md5(b."id" || ':scale-junior')
CROSS JOIN (VALUES
  (0, 0, 50, 'E', 'Fair'),
  (1, 50, 60, 'C', 'Average'),
  (2, 60, 70, 'B', 'Good'),
  (3, 70, 100, 'A', 'Excellent')
) AS v(i, min, max, letter, remark)
WHERE NOT EXISTS (SELECT 1 FROM "GradeBand" x WHERE x."scaleId" = g."id");

-- Grade scale "senior" (never the branch's default scale).
INSERT INTO "GradeScale" ("id", "branchId", "name", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':scale-senior'), b."id", 'Senior secondary report card scale', false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-senior'))
  AND NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."branchId" = b."id" AND g."name" = 'Senior secondary report card scale' AND g."archivedAt" IS NULL);

INSERT INTO "GradeBand" ("id", "branchId", "scaleId", "minScore", "maxScore", "letter", "remark", "sortOrder")
SELECT 'rts_' || md5(g."branchId" || ':band:scale-senior') || '_' || v.i, g."branchId", g."id", v.min, v.max, v.letter, v.remark, v.i
FROM "GradeScale" g
JOIN "Branch" b ON g."id" = 'rts_' || md5(b."id" || ':scale-senior')
CROSS JOIN (VALUES
  (0, 0, 40, 'F9', 'Fail'),
  (1, 40, 45, 'E8', 'Pass'),
  (2, 45, 50, 'D7', 'Pass'),
  (3, 50, 55, 'C6', 'Credit'),
  (4, 55, 60, 'C5', 'Credit'),
  (5, 60, 65, 'C4', 'Credit'),
  (6, 65, 70, 'B3', 'Good'),
  (7, 70, 75, 'B2', 'Very good'),
  (8, 75, 100, 'A1', 'Excellent')
) AS v(i, min, max, letter, remark)
WHERE NOT EXISTS (SELECT 1 FROM "GradeBand" x WHERE x."scaleId" = g."id");

-- Template "Pre-school (Nursery and Primary School)": the look (PRESCHOOL), the shared scheme, its scale and its trait groups. Not the default, and no class is placed in it.
INSERT INTO "ResultTemplate" ("id", "branchId", "name", "description", "layoutCode", "schemeId", "gradeScaleId", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':template:preschool'), b."id", 'Pre-school (Nursery and Primary School)', 'Al-Eeman pre-school report card', 'PRESCHOOL',
  (SELECT s."id" FROM "AssessmentScheme" s WHERE s."id" = 'rts_' || md5(b."id" || ':scheme')),
  (SELECT g."id" FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-plain')),
  false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."id" = 'rts_' || md5(b."id" || ':template:preschool'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."branchId" = b."id" AND lower(r."name") = lower('Pre-school (Nursery and Primary School)') AND r."archivedAt" IS NULL);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:preschool:psychomotor'), r."branchId", r."id", 'Psychomotor skill', 0, false
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:preschool')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:preschool:psychomotor'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:preschool:psychomotor') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:preschool:psychomotor'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:preschool')
CROSS JOIN (VALUES
  (0, 'Verbal fluency'),
  (1, 'Games'),
  (2, 'Sports'),
  (3, 'Handling tools'),
  (4, 'Drawing and painting'),
  (5, 'Music skills')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:preschool:psychomotor'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:preschool:psychomotor') || '_' || v.i);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:preschool:affective'), r."branchId", r."id", 'Affective domain', 1, false
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:preschool')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:preschool:affective'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:preschool:affective') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:preschool:affective'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:preschool')
CROSS JOIN (VALUES
  (0, 'Punctuality'),
  (1, 'Neatness'),
  (2, 'Politeness'),
  (3, 'Honesty'),
  (4, 'Co-operation with others'),
  (5, 'Leadership'),
  (6, 'Helping others'),
  (7, 'Emotional stability'),
  (8, 'Health'),
  (9, 'Attitude to school work'),
  (10, 'Attentiveness'),
  (11, 'Perseverance'),
  (12, 'Speaking / hand writing')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:preschool:affective'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:preschool:affective') || '_' || v.i);

-- Template "Basic class (Grade 1-6)": the look (BASIC), the shared scheme, its scale and its trait groups. Not the default, and no class is placed in it.
INSERT INTO "ResultTemplate" ("id", "branchId", "name", "description", "layoutCode", "schemeId", "gradeScaleId", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':template:basic'), b."id", 'Basic class (Grade 1-6)', 'Al-Eeman basic school report card', 'BASIC',
  (SELECT s."id" FROM "AssessmentScheme" s WHERE s."id" = 'rts_' || md5(b."id" || ':scheme')),
  (SELECT g."id" FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-plain')),
  false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."id" = 'rts_' || md5(b."id" || ':template:basic'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."branchId" = b."id" AND lower(r."name") = lower('Basic class (Grade 1-6)') AND r."archivedAt" IS NULL);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:basic:psychomotor'), r."branchId", r."id", 'Psychomotor skill', 0, false
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:basic')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:basic:psychomotor'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:basic:psychomotor') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:basic:psychomotor'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:basic')
CROSS JOIN (VALUES
  (0, 'Verbal fluency'),
  (1, 'Games'),
  (2, 'Sports'),
  (3, 'Handling tools'),
  (4, 'Drawing and painting'),
  (5, 'Music skills')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:basic:psychomotor'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:basic:psychomotor') || '_' || v.i);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:basic:affective'), r."branchId", r."id", 'Affective domain', 1, false
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:basic')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:basic:affective'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:basic:affective') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:basic:affective'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:basic')
CROSS JOIN (VALUES
  (0, 'Punctuality'),
  (1, 'Neatness'),
  (2, 'Politeness'),
  (3, 'Honesty'),
  (4, 'Co-operation with others'),
  (5, 'Leadership'),
  (6, 'Helping others'),
  (7, 'Emotional stability'),
  (8, 'Health'),
  (9, 'Attitude to school work'),
  (10, 'Attentiveness'),
  (11, 'Perseverance'),
  (12, 'Speaking / hand writing')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:basic:affective'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:basic:affective') || '_' || v.i);

-- Template "Junior Secondary (Year 7-9)": the look (JUNIOR), the shared scheme, its scale and its trait groups. Not the default, and no class is placed in it.
INSERT INTO "ResultTemplate" ("id", "branchId", "name", "description", "layoutCode", "schemeId", "gradeScaleId", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':template:junior'), b."id", 'Junior Secondary (Year 7-9)', 'Al-Eeman junior secondary report card', 'JUNIOR',
  (SELECT s."id" FROM "AssessmentScheme" s WHERE s."id" = 'rts_' || md5(b."id" || ':scheme')),
  (SELECT g."id" FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-junior')),
  false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."id" = 'rts_' || md5(b."id" || ':template:junior'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."branchId" = b."id" AND lower(r."name") = lower('Junior Secondary (Year 7-9)') AND r."archivedAt" IS NULL);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:junior:character'), r."branchId", r."id", 'Character development', 0, true
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:junior')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:junior:character'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:junior:character') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:junior:character'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:junior')
CROSS JOIN (VALUES
  (0, 'Attentiveness in class'),
  (1, 'Neatness'),
  (2, 'Politeness'),
  (3, 'Self control'),
  (4, 'Punctuality')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:junior:character'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:junior:character') || '_' || v.i);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:junior:practical'), r."branchId", r."id", 'Practical skills', 1, true
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:junior')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:junior:practical'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:junior:practical') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:junior:practical'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:junior')
CROSS JOIN (VALUES
  (0, 'Relationship with others'),
  (1, 'Drama'),
  (2, 'Clubs / society'),
  (3, 'Hobbies'),
  (4, 'Sport')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:junior:practical'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:junior:practical') || '_' || v.i);

-- Template "Senior Secondary (Year 10-12)": the look (SENIOR), the shared scheme, its scale and its trait groups. Not the default, and no class is placed in it.
INSERT INTO "ResultTemplate" ("id", "branchId", "name", "description", "layoutCode", "schemeId", "gradeScaleId", "isDefault", "updatedAt")
SELECT 'rts_' || md5(b."id" || ':template:senior'), b."id", 'Senior Secondary (Year 10-12)', 'Al-Eeman senior secondary report card', 'SENIOR',
  (SELECT s."id" FROM "AssessmentScheme" s WHERE s."id" = 'rts_' || md5(b."id" || ':scheme')),
  (SELECT g."id" FROM "GradeScale" g WHERE g."id" = 'rts_' || md5(b."id" || ':scale-senior')),
  false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."id" = 'rts_' || md5(b."id" || ':template:senior'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."branchId" = b."id" AND lower(r."name") = lower('Senior Secondary (Year 10-12)') AND r."archivedAt" IS NULL);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:senior:character'), r."branchId", r."id", 'Character development', 0, true
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:senior')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:senior:character'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:senior:character') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:senior:character'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:senior')
CROSS JOIN (VALUES
  (0, 'Attentiveness in class'),
  (1, 'Neatness'),
  (2, 'Politeness'),
  (3, 'Self control'),
  (4, 'Punctuality')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:senior:character'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:senior:character') || '_' || v.i);

INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT 'rts_' || md5(r."branchId" || ':group:senior:practical'), r."branchId", r."id", 'Practical skills', 1, true
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:senior')
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:senior:practical'));

INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT 'rts_' || md5(r."branchId" || ':trait:senior:practical') || '_' || v.i, r."branchId", r."id", 'rts_' || md5(r."branchId" || ':group:senior:practical'), v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = 'rts_' || md5(b."id" || ':template:senior')
CROSS JOIN (VALUES
  (0, 'Relationship with others'),
  (1, 'Drama'),
  (2, 'Clubs / society'),
  (3, 'Hobbies'),
  (4, 'Sport')
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':group:senior:practical'))
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = 'rts_' || md5(r."branchId" || ':trait:senior:practical') || '_' || v.i);
