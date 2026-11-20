import { DiscountWorkflowMode, InvoiceStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  AGEING,
  kobo,
  monthSeries,
  ratePercent,
  sumTotals,
  totalsOf,
  type AgeingBucket,
  type ByStatus,
  type MonthRow,
  type StatusRow,
  type Totals,
} from "./stats";

// The queries behind Finance's Overview (task 0106). Everything is added up in the database (SUM, COUNT, GROUP BY), scoped by a branch id the CALLER has already checked; the browser draws what it
// is given. Read-only: nothing here writes.

const LIVE = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID];
const LIVE_SQL = Prisma.sql`('UNPAID'::"InvoiceStatus", 'PARTIALLY_PAID'::"InvoiceStatus", 'PAID'::"InvoiceStatus")`;
const OWED_SQL = Prisma.sql`('UNPAID'::"InvoiceStatus", 'PARTIALLY_PAID'::"InvoiceStatus")`;

/// A calendar date as the UTC midnight the database stores dates at.
const utcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/// The totals of one branch (all its terms, or one term): invoices by status, what is owed and how late, discounts, waived and cancelled.
export async function branchTotals(
  branchId: string,
  periodId: string | null,
  now: Date,
): Promise<{ totals: Totals; byStatus: ByStatus; ageing: Record<AgeingBucket, number> }> {
  const period = periodId ? { periodId } : {};
  const today = utcDay(now);
  const [grouped, aged, discounts, scholarships] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["status"],
      where: { branchId, ...period },
      _count: { _all: true },
      _sum: { totalAmount: true, amountPaid: true },
    }),
    prisma.$queryRaw<{ bucket: AgeingBucket; owed: Prisma.Decimal }[]>(Prisma.sql`
      SELECT CASE
               WHEN "dueDate" IS NULL OR "dueDate" >= ${today}::date THEN 'notDue'
               WHEN "dueDate" >= (${today}::date - 30) THEN 'd1to30'
               WHEN "dueDate" >= (${today}::date - 60) THEN 'd31to60'
               ELSE 'd61plus'
             END AS bucket,
             SUM("totalAmount" - "amountPaid") AS owed
      FROM "Invoice"
      WHERE "branchId" = ${branchId} AND status IN ${OWED_SQL} ${periodId ? Prisma.sql`AND "periodId" = ${periodId}` : Prisma.empty}
      GROUP BY 1`),
    prisma.invoiceDiscount.aggregate({
      where: { branchId, mode: { not: DiscountWorkflowMode.SCHOLARSHIP }, invoice: { ...period, status: { in: LIVE } } },
      _sum: { amount: true },
    }),
    // Scholarships are their own figure (task 0113 S1); neither they nor discounts are ever part of what was collected (that is payments only).
    prisma.invoiceDiscount.aggregate({
      where: { branchId, mode: DiscountWorkflowMode.SCHOLARSHIP, invoice: { ...period, status: { in: LIVE } } },
      _sum: { amount: true },
    }),
  ]);

  const byStatus: Partial<Record<keyof ByStatus, StatusRow>> = {};
  let waived = 0;
  let cancelled = 0;
  for (const g of grouped) {
    if (g.status === InvoiceStatus.WAIVED) waived = g._count._all;
    else if (g.status === InvoiceStatus.CANCELLED) cancelled = g._count._all;
    else
      byStatus[g.status as keyof ByStatus] = {
        count: g._count._all,
        invoicedKobo: kobo(g._sum.totalAmount),
        collectedKobo: kobo(g._sum.amountPaid),
      };
  }
  const ageing = Object.fromEntries(AGEING.map((b) => [b, 0])) as Record<AgeingBucket, number>;
  for (const row of aged) ageing[row.bucket] += kobo(row.owed);
  return {
    ...totalsOf({
      byStatus,
      ageing,
      discountsKobo: kobo(discounts._sum.amount),
      scholarshipsKobo: kobo(scholarships._sum.amount),
      waived,
      cancelled,
    }),
    ageing,
  };
}

export type ClassRow = { name: string; invoices: number; invoicedKobo: number; collectedKobo: number; ratePercent: number };
export type MethodRow = { label: string; payments: number; amountKobo: number };

export type BranchStats = {
  branchId: string;
  periodId: string | null;
  totals: Totals;
  byStatus: ByStatus;
  ageing: Record<AgeingBucket, number>;
  byClass: ClassRow[];
  byMethod: MethodRow[];
  months: MonthRow[];
};

/// A payment's channel in words ("card" -> "Card", null -> the provider's name).
const methodLabel = (channel: string | null, provider: string): string => {
  const raw = (channel ?? "").trim() || provider.toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/[_-]+/g, " ");
};

