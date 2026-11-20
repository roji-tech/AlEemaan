import { createHash } from "node:crypto";

// The school's four printed report cards as SCHOOL-WIDE templates (task 0120): the masters the branches' own rows follow. Built from the same constants that seed a branch (seed-templates.ts),
// so the migration's backfill (scripts/gen-school-template-sql.mjs prints it), a school with no rows yet, and the branches already seeded all agree. Nothing here is a rule: the superadmin edits the
// masters in Results > School templates. This file imports nothing from the app on purpose: the script runs it under plain Node.

type SeedGroup = { key: string; title: string; showSign: boolean; traits: readonly string[] };
type SeedBand = { min: number; max: number; letter: string; remark: string };
type SeedTemplateLike = { key: string; name: string; description: string; layoutCode: string; scale: string; groups: readonly SeedGroup[] };
type SeedSchemeLike = { name: string; totalMax: number; examMax: number; components: readonly { name: string; maxScore: number }[] };
type SeedScalesLike = Record<string, { name: string; unconfirmed?: boolean; bands: readonly SeedBand[] }>;

/// A key from a name: lower-case, anything that is not a letter or digit becomes one dash, no dash at either end, at most 40 characters. The unit test checks the seeded names against the
/// migration's keys.
export function slugKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/// A master's id: 'sct_' plus the md5 of 'school-template:' and the card's key, the text the migration builds with SQL `'sct_' || md5(...)`.
export const schoolSeedId = (key: string): string => "sct_" + createHash("md5").update(`school-template:${key}`).digest("hex");

export function buildSchoolSeeds(templates: readonly SeedTemplateLike[], scheme: SeedSchemeLike, scales: SeedScalesLike) {
  return templates.map((t) => {
    const scale = scales[t.scale];
    return {
      id: schoolSeedId(t.key),
      key: t.key,
      name: t.name,
      description: t.description,
      layoutCode: t.layoutCode,
      definition: {
        scheme: {
          name: scheme.name,
          totalMax: scheme.totalMax,
          examMax: scheme.examMax,
          components: scheme.components.map((c) => ({ name: c.name, maxScore: c.maxScore })),
        },
        scale: {
          name: scale.name,
          unconfirmed: scale.unconfirmed === true,
          bands: scale.bands.map((b) => ({ min: b.min, max: b.max, letter: b.letter, remark: b.remark })),
        },
        groups: t.groups.map((g) => ({
          key: g.key,
          title: g.title,
          showSign: g.showSign,
          traits: g.traits.map((name) => ({ key: slugKey(name), name })),
        })),
      },
    };
  });
}
