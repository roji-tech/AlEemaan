import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SEED_TEMPLATES, seedId } from "@/lib/results/seed-templates";
import { schoolSeedId } from "@/lib/results/school-template-seed";
import { createRowFromMaster, liveSeedMasters } from "@/lib/results/school-templates";

// Seeds the school's four printed report-card templates for ONE branch (task 0116), now FROM the school-wide masters (task 0120): each row is made from its master's CURRENT definition and follows
// it, so a branch made after the superadmin edited a master starts on the edited card. The application's twin of the migration's backfill: the template row keeps the migration's id
// (seedId(branch, "template", key)), so a branch seeded by one is never seeded again by the other. Idempotent and safe to call often: a branch that already has all four ids (even archived ones:
// an archived template is not brought back) returns after one count. A name already taken by a live row of the branch is skipped, never an error; a master the superadmin archived is not given to
// new branches; a scheme or scale name the branch owns is left alone (the row then has none: "as the branch does today"). The grade scales are never the branch's default.

type Tx = Prisma.TransactionClient;
const lock = (tx: Tx, branchId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result-template:${branchId}`}::text))`;

async function seed(tx: Tx, branchId: string) {
  await lock(tx, branchId);
  const ids = SEED_TEMPLATES.map((t) => seedId(branchId, "template", t.key));
  if ((await tx.resultTemplate.count({ where: { id: { in: ids } } })) === SEED_TEMPLATES.length) return false;
  const masters = await liveSeedMasters(tx);
  for (const t of SEED_TEMPLATES) {
    const master = masters.get(schoolSeedId(t.key));
    if (!master) continue;
    const rowId = seedId(branchId, "template", t.key);
    if (await tx.resultTemplate.findUnique({ where: { id: rowId }, select: { id: true } })) continue;
    if (
      await tx.resultTemplate.findFirst({
        where: { branchId, archivedAt: null, name: { equals: master.name, mode: "insensitive" } },
        select: { id: true },
      })
    )
      continue;
    await createRowFromMaster(tx, { master, branchId, rowId, actorUserId: null, strict: false });
  }
  return true;
}

/// Seeds the four templates of one branch if they are not there. Pass the caller's transaction, or nothing to make one.
export async function ensureReportTemplates(branchId: string, tx?: Tx): Promise<boolean> {
  return tx ? seed(tx, branchId) : prisma.$transaction((t) => seed(t, branchId));
}