/// Everything the Overview shows for ONE branch, optionally limited to one of its terms. The month series is a calendar view of the last six months and ignores the term.
export async function branchStats(branchId: string, periodId: string | null, now: Date = new Date()): Promise<BranchStats> {
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const [{ totals, byStatus, ageing }, classRows, methods, invoicedByMonth, collectedByMonth] = await Promise.all([
    branchTotals(branchId, periodId, now),
    // The class each pupil was in for the invoice's own session (the latest active enrolment there); a pupil with none is "No class".
    prisma.$queryRaw<{ name: string; n: bigint; invoiced: Prisma.Decimal; collected: Prisma.Decimal }[]>(Prisma.sql`
      SELECT COALESCE(e."className", 'No class') AS name, COUNT(*) AS n, SUM(i."totalAmount") AS invoiced, SUM(i."amountPaid") AS collected
      FROM "Invoice" i
      JOIN "AcademicPeriod" p ON p."id" = i."periodId" AND p."branchId" = i."branchId"
      LEFT JOIN LATERAL (
        SELECT "className" FROM "StudentEnrollment"
        WHERE "studentId" = i."studentId" AND "branchId" = i."branchId" AND "sessionId" = p."sessionId" AND status = 'ACTIVE'
        ORDER BY "enrolledAt" DESC LIMIT 1
      ) e ON TRUE
      WHERE i."branchId" = ${branchId} AND i.status IN ${LIVE_SQL} ${periodId ? Prisma.sql`AND i."periodId" = ${periodId}` : Prisma.empty}
      GROUP BY 1
      ORDER BY SUM(i."totalAmount") DESC, 1
      LIMIT 12`),
    prisma.payment.groupBy({
      by: ["provider", "channel"],
      where: { branchId, status: PaymentStatus.SUCCESS, ...(periodId ? { invoice: { periodId } } : {}) },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ m: string; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS m, SUM("totalAmount") AS total
      FROM "Invoice" WHERE "branchId" = ${branchId} AND status IN ${LIVE_SQL} AND "createdAt" >= ${firstMonth}
      GROUP BY 1`),
    prisma.$queryRaw<{ m: string; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT to_char("paidAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS m, SUM(amount) AS total
      FROM "Payment" WHERE "branchId" = ${branchId} AND status = 'SUCCESS'::"PaymentStatus" AND "paidAt" IS NOT NULL AND "paidAt" >= ${firstMonth}
      GROUP BY 1`),
  ]);

  const byClass: ClassRow[] = classRows.map((r) => {
    const invoicedKobo = kobo(r.invoiced);
    const collectedKobo = kobo(r.collected);
    return { name: r.name, invoices: Number(r.n), invoicedKobo, collectedKobo, ratePercent: ratePercent(collectedKobo, invoicedKobo) };
  });

  // Methods with the same words (two providers, both "Card") are one line.
  const merged = new Map<string, MethodRow>();
  for (const m of methods) {
    const label = methodLabel(m.channel, m.provider);
    const line = merged.get(label) ?? { label, payments: 0, amountKobo: 0 };
    line.payments += m._count._all;
    line.amountKobo += kobo(m._sum.amount);
    merged.set(label, line);
  }
  const byMethod = [...merged.values()].sort((a, b) => b.amountKobo - a.amountKobo);

  const toMap = (rows: { m: string; total: Prisma.Decimal }[]) => new Map(rows.map((r) => [r.m, kobo(r.total)] as const));
  return {
    branchId,
    periodId,
    totals,
    byStatus,
    ageing,
    byClass,
    byMethod,
    months: monthSeries(now, 6, toMap(invoicedByMonth), toMap(collectedByMonth)),
  };
}

export type OverviewRow = { branchId: string; name: string; periodLabel: string | null; totals: Totals };
export type Overview = { scope: "current" | "all"; branches: OverviewRow[]; total: Totals };

/// Every branch in `branchIds`, one row each, and the total. `current` limits each branch to its own current term (a branch with none shows zeros and no term name); `all` is everything
/// ever invoiced. The caller has already narrowed `branchIds` to the branches the viewer may read.
export async function overview(branchIds: readonly string[], scope: "current" | "all", now: Date = new Date()): Promise<Overview> {
  const [branches, currents] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: [...branchIds] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    scope === "current"
      ? prisma.academicPeriod.findMany({
          where: { branchId: { in: [...branchIds] }, isCurrent: true, archivedAt: null },
          select: { id: true, branchId: true, label: true },
        })
      : Promise.resolve([]),
  ]);
  const current = new Map(currents.map((p) => [p.branchId, p]));
  const rows = await Promise.all(
    branches.map(async (b): Promise<OverviewRow> => {
      const period = current.get(b.id);
      if (scope === "current" && !period) return { branchId: b.id, name: b.name, periodLabel: null, totals: sumTotals([]) };
      const { totals } = await branchTotals(b.id, period?.id ?? null, now);
      return { branchId: b.id, name: b.name, periodLabel: period?.label ?? null, totals };
    }),
  );
  return { scope, branches: rows, total: sumTotals(rows.map((r) => r.totals)) };
}
