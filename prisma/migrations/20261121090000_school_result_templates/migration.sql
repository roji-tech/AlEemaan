-- Task 0120: school-wide result templates. Additive: one new table, three nullable columns on ResultTemplate, one nullable key column on each of the trait groups and traits, then rows. Nothing
-- existing is changed or dropped, and no class assignment is touched.
--
-- A branch keeps its own ResultTemplate rows (every branch-checked key, class assignment and result stays as it is); "schoolTemplateId" only says which school-wide master a row follows, and
-- "schoolTemplateVersion" which version of it the row was last brought up to. "localEditedAt" is set when the branch changed the row afterwards ("Customised here"). The partial unique indexes
-- below are not in prisma/schema/academics.prisma because Prisma cannot express them (the same as Subject_live_catalog_key, which `prisma migrate diff` tolerates).
--
-- The backfill at the end is generated from src/lib/results/seed-templates.ts by scripts/gen-school-template-sql.mjs: edit the data file and regenerate rather than editing it here.

-- CreateTable
CREATE TABLE "SchoolResultTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layoutCode" TEXT,
    "layoutOptions" JSONB,
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolResultTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ResultTemplate" ADD COLUMN     "schoolTemplateId" TEXT,
ADD COLUMN     "schoolTemplateVersion" INTEGER,
ADD COLUMN     "localEditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ResultTemplateTraitGroup" ADD COLUMN     "schoolKey" TEXT;

-- AlterTable
ALTER TABLE "ResultTemplateTrait" ADD COLUMN     "schoolKey" TEXT;

-- CreateIndex
CREATE INDEX "ResultTemplate_schoolTemplateId_idx" ON "ResultTemplate"("schoolTemplateId");

-- AddForeignKey
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_schoolTemplateId_fkey" FOREIGN KEY ("schoolTemplateId") REFERENCES "SchoolResultTemplate"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- A version is 1 or more, and a row that follows a master has a version (CHECKs; Prisma cannot express them).
ALTER TABLE "SchoolResultTemplate" ADD CONSTRAINT "SchoolResultTemplate_version_positive" CHECK ("version" >= 1);
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_school_version" CHECK (("schoolTemplateId" IS NULL) = ("schoolTemplateVersion" IS NULL));

-- Partial unique indexes (not expressible in the Prisma schema): a live master name is unique ignoring case; a branch has at most one live row per master; a key is unique inside its template (groups)
-- or its group (traits).
CREATE UNIQUE INDEX "SchoolResultTemplate_live_name_key" ON "SchoolResultTemplate" (lower("name")) WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ResultTemplate_live_school_key" ON "ResultTemplate" ("branchId", "schoolTemplateId") WHERE "schoolTemplateId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ResultTemplateTraitGroup_school_key" ON "ResultTemplateTraitGroup" ("templateId", "schoolKey") WHERE "schoolKey" IS NOT NULL;
CREATE UNIQUE INDEX "ResultTemplateTrait_school_key" ON "ResultTemplateTrait" ("groupId", "schoolKey") WHERE "schoolKey" IS NOT NULL;

