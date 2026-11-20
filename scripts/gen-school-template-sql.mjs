// Prints the backfill SQL of the school-wide result templates (task 0120): the four masters, the link from every branch's seeded rows to them, and the stable keys on those rows' trait groups and
// traits. The data is lib/results/school-template-seed.ts (built from seed-templates.ts), so the migration and the app's own seeding cannot drift. Run:
//   node scripts/gen-school-template-sql.mjs > part.sql   (Node 24 reads the .ts files directly).
import { SEED_SCALES, SEED_SCHEME, SEED_TEMPLATES } from "../src/lib/results/seed-templates.ts";
import { buildSchoolSeeds } from "../src/lib/results/school-template-seed.ts";

const SCHOOL_SEEDS = buildSchoolSeeds(SEED_TEMPLATES, SEED_SCHEME, SEED_SCALES);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const out = [];

out.push(`-- The four masters (version 1). Skipped where the id exists, so running it again changes nothing.
INSERT INTO "SchoolResultTemplate" ("id", "name", "description", "layoutCode", "definition", "version", "updatedAt")
VALUES
${SCHOOL_SEEDS.map((s) => `  (${q(s.id)}, ${q(s.name)}, ${q(s.description)}, ${q(s.layoutCode)}, ${q(JSON.stringify(s.definition))}::jsonb, 1, now())`).join(",\n")}
ON CONFLICT ("id") DO NOTHING;
`);

// A branch's seeded row is 'rts_' || md5(branchId || ':template:' || key); its scheme is ':scheme' and its scale ':scale-<plain|junior|senior>'. Rows that were renamed or given another look are left unlinked.
const scaleKey = { preschool: "scale-plain", basic: "scale-plain", junior: "scale-junior", senior: "scale-senior" };
const keys = SCHOOL_SEEDS.map((s) => `(${q(s.key)}, ${q(s.id)}, ${q(scaleKey[s.key])})`).join(", ");

const n2 = (e) => `(${e})::numeric(8,2)::text`;
// The structure a row's scheme holds, as one string, and the one the master's definition says; equal strings = the scheme has not been changed in the branch.
const rowScheme = `(SELECT ${n2(`s."totalMax"`)} || '|' || ${n2(`s."examMax"`)} || '|' || s."name" || '|' || COALESCE((SELECT string_agg(c."name" || '=' || ${n2(`c."maxScore"`)}, ';' ORDER BY c."sortOrder") FROM "AssessmentComponent" c WHERE c."schemeId" = s."id"), '') FROM "AssessmentScheme" s WHERE s."id" = r."schemeId")`;
const masterScheme = `(m."definition"->'scheme'->>'totalMax')::numeric(8,2)::text || '|' || (m."definition"->'scheme'->>'examMax')::numeric(8,2)::text || '|' || (m."definition"->'scheme'->>'name') || '|' || COALESCE((SELECT string_agg((e->>'name') || '=' || (e->>'maxScore')::numeric(8,2)::text, ';' ORDER BY ord) FROM jsonb_array_elements(m."definition"->'scheme'->'components') WITH ORDINALITY AS t(e, ord)), '')`;
const rowScale = `(SELECT g."name" || '|' || COALESCE((SELECT string_agg(${n2(`b."minScore"`)} || '~' || ${n2(`b."maxScore"`)} || '~' || b."letter" || '~' || b."remark", ';' ORDER BY b."sortOrder") FROM "GradeBand" b WHERE b."scaleId" = g."id"), '') FROM "GradeScale" g WHERE g."id" = r."gradeScaleId")`;
const masterScale = `(m."definition"->'scale'->>'name') || '|' || COALESCE((SELECT string_agg((e->>'min')::numeric(8,2)::text || '~' || (e->>'max')::numeric(8,2)::text || '~' || (e->>'letter') || '~' || (e->>'remark'), ';' ORDER BY ord) FROM jsonb_array_elements(m."definition"->'scale'->'bands') WITH ORDINALITY AS t(e, ord)), '')`;

out.push(`-- Link every branch's seeded, live row to its master (version 1). "localEditedAt" is set to the row's last update when the branch has changed what the row follows: another scheme or scale than
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
        OR ${rowScheme} IS DISTINCT FROM (${masterScheme})
        OR ${rowScale} IS DISTINCT FROM (${masterScale})
      THEN r."updatedAt" END
FROM (VALUES ${keys}) AS k("key", "masterId", "scale")
JOIN "SchoolResultTemplate" m ON m."id" = k."masterId"
WHERE r."id" = 'rts_' || md5(r."branchId" || ':template:' || k."key")
  AND r."schoolTemplateId" IS NULL
  AND r."archivedAt" IS NULL
  AND r."name" = m."name"
  AND r."layoutCode" IS NOT DISTINCT FROM m."layoutCode";
`);

out.push(`-- The stable keys of the linked rows' trait groups and traits, from the master's definition (matched on the title, then on the name). Ratings keep pointing at the same rows.
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
`);
console.log(out.join("\n"));
