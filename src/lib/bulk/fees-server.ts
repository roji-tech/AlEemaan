import { formatNaira } from "@/lib/finance/format";
import { feeEntity, type FeeRow } from "./fees";
import type { ServerKind, Tx } from "./server";
import type { Problem } from "./types";

// The server half of the fee kind (task 0084): the period and the class are found by NAME in this branch (a name that is not there, or that two periods share, is a problem on the
// row), a fee line that already exists for that period, class, name and kind of pupil is refused, and the save writes every line or none. Saving a fee line does not change an invoice already issued:
// an invoice keeps its own line-item snapshot.

export type FeeBulkCtx = { branchId: string };
type Resolved = { periodId: string; classGroupId: string | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function lookups(db: Tx, branchId: string) {
  const [periods, classes] = await Promise.all([
    db.academicPeriod.findMany({
      where: { branchId, archivedAt: null, session: { archivedAt: null } },
      select: { id: true, label: true, session: { select: { label: true } } },
    }),
    db.classGroup.findMany({ where: { branchId, archivedAt: null }, select: { id: true, name: true } }),
  ]);
  return { periods: periods.map((p) => ({ id: p.id, label: p.label, full: `${p.label} (${p.session.label})` })), classes };
}
type Lookups = Awaited<ReturnType<typeof lookups>>;

function resolve(l: Lookups, row: FeeRow): { ok: true; at: Resolved } | { ok: false; problems: Problem[] } {
  const problems: Problem[] = [];
  let periodId: string | null = null;
  const exact = l.periods.filter((p) => same(p.full, row.period));
  const byLabel = l.periods.filter((p) => same(p.label, row.period));
  const hits = exact.length > 0 ? exact : byLabel;
  if (hits.length === 1) periodId = hits[0].id;
  else if (hits.length > 1)
    problems.push({ column: "period", message: `More than one period is called "${row.period}". Add the session, like ${hits[0].full}.` });
  else
    problems.push({
      column: "period",
      message: `There is no period called "${row.period}" in this branch. Use it as the Finance screen shows it, like ${l.periods[0]?.full ?? "1st Term (2026/2027)"}.`,
    });

  let classGroupId: string | null = null;
  if (row.classGroup) {
    const hit = l.classes.find((c) => same(c.name, row.classGroup!));
    if (hit) classGroupId = hit.id;
    else
      problems.push({
        column: "classGroup",
        message: `There is no class called "${row.classGroup}" in this branch. Leave it empty for every class.`,
      });
  }
  return problems.length > 0 || periodId === null ? { ok: false, problems } : { ok: true, at: { periodId, classGroupId } };
}

export const feeKind: ServerKind<FeeRow, FeeBulkCtx> = {
  entity: feeEntity,
  auditAction: "FEE_STRUCTURES_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId }),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    const l = await lookups(db, ctx.branchId);
    const at = new Map<number, Resolved>();
    for (const r of rows) {
      const res = resolve(l, r.row);
      if (res.ok) at.set(r.line, res.at);
      else found.set(r.line, res.problems);
    }
    const periodIds = [...new Set([...at.values()].map((a) => a.periodId))];
    if (periodIds.length === 0) return found;
    const existing = await db.feeStructure.findMany({
      where: { branchId: ctx.branchId, periodId: { in: periodIds } },
      select: {
        periodId: true,
        classGroupId: true,
        name: true,
        amount: true,
        audienceAdmission: true,
        audienceGender: true,
        audienceResidence: true,
      },
    });
    for (const r of rows) {
      const here = at.get(r.line);
      if (!here) continue;
      // The same line for the same kind of pupil (task 0122): the boys' uniform and the girls' uniform are two lines of one name.
      const hit = existing.find(
        (e) =>
          e.periodId === here.periodId &&
          e.classGroupId === here.classGroupId &&
          same(e.name, r.row.name) &&
          e.audienceAdmission === (r.row.admission ?? null) &&
          e.audienceGender === (r.row.gender ?? null) &&
          e.audienceResidence === (r.row.residence ?? null),
      );
      if (hit)
        found.set(r.line, [
          { column: "name", message: `This fee line already exists for that period and class (${formatNaira(hit.amount.toString())}).` },
        ]);
    }
    return found;
  },
  async save(tx, rows, ctx) {
    const l = await lookups(tx, ctx.branchId);
    for (const { row } of rows) {
      const res = resolve(l, row);
      if (!res.ok) throw new Error(res.problems[0].message); // true a moment ago, in this same transaction: if not now, nothing is saved
      await tx.feeStructure.create({
        data: {
          branchId: ctx.branchId,
          periodId: res.at.periodId,
          classGroupId: res.at.classGroupId,
          name: row.name.trim(),
          amount: row.amount,
          audienceAdmission: row.admission ?? null,
          audienceGender: row.gender ?? null,
          audienceResidence: row.residence ?? null,
          optional: row.optional ?? false,
          trackHandover: row.trackHandover ?? false,
          scholarshipCovers: row.scholarshipCovers ?? true,
        },
      });
    }
  },
};
