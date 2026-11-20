// Prints the SQL that seeds the school's four report-card templates for EVERY existing branch (task 0116). The data is lib/results/seed-templates.ts, so the migration and the app's
// seeding for a branch made later cannot drift; ids are 'rts_' || md5(branchId || ':' || parts), the same as `seedId` there, so each statement is idempotent and a branch seeded by
// either path is never seeded twice. Run: node scripts/gen-report-template-sql.mjs > part.sql   (Node 24 reads the .ts file directly).
import { SEED_SCHEME, SEED_SCALES, SEED_TEMPLATES } from "../src/lib/results/seed-templates.ts";

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const id = (...parts) => `'rts_' || md5(b."id" || ${q(":" + parts.join(":"))})`;
const idOf = (alias, ...parts) => `'rts_' || md5(${alias}."branchId" || ${q(":" + parts.join(":"))})`;
const out = [];

out.push(`-- The marks structure the four cards share (hosted: it belongs to templates, not to a class or the branch default). Skipped where a live scheme already has the name.
INSERT INTO "AssessmentScheme" ("id", "branchId", "name", "totalMax", "examMax", "hosted", "updatedAt")
SELECT ${id("scheme")}, b."id", ${q(SEED_SCHEME.name)}, ${SEED_SCHEME.totalMax}, ${SEED_SCHEME.examMax}, true, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "AssessmentScheme" s WHERE s."id" = ${id("scheme")})
  AND NOT EXISTS (SELECT 1 FROM "AssessmentScheme" s WHERE s."branchId" = b."id" AND s."name" = ${q(SEED_SCHEME.name)} AND s."archivedAt" IS NULL);
`);
SEED_SCHEME.components.forEach((c, i) => {
  out.push(`INSERT INTO "AssessmentComponent" ("id", "branchId", "schemeId", "name", "maxScore", "sortOrder")
SELECT ${idOf("s", "component", i)}, s."branchId", s."id", ${q(c.name)}, ${c.maxScore}, ${i}
FROM "AssessmentScheme" s
JOIN "Branch" b ON s."id" = ${id("scheme")}
WHERE NOT EXISTS (SELECT 1 FROM "AssessmentComponent" c WHERE c."schemeId" = s."id");
`);
});

for (const [kind, scale] of Object.entries(SEED_SCALES)) {
  out.push(`-- Grade scale "${kind}" (never the branch's default scale).
INSERT INTO "GradeScale" ("id", "branchId", "name", "isDefault", "updatedAt")
SELECT ${id(scale.key)}, b."id", ${q(scale.name)}, false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."id" = ${id(scale.key)})
  AND NOT EXISTS (SELECT 1 FROM "GradeScale" g WHERE g."branchId" = b."id" AND g."name" = ${q(scale.name)} AND g."archivedAt" IS NULL);
`);
  const rows = scale.bands.map((band, i) => `(${i}, ${band.min}, ${band.max}, ${q(band.letter)}, ${q(band.remark)})`).join(",\n  ");
  out.push(`INSERT INTO "GradeBand" ("id", "branchId", "scaleId", "minScore", "maxScore", "letter", "remark", "sortOrder")
SELECT ${idOf("g", "band", scale.key)} || '_' || v.i, g."branchId", g."id", v.min, v.max, v.letter, v.remark, v.i
FROM "GradeScale" g
JOIN "Branch" b ON g."id" = ${id(scale.key)}
CROSS JOIN (VALUES
  ${rows}
) AS v(i, min, max, letter, remark)
WHERE NOT EXISTS (SELECT 1 FROM "GradeBand" x WHERE x."scaleId" = g."id");
`);
}

for (const t of SEED_TEMPLATES) {
  const scale = SEED_SCALES[t.scale];
  out.push(`-- Template "${t.name}": the look (${t.layoutCode}), the shared scheme, its scale and its trait groups. Not the default, and no class is placed in it.
INSERT INTO "ResultTemplate" ("id", "branchId", "name", "description", "layoutCode", "schemeId", "gradeScaleId", "isDefault", "updatedAt")
SELECT ${id("template", t.key)}, b."id", ${q(t.name)}, ${q(t.description)}, ${q(t.layoutCode)},
  (SELECT s."id" FROM "AssessmentScheme" s WHERE s."id" = ${id("scheme")}),
  (SELECT g."id" FROM "GradeScale" g WHERE g."id" = ${id(scale.key)}),
  false, now()
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."id" = ${id("template", t.key)})
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplate" r WHERE r."branchId" = b."id" AND lower(r."name") = lower(${q(t.name)}) AND r."archivedAt" IS NULL);
`);
  t.groups.forEach((g, gi) => {
    out.push(`INSERT INTO "ResultTemplateTraitGroup" ("id", "branchId", "templateId", "title", "sortOrder", "showSign")
SELECT ${idOf("r", "group", t.key, g.key)}, r."branchId", r."id", ${q(g.title)}, ${gi}, ${g.showSign}
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = ${id("template", t.key)}
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = ${idOf("r", "group", t.key, g.key)});
`);
    const rows = g.traits.map((name, i) => `(${i}, ${q(name)})`).join(",\n  ");
    out.push(`INSERT INTO "ResultTemplateTrait" ("id", "branchId", "templateId", "groupId", "name", "sortOrder")
SELECT ${idOf("r", "trait", t.key, g.key)} || '_' || v.i, r."branchId", r."id", ${idOf("r", "group", t.key, g.key)}, v.name, v.i
FROM "ResultTemplate" r
JOIN "Branch" b ON r."id" = ${id("template", t.key)}
CROSS JOIN (VALUES
  ${rows}
) AS v(i, name)
WHERE EXISTS (SELECT 1 FROM "ResultTemplateTraitGroup" x WHERE x."id" = ${idOf("r", "group", t.key, g.key)})
  AND NOT EXISTS (SELECT 1 FROM "ResultTemplateTrait" x WHERE x."id" = ${idOf("r", "trait", t.key, g.key)} || '_' || v.i);
`);
  });
}
process.stdout.write(out.join("\n"));