-- The four masters (version 1). Skipped where the id exists, so running it again changes nothing.
INSERT INTO "SchoolResultTemplate" ("id", "name", "description", "layoutCode", "definition", "version", "updatedAt")
VALUES
  ('sct_a39f9f014696df9561affcffaafdf333', 'Pre-school (Nursery and Primary School)', 'Al-Eeman pre-school report card', 'PRESCHOOL', '{"scheme":{"name":"Report card marks (CA 40 + exam 60)","totalMax":100,"examMax":60,"components":[{"name":"Continuous assessment","maxScore":40}]},"scale":{"name":"Report card scale: marks only (letters not printed)","unconfirmed":false,"bands":[{"min":0,"max":40,"letter":"F","remark":"Fail"},{"min":40,"max":50,"letter":"D","remark":"Fair"},{"min":50,"max":60,"letter":"C","remark":"Good"},{"min":60,"max":70,"letter":"B","remark":"Very good"},{"min":70,"max":100,"letter":"A","remark":"Excellent"}]},"groups":[{"key":"psychomotor","title":"Psychomotor skill","showSign":false,"traits":[{"key":"verbal-fluency","name":"Verbal fluency"},{"key":"games","name":"Games"},{"key":"sports","name":"Sports"},{"key":"handling-tools","name":"Handling tools"},{"key":"drawing-and-painting","name":"Drawing and painting"},{"key":"music-skills","name":"Music skills"}]},{"key":"affective","title":"Affective domain","showSign":false,"traits":[{"key":"punctuality","name":"Punctuality"},{"key":"neatness","name":"Neatness"},{"key":"politeness","name":"Politeness"},{"key":"honesty","name":"Honesty"},{"key":"co-operation-with-others","name":"Co-operation with others"},{"key":"leadership","name":"Leadership"},{"key":"helping-others","name":"Helping others"},{"key":"emotional-stability","name":"Emotional stability"},{"key":"health","name":"Health"},{"key":"attitude-to-school-work","name":"Attitude to school work"},{"key":"attentiveness","name":"Attentiveness"},{"key":"perseverance","name":"Perseverance"},{"key":"speaking-hand-writing","name":"Speaking / hand writing"}]}]}'::jsonb, 1, now()),
  ('sct_c00c2a6e45738b373c4e4b69774bc2db', 'Basic class (Grade 1-6)', 'Al-Eeman basic school report card', 'BASIC', '{"scheme":{"name":"Report card marks (CA 40 + exam 60)","totalMax":100,"examMax":60,"components":[{"name":"Continuous assessment","maxScore":40}]},"scale":{"name":"Report card scale: marks only (letters not printed)","unconfirmed":false,"bands":[{"min":0,"max":40,"letter":"F","remark":"Fail"},{"min":40,"max":50,"letter":"D","remark":"Fair"},{"min":50,"max":60,"letter":"C","remark":"Good"},{"min":60,"max":70,"letter":"B","remark":"Very good"},{"min":70,"max":100,"letter":"A","remark":"Excellent"}]},"groups":[{"key":"psychomotor","title":"Psychomotor skill","showSign":false,"traits":[{"key":"verbal-fluency","name":"Verbal fluency"},{"key":"games","name":"Games"},{"key":"sports","name":"Sports"},{"key":"handling-tools","name":"Handling tools"},{"key":"drawing-and-painting","name":"Drawing and painting"},{"key":"music-skills","name":"Music skills"}]},{"key":"affective","title":"Affective domain","showSign":false,"traits":[{"key":"punctuality","name":"Punctuality"},{"key":"neatness","name":"Neatness"},{"key":"politeness","name":"Politeness"},{"key":"honesty","name":"Honesty"},{"key":"co-operation-with-others","name":"Co-operation with others"},{"key":"leadership","name":"Leadership"},{"key":"helping-others","name":"Helping others"},{"key":"emotional-stability","name":"Emotional stability"},{"key":"health","name":"Health"},{"key":"attitude-to-school-work","name":"Attitude to school work"},{"key":"attentiveness","name":"Attentiveness"},{"key":"perseverance","name":"Perseverance"},{"key":"speaking-hand-writing","name":"Speaking / hand writing"}]}]}'::jsonb, 1, now()),
  ('sct_1e334496d59014b2dd601351089f85a7', 'Junior Secondary (Year 7-9)', 'Al-Eeman junior secondary report card', 'JUNIOR', '{"scheme":{"name":"Report card marks (CA 40 + exam 60)","totalMax":100,"examMax":60,"components":[{"name":"Continuous assessment","maxScore":40}]},"scale":{"name":"Junior secondary report card scale","unconfirmed":true,"bands":[{"min":0,"max":50,"letter":"E","remark":"Fair"},{"min":50,"max":60,"letter":"C","remark":"Average"},{"min":60,"max":70,"letter":"B","remark":"Good"},{"min":70,"max":100,"letter":"A","remark":"Excellent"}]},"groups":[{"key":"character","title":"Character development","showSign":true,"traits":[{"key":"attentiveness-in-class","name":"Attentiveness in class"},{"key":"neatness","name":"Neatness"},{"key":"politeness","name":"Politeness"},{"key":"self-control","name":"Self control"},{"key":"punctuality","name":"Punctuality"}]},{"key":"practical","title":"Practical skills","showSign":true,"traits":[{"key":"relationship-with-others","name":"Relationship with others"},{"key":"drama","name":"Drama"},{"key":"clubs-society","name":"Clubs / society"},{"key":"hobbies","name":"Hobbies"},{"key":"sport","name":"Sport"}]}]}'::jsonb, 1, now()),
  ('sct_884d6206fb0230b6597dd52d38d969ae', 'Senior Secondary (Year 10-12)', 'Al-Eeman senior secondary report card', 'SENIOR', '{"scheme":{"name":"Report card marks (CA 40 + exam 60)","totalMax":100,"examMax":60,"components":[{"name":"Continuous assessment","maxScore":40}]},"scale":{"name":"Senior secondary report card scale","unconfirmed":false,"bands":[{"min":0,"max":40,"letter":"F9","remark":"Fail"},{"min":40,"max":45,"letter":"E8","remark":"Pass"},{"min":45,"max":50,"letter":"D7","remark":"Pass"},{"min":50,"max":55,"letter":"C6","remark":"Credit"},{"min":55,"max":60,"letter":"C5","remark":"Credit"},{"min":60,"max":65,"letter":"C4","remark":"Credit"},{"min":65,"max":70,"letter":"B3","remark":"Good"},{"min":70,"max":75,"letter":"B2","remark":"Very good"},{"min":75,"max":100,"letter":"A1","remark":"Excellent"}]},"groups":[{"key":"character","title":"Character development","showSign":true,"traits":[{"key":"attentiveness-in-class","name":"Attentiveness in class"},{"key":"neatness","name":"Neatness"},{"key":"politeness","name":"Politeness"},{"key":"self-control","name":"Self control"},{"key":"punctuality","name":"Punctuality"}]},{"key":"practical","title":"Practical skills","showSign":true,"traits":[{"key":"relationship-with-others","name":"Relationship with others"},{"key":"drama","name":"Drama"},{"key":"clubs-society","name":"Clubs / society"},{"key":"hobbies","name":"Hobbies"},{"key":"sport","name":"Sport"}]}]}'::jsonb, 1, now())
