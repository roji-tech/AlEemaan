// The figures of Finance's Overview (task 0106): pure, so every rule is tested without a database. Money is integer KOBO from the moment it leaves the database (`kobo`), so a total or a rate is
// never a rounded float summed thousands of times; the naira text is `formatNaira`'s job on the way to the screen.

import type { DecimalLike } from "./format";

/// Naira (a Prisma Decimal, a string or a number) to whole kobo. Null and garbage are 0.
export function kobo(naira: DecimalLike | null | undefined): number {
  if (naira === null || naira === undefined) return 0;
  const n = typeof naira === "number" ? naira : Number(naira.toString());
  // `toPrecision(15)` drops the float noise first: 1.005 * 100 is 100.49999999999999, which would round to 100 instead of 101.
  return Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(15))) : 0;
}

/// Collected over invoiced as a percentage with one decimal: 0 when nothing is invoiced, never above 100 (an overpayment is not a rate above one).
export function ratePercent(collectedKobo: number, invoicedKobo: number): number {
  if (invoicedKobo <= 0) return 0;
  return Math.min(100, Math.round((collectedKobo * 1000) / invoicedKobo) / 10);
}

export const AGEING = ["notDue", "d1to30", "d31to60", "d61plus"] as const;
export type AgeingBucket = (typeof AGEING)[number];
export const AGEING_WORDS: Record<AgeingBucket, string> = {
  notDue: "Not yet due",
  d1to30: "1 to 30 days overdue",
  d31to60: "31 to 60 days overdue",
  d61plus: "Over 60 days overdue",
};

const DAY_MS = 86_400_000;
/// The day number (days since 1970-01-01) of a calendar date held as UTC midnight, and of today's date in UTC: both sides of every comparison are days, never instants.
export const dayOf = (date: Date): number => Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);

/// The bucket an unpaid amount falls in: no due date, or not past it, is "not yet due"; otherwise by whole days past it. The due day itself is not overdue.
export function ageingBucket(dueDate: Date | null, today: Date): AgeingBucket {
  if (!dueDate) return "notDue";
  const late = dayOf(today) - dayOf(dueDate);
  if (late <= 0) return "notDue";
  if (late <= 30) return "d1to30";
  if (late <= 60) return "d31to60";
  return "d61plus";
}

/// The last `count` calendar months ending with the one that holds `now`, oldest first, as "YYYY-MM" (UTC, the way the database truncates).
export function monthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
export const monthKeyOf = (date: Date): string => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export type StatusRow = { count: number; invoicedKobo: number; collectedKobo: number };
export type ByStatus = { UNPAID: StatusRow; PARTIALLY_PAID: StatusRow; PAID: StatusRow };
export type Totals = {
  /// Invoices that are not Cancelled or Waived.
  invoices: number;
  invoicedKobo: number;
  collectedKobo: number;
  /// Still owed on the invoices that are Unpaid or Partially paid.
  outstandingKobo: number;
  /// The part of it that is past its due date.
  overdueKobo: number;
  /// Discounts given (already taken off an invoice's total; shown on their own line).
  discountsKobo: number;
  waived: number;
  cancelled: number;
  ratePercent: number;
};

const emptyRow = (): StatusRow => ({ count: 0, invoicedKobo: 0, collectedKobo: 0 });

/// The totals of one branch from what the database answered: the invoices grouped by status, the ageing of what is owed, the discounts, and the waived and cancelled counts.
export function totalsOf(input: {
  byStatus: Partial<Record<keyof ByStatus, StatusRow>>;
  ageing: Record<AgeingBucket, number>;
  discountsKobo: number;
  waived: number;
  cancelled: number;
}): { totals: Totals; byStatus: ByStatus } {
  const byStatus: ByStatus = {
    UNPAID: input.byStatus.UNPAID ?? emptyRow(),
    PARTIALLY_PAID: input.byStatus.PARTIALLY_PAID ?? emptyRow(),
    PAID: input.byStatus.PAID ?? emptyRow(),
  };
  const rows = Object.values(byStatus);
  const invoicedKobo = rows.reduce((n, r) => n + r.invoicedKobo, 0);
  const collectedKobo = rows.reduce((n, r) => n + r.collectedKobo, 0);
  const owed =
    byStatus.UNPAID.invoicedKobo -
    byStatus.UNPAID.collectedKobo +
    (byStatus.PARTIALLY_PAID.invoicedKobo - byStatus.PARTIALLY_PAID.collectedKobo);
  const overdueKobo = input.ageing.d1to30 + input.ageing.d31to60 + input.ageing.d61plus;
  return {
    byStatus,
    totals: {
      invoices: rows.reduce((n, r) => n + r.count, 0),
      invoicedKobo,
      collectedKobo,
      outstandingKobo: Math.max(owed, 0),
      overdueKobo,
      discountsKobo: input.discountsKobo,
      waived: input.waived,
      cancelled: input.cancelled,
      ratePercent: ratePercent(collectedKobo, invoicedKobo),
    },
  };
}

/// The total of several branches' totals: sums the money and the counts, and works the rate out again from the sums (an average of rates would be wrong).
export function sumTotals(list: readonly Totals[]): Totals {
  const sum = (pick: (t: Totals) => number) => list.reduce((n, t) => n + pick(t), 0);
  const invoicedKobo = sum((t) => t.invoicedKobo);
  const collectedKobo = sum((t) => t.collectedKobo);
  return {
    invoices: sum((t) => t.invoices),
    invoicedKobo,
    collectedKobo,
    outstandingKobo: sum((t) => t.outstandingKobo),
    overdueKobo: sum((t) => t.overdueKobo),
    discountsKobo: sum((t) => t.discountsKobo),
    waived: sum((t) => t.waived),
    cancelled: sum((t) => t.cancelled),
    ratePercent: ratePercent(collectedKobo, invoicedKobo),
  };
}

export type MonthRow = { month: string; invoicedKobo: number; collectedKobo: number };
/// Six (or `count`) months in order, every month present, zero where nothing happened, from the database's rows for the months that had something.
export function monthSeries(
  now: Date,
  count: number,
  invoiced: ReadonlyMap<string, number>,
  collected: ReadonlyMap<string, number>,
): MonthRow[] {
  return monthKeys(now, count).map((month) => ({
    month,
    invoicedKobo: invoiced.get(month) ?? 0,
    collectedKobo: collected.get(month) ?? 0,
  }));
}

/// Kobo as a short naira amount for a chart label: ₦950, ₦12.5K, ₦1.2M, ₦3.4B. Whole naira under ₦1,000 and one decimal above, trailing ".0" dropped.
export function compactNaira(amountKobo: number): string {
  const naira = amountKobo / 100;
  const abs = Math.abs(naira);
  const trim = (n: number) => String(Math.round(n * 10) / 10).replace(/\.0$/, "");
  if (abs >= 1e9) return `₦${trim(naira / 1e9)}B`;
  if (abs >= 1e6) return `₦${trim(naira / 1e6)}M`;
  if (abs >= 1e3) return `₦${trim(naira / 1e3)}K`;
  return `₦${Math.round(naira).toLocaleString("en-NG")}`;
}
