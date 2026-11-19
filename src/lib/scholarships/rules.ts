import { Prisma } from "@prisma/client";

// Scholarships (task 0113 S1; the maintainer 2026-11-19: "we also have students with scholarships", "scholarship can be of different types", "some students might be marked paid through
// scholarship"). The pure rules, no database: a share is a whole percent from 1 to 100; a pupil's live shares together never pass 100; when a scholarship is live; what it takes off an invoice
// (rounded to the kobo, never more than what is left); and when an invoice counts as paid by scholarship.

export const MIN_PERCENT = 1;
export const MAX_PERCENT = 100;

export const isPercent = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= MIN_PERCENT && n <= MAX_PERCENT;

/// The share's words: "Full scholarship" for 100, else "50%".
export const percentText = (percent: number): string => (percent >= MAX_PERCENT ? "Full" : `${percent}%`);

export type Live = { percent: number; startsOn: string | null; endsOn: string | null; endedAt: Date | string | null };

/// Is the scholarship live on `day` (YYYY-MM-DD, the school's day)? Not ended, started (or no start), and not past its last day (or no end). The first and last days count.
export function liveOn(s: Pick<Live, "startsOn" | "endsOn" | "endedAt">, day: string): boolean {
  if (s.endedAt) return false;
  if (s.startsOn && s.startsOn > day) return false;
  if (s.endsOn && s.endsOn < day) return false;
  return true;
}

/// The live shares together, and whether `extra` more still fits under 100. The same pupil's other live scholarships, not counting `exceptId` (the one being changed).
export function totalPercent(list: readonly (Live & { id?: string })[], day: string, exceptId?: string): number {
  return list.filter((s) => s.id !== exceptId && liveOn(s, day)).reduce((n, s) => n + s.percent, 0);
}
export function fitsUnder100(list: readonly (Live & { id?: string })[], day: string, percent: number, exceptId?: string): boolean {
  return totalPercent(list, day, exceptId) + percent <= MAX_PERCENT;
}

/// The most the pupil's scholarships ever add up to inside `candidate`'s days, counting the candidate: the shares of the others (not ended, `exceptId` left out) whose days overlap are summed at
/// every day a scholarship starts, which is where the sum can rise. It must stay at or under 100 for the candidate to be allowed (two half scholarships that never overlap are fine).
export function peakPercent(
  others: readonly (Live & { id?: string })[],
  candidate: { percent: number; startsOn: string | null; endsOn: string | null },
  exceptId?: string,
): number {
  const list = others.filter((o) => o.id !== exceptId && !o.endedAt);
  const from = candidate.startsOn ?? "0000-01-01";
  const to = candidate.endsOn ?? "9999-12-31";
  const days = new Set<string>([from]);
  for (const o of list) if (o.startsOn && o.startsOn > from && o.startsOn <= to) days.add(o.startsOn);
  let peak = 0;
  for (const day of days) {
    const sum = list.reduce((n, o) => n + ((o.startsOn ?? "0000-01-01") <= day && (o.endsOn ?? "9999-12-31") >= day ? o.percent : 0), 0);
    peak = Math.max(peak, sum + candidate.percent);
  }
  return peak;
}

/// Naira text of a number for messages.
const naira = (d: Prisma.Decimal) => `₦${d.toFixed(2)}`;
export { naira as nairaText };

/// What one scholarship takes off a gross amount: the percent of it, rounded half up to the kobo (2 decimal places).
export function discountFor(gross: Prisma.Decimal.Value, percent: number): Prisma.Decimal {
  return new Prisma.Decimal(gross).mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/// The discounts to add for these scholarships on an invoice (task 0113 S1, finance): each one's share of the GROSS (the fees before any discount), rounded to the kobo, and never more than is
/// left of `room` (what the invoice still owes, so discounts together can never pass what there is to take off; rounding up three shares must not create a kobo that is not there). Shares of
/// zero are skipped. In the order given.
export function planDiscounts<S extends { id: string; percent: number }>(
  gross: Prisma.Decimal.Value,
  scholarships: readonly S[],
  room: Prisma.Decimal.Value,
): { scholarship: S; amount: Prisma.Decimal }[] {
  let left = new Prisma.Decimal(room);
  const plan: { scholarship: S; amount: Prisma.Decimal }[] = [];
  for (const scholarship of scholarships) {
    if (left.lte(0)) break;
    let amount = discountFor(gross, scholarship.percent);
    if (amount.gt(left)) amount = left;
    if (amount.lte(0)) continue;
    plan.push({ scholarship, amount });
    left = left.sub(amount);
  }
  return plan;
}

type Money = Prisma.Decimal.Value;
export type InvoiceFacts = { status: string; totalAmount: Money; amountPaid: Money; discounts: readonly { amount: Money; mode: string }[] };

/// What the scholarships on an invoice add up to (discounts of the SCHOLARSHIP kind).
export function scholarshipTotal(discounts: readonly { amount: Money; mode: string }[]): Prisma.Decimal {
  return discounts.filter((d) => d.mode === "SCHOLARSHIP").reduce((n, d) => n.add(new Prisma.Decimal(d.amount)), new Prisma.Decimal(0));
}

/// Is this invoice "Paid by scholarship" (task 0113 S1): it is settled, no money was paid on it, and scholarships took the fees off. A part-paid or paid-in-money invoice with a smaller
/// scholarship is simply paid; its discount rows say what the scholarship did.
export function paidByScholarship(invoice: InvoiceFacts): boolean {
  return invoice.status === "PAID" && new Prisma.Decimal(invoice.amountPaid).lte(0) && scholarshipTotal(invoice.discounts).gt(0);
}

/// An invoice's status after discounts (task 0113 S1): the status money alone gives, except that an invoice whose whole fee scholarships took off (nothing left to pay, a scholarship in
/// the discounts) is PAID: the existing rule would leave it UNPAID at zero. Anything else, a manual discount that reaches the total included, keeps the status it always had.
export function statusAfterDiscounts(moneyStatus: string, net: Money, discounts: readonly { amount: Money; mode: string }[]): string {
  if (new Prisma.Decimal(net).lte(0) && scholarshipTotal(discounts).gt(0)) return "PAID";
  return moneyStatus;
}
