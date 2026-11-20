import { Prisma } from "@prisma/client";
import { SETTLED_TEXT, type SettledBy } from "@/lib/finance/format";

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

/// The part of an invoice a scholarship's percent is taken of (task 0122): the sum of its lines, leaving out lines the fee set "scholarship does not cover" (their snapshot says `covered: false`; a
/// snapshot made before the setting existed has no `covered`, which counts as covered, so nothing that was already invoiced changes). Never negative; unreadable amounts count as nothing.
export function coveredGross(lineItems: readonly { amount: Prisma.Decimal.Value; covered?: boolean }[]): Prisma.Decimal {
  let sum = new Prisma.Decimal(0);
  for (const item of lineItems) {
    if (item.covered === false) continue;
    try {
      const a = new Prisma.Decimal(item.amount);
      if (a.gt(0)) sum = sum.add(a);
    } catch {
      /* an unreadable amount adds nothing */
    }
  }
  return sum;
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

/// The top-up a raised share gives an invoice that already carries this scholarship (2026-11-19: "Apply the change to open invoices"): the share's amount now (of the GROSS, to the kobo) less what
/// the scholarship has already given THIS invoice, never more than the invoice still owes, never below nothing. A share that was lowered, or an invoice that already has what the share asks,
/// gives zero, so pressing it twice, or after a lowering, changes nothing.
export function planTopUp(
  gross: Prisma.Decimal.Value,
  percent: number,
  alreadyGiven: Prisma.Decimal.Value,
  balance: Prisma.Decimal.Value,
): Prisma.Decimal {
  const given = new Prisma.Decimal(alreadyGiven);
  let target = discountFor(gross, percent);
  const ceiling = given.add(new Prisma.Decimal(balance).lt(0) ? 0 : balance);
  if (target.gt(ceiling)) target = ceiling;
  const delta = target.sub(given);
  return delta.gt(0) ? delta : new Prisma.Decimal(0);
}

type Money = Prisma.Decimal.Value;
export type InvoiceFacts = { status: string; totalAmount: Money; amountPaid: Money; discounts: readonly { amount: Money; mode: string }[] };

const sum = (list: readonly { amount: Money }[]): Prisma.Decimal =>
  list.reduce((n, d) => n.add(new Prisma.Decimal(d.amount)), new Prisma.Decimal(0));

/// What the scholarships on an invoice add up to (discounts of the SCHOLARSHIP kind).
export function scholarshipTotal(discounts: readonly { amount: Money; mode: string }[]): Prisma.Decimal {
  return sum(discounts.filter((d) => d.mode === "SCHOLARSHIP"));
}

/// What settled an invoice that nobody paid money on (the maintainer approved this on 2026-11-19, "settle any invoice whose balance reaches zero"):
///   SCHOLARSHIP -> "Paid by scholarship"; WAIVED (a manual override) -> "Waived"; DISCOUNT (a sibling or a staff-child discount) -> "Paid by discount".
/// Several kinds on one invoice: the kind that took the MOST off names it (sibling and staff-child together count as one kind, "discount"); on an exact tie the order is scholarship, then
/// discount, then waived (the kind that says the most about why nothing is owed wins). An invoice with money paid on it is simply Paid, and so is one nothing took anything off.
export { SETTLED_TEXT, type SettledBy };
const KIND_OF_MODE: Record<string, SettledBy> = {
  SCHOLARSHIP: "SCHOLARSHIP",
  SIBLING_DISCOUNT: "DISCOUNT",
  STAFF_CHILD: "DISCOUNT",
  MANUAL_OVERRIDE: "WAIVED",
};
const TIE_ORDER: readonly SettledBy[] = ["SCHOLARSHIP", "DISCOUNT", "WAIVED"];

export function settledBy(invoice: InvoiceFacts): SettledBy | null {
  if (invoice.status !== "PAID" || new Prisma.Decimal(invoice.amountPaid).gt(0)) return null;
  const totals = new Map<SettledBy, Prisma.Decimal>();
  for (const d of invoice.discounts) {
    const kind = KIND_OF_MODE[d.mode] ?? "WAIVED";
    totals.set(kind, (totals.get(kind) ?? new Prisma.Decimal(0)).add(new Prisma.Decimal(d.amount)));
  }
  let best: SettledBy | null = null;
  for (const kind of TIE_ORDER) {
    const amount = totals.get(kind);
    if (!amount || amount.lte(0)) continue;
    if (best === null || amount.gt(totals.get(best)!)) best = kind;
  }
  return best;
}

/// Is this invoice "Paid by scholarship" (task 0113 S1)? The scholarships took off more than anything else did, and nobody paid money on it.
export const paidByScholarship = (invoice: InvoiceFacts): boolean => settledBy(invoice) === "SCHOLARSHIP";

/// An invoice's status after discounts (task 0113 S1; widened on 2026-11-19): the status money alone gives, except that an invoice with nothing left to pay because discounts took the whole
/// fee off (of any kind: scholarship, manual, sibling, staff-child) is PAID: the money-only rule would leave it UNPAID at zero, and it would sit on arrears lists and reminders. An invoice
/// nothing was taken off keeps what money says.
export function statusAfterDiscounts(moneyStatus: string, net: Money, discounts: readonly { amount: Money; mode: string }[]): string {
  if (new Prisma.Decimal(net).lte(0) && sum(discounts).gt(0)) return "PAID";
  return moneyStatus;
}