ON CONFLICT ("id") DO NOTHING;

-- Link every branch's seeded, live row to its master (version 1). "localEditedAt" is set to the row's last update when the branch has changed what the row follows: another scheme or scale than
-- the seeded ones, a changed scheme or scale (compared by content, so confirming the Junior bands is NOT a change), another description or look options. Such a row is linked but shows
-- "Customised here" and a sync skips it unless the superadmin chooses to replace the local changes. A row that was renamed, given another look or archived is left unlinked: it is the branch's own.
UPDATE "ResultTemplate" r
SET "schoolTemplateId" = m."id",
    "schoolTemplateVersion" = 1,
    "localEditedAt" = CASE
      WHEN r."description" IS DISTINCT FROM m."description"
        OR r."layoutOptions" IS NOT NULL
        OR r."schemeId" IS DISTINCT FROM 'rts_' || md5(r."branchId" || ':scheme')
        OR r."gradeScaleId" IS DISTINCT FROM 'rts_' || md5(r."branchId" || ':' || k."scale")
        OR (SELECT (s."totalMax")::numeric(8,2)::text || '|' || (s."examMax")::numeric(8,2)::text || '|' || s."name" || '|' || COALESCE((SELECT string_agg(c."name" || '=' || (c."maxScore")::numeric(8,2)::text, ';' ORDER BY c."sortOrder") FROM "AssessmentComponent" c WHERE c."schemeId" = s."id"), '') FROM "AssessmentScheme" s WHERE s."id" = r."schemeId") IS DISTINCT FROM ((m."definition"->'scheme'->>'totalMax')::numeric(8,2)::text || '|' || (m."definition"->'scheme'->>'examMax')::numeric(8,2)::text || '|' || (m."definition"->'scheme'->>'name') || '|' || COALESCE((SELECT string_agg((e->>'name') || '=' || (e->>'maxScore')::numeric(8,2)::text, ';' ORDER BY ord) FROM jsonb_array_elements(m."definition"->'scheme'->'components') WITH ORDINALITY AS t(e, ord)), ''))
        OR (SELECT g."name" || '|' || COALESCE((SELECT string_agg((b."minScore")::numeric(8,2)::text || '~' || (b."maxScore")::numeric(8,2)::text || '~' || b."letter" || '~' || b."remark", ';' ORDER BY b."sortOrder") FROM "GradeBand" b WHERE b."scaleId" = g."id"), '') FROM "GradeScale" g WHERE g."id" = r."gradeScaleId") IS DISTINCT FROM ((m."definition"->'scale'->>'name') || '|' || COALESCE((SELECT string_agg((e->>'min')::numeric(8,2)::text || '~' || (e->>'max')::numeric(8,2)::text || '~' || (e->>'letter') || '~' || (e->>'remark'), ';' ORDER BY ord) FROM jsonb_array_elements(m."definition"->'scale'->'bands') WITH ORDINALITY AS t(e, ord)), ''))
      THEN r."updatedAt" END
FROM (VALUES ('preschool', 'sct_a39f9f014696df9561affcffaafdf333', 'scale-plain'), ('basic', 'sct_c00c2a6e45738b373c4e4b69774bc2db', 'scale-plain'), ('junior', 'sct_1e334496d59014b2dd601351089f85a7', 'scale-junior'), ('senior', 'sct_884d6206fb0230b6597dd52d38d969ae', 'scale-senior')) AS k("key", "masterId", "scale")
JOIN "SchoolResultTemplate" m ON m."id" = k."masterId"
WHERE r."id" = 'rts_' || md5(r."branchId" || ':template:' || k."key")
  AND r."schoolTemplateId" IS NULL
  AND r."archivedAt" IS NULL
  AND r."name" = m."name"
  AND r."layoutCode" IS NOT DISTINCT FROM m."layoutCode";

-- The stable keys of the linked rows' trait groups and traits, from the master's definition (matched on the title, then on the name). Ratings keep pointing at the same rows.
UPDATE "ResultTemplateTraitGroup" g
SET "schoolKey" = ge->>'key'
FROM "ResultTemplate" r
JOIN "SchoolResultTemplate" m ON m."id" = r."schoolTemplateId",
  jsonb_array_elements(m."definition"->'groups') AS ge
WHERE g."templateId" = r."id" AND g."schoolKey" IS NULL AND g."title" = ge->>'title';

UPDATE "ResultTemplateTrait" t
SET "schoolKey" = te->>'key'
FROM "ResultTemplateTraitGroup" g
JOIN "ResultTemplate" r ON r."id" = g."templateId"
JOIN "SchoolResultTemplate" m ON m."id" = r."schoolTemplateId",
  jsonb_array_elements(m."definition"->'groups') AS ge,
  jsonb_array_elements(ge->'traits') AS te
WHERE t."groupId" = g."id" AND t."schoolKey" IS NULL AND g."schoolKey" = ge->>'key' AND t."name" = te->>'name';

