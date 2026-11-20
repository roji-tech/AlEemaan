import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SEED_SCALES, SEED_SCHEME, SEED_TEMPLATES, seedId } from "@/lib/results/seed-templates";

// Seeds the school's four printed report-card templates for ONE branch (task 0116), the application's twin of the migration's backfill: same data (seed-templates.ts), same ids, so a
// branch seeded by one is never seeded again by the other. Idempotent and safe to call often: a branch that already has all four ids (even archived ones: an archived template is not
// brought back) returns after one count. A name already taken by a live row of the branch is skipped, never an error; the grade scales are never the branch's default.

type Tx = Prisma.TransactionClient;
const lock = (tx: Tx, branchId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result-template:${branchId}`}::text))`;

async function seed(tx: Tx, branchId: string) {
  await lock(tx, branchId);
  const ids = SEED_TEMPLATES.map((t) => seedId(branchId, "template", t.key));
  if ((await tx.resultTemplate.count({ where: { id: { in: ids } } })) === SEED_TEMPLATES.length) return false;

  // The shared marks structure.
  const schemeId = seedId(branchId, "scheme");
  if (!(await tx.assessmentScheme.findUnique({ where: { id: schemeId }, select: { id: true } }))) {
    const taken = await tx.assessmentScheme.findFirst({
      where: { branchId, name: SEED_SCHEME.name, archivedAt: null },
      select: { id: true },
    });
    if (!taken) {
      await tx.assessmentScheme.create({
        data: {
          id: schemeId,
          branchId,
          name: SEED_SCHEME.name,
          totalMax: SEED_SCHEME.totalMax,
          examMax: SEED_SCHEME.examMax,
          hosted: true,
        },
      });
      await tx.assessmentComponent.createMany({
        data: SEED_SCHEME.components.map((c, i) => ({
          id: seedId(branchId, "component", String(i)),
          branchId,
          schemeId,
          name: c.name,
          maxScore: c.maxScore,
          sortOrder: i,
        })),
      });
    }
  }
  // The three grade scales (never the default scale).
  for (const scale of Object.values(SEED_SCALES)) {
    const scaleId = seedId(branchId, scale.key);
    if (await tx.gradeScale.findUnique({ where: { id: scaleId }, select: { id: true } })) continue;
    if (await tx.gradeScale.findFirst({ where: { branchId, name: scale.name, archivedAt: null }, select: { id: true } })) continue;
    await tx.gradeScale.create({ data: { id: scaleId, branchId, name: scale.name, isDefault: false } });
    await tx.gradeBand.createMany({
      data: scale.bands.map((b, i) => ({
        id: `${seedId(branchId, "band", scale.key)}_${i}`,
        branchId,
        scaleId,
        minScore: b.min,
        maxScore: b.max,
        letter: b.letter,
        remark: b.remark,
        sortOrder: i,
      })),
    });
  }
  const schemeExists = !!(await tx.assessmentScheme.findUnique({ where: { id: schemeId }, select: { id: true } }));
  // The templates, their trait groups and traits.
  for (const t of SEED_TEMPLATES) {
    const id = seedId(branchId, "template", t.key);
    if (await tx.resultTemplate.findUnique({ where: { id }, select: { id: true } })) continue;
    if (
      await tx.resultTemplate.findFirst({
        where: { branchId, archivedAt: null, name: { equals: t.name, mode: "insensitive" } },
        select: { id: true },
      })
    )
      continue;
    const scaleId = seedId(branchId, SEED_SCALES[t.scale].key);
    const scaleExists = !!(await tx.gradeScale.findUnique({ where: { id: scaleId }, select: { id: true } }));
    await tx.resultTemplate.create({
      data: {
        id,
        branchId,
        name: t.name,
        description: t.description,
        layoutCode: t.layoutCode,
        schemeId: schemeExists ? schemeId : null,
        gradeScaleId: scaleExists ? scaleId : null,
        isDefault: false,
      },
    });
    for (const [gi, g] of t.groups.entries()) {
      const groupId = seedId(branchId, "group", t.key, g.key);
      await tx.resultTemplateTraitGroup.create({
        data: { id: groupId, branchId, templateId: id, title: g.title, sortOrder: gi, showSign: g.showSign },
      });
      await tx.resultTemplateTrait.createMany({
        data: g.traits.map((name, i) => ({
          id: `${seedId(branchId, "trait", t.key, g.key)}_${i}`,
          branchId,
          templateId: id,
          groupId,
          name,
          sortOrder: i,
        })),
      });
    }
  }
  return true;
}

/// Seeds the four templates of one branch if they are not there. Pass the caller's transaction, or nothing to make one.
export async function ensureReportTemplates(branchId: string, tx?: Tx): Promise<boolean> {
  return tx ? seed(tx, branchId) : prisma.$transaction((t) => seed(t, branchId));
}
