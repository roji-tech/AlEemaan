// Trait ratings and attendance on a report card, the pure rules (task 0116): no database, no clock, safe for the browser. The server (`report-traits.ts`) and the screens both read these.

/// The 1 to 5 scale every trait is rated on, as printed on the pre-school and basic cards (5 Excellent, 4 V. Good, 3 Good, 2 Fair; 1 = Poor is added: the printed scale stops at 2).
export const TRAIT_SCALE: readonly { rating: number; label: string }[] = [
  { rating: 5, label: "Excellent" },
  { rating: 4, label: "V. Good" },
  { rating: 3, label: "Good" },
  { rating: 2, label: "Fair" },
  { rating: 1, label: "Poor" },
];
export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const MAX_RATINGS_PER_SAVE = 80;
export const MAX_DAYS = 366;

export const isRating = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= RATING_MIN && n <= RATING_MAX;
export const ratingLabel = (rating: number): string => TRAIT_SCALE.find((s) => s.rating === rating)?.label ?? "";

export type RatingChange = { traitId: string; rating: number | null };
export type RatingProblem = "EMPTY" | "TOO_MANY" | "DUPLICATE" | "RANGE" | "UNKNOWN_TRAIT";

/// Checks a save of ratings: at most one change per trait, a rating from 1 to 5 (or null to clear it), and only traits that belong to the pupil's template (`allowed`). The first
/// problem found, with the trait it is about, or null when it can be saved.
export function checkRatings(
  changes: readonly RatingChange[],
  allowed: ReadonlySet<string>,
): { problem: RatingProblem; traitId?: string } | null {
  if (changes.length === 0) return { problem: "EMPTY" };
  if (changes.length > MAX_RATINGS_PER_SAVE) return { problem: "TOO_MANY" };
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.traitId)) return { problem: "DUPLICATE", traitId: c.traitId };
    seen.add(c.traitId);
    if (!allowed.has(c.traitId)) return { problem: "UNKNOWN_TRAIT", traitId: c.traitId };
    if (c.rating !== null && !isRating(c.rating)) return { problem: "RANGE", traitId: c.traitId };
  }
  return null;
}
export const RATING_MESSAGES: Record<RatingProblem, string> = {
  EMPTY: "Choose at least one rating.",
  TOO_MANY: `Rate at most ${MAX_RATINGS_PER_SAVE} traits at a time.`,
  DUPLICATE: "A trait was given twice.",
  RANGE: `A rating is from ${RATING_MIN} (Poor) to ${RATING_MAX} (Excellent).`,
  UNKNOWN_TRAIT: "One of those traits is not on this pupil's report card.",
};

export type AttendanceNumbers = { timesOpen: number | null; timesPresent: number | null; timesAbsent: number | null };
export type AttendanceProblem = "RANGE" | "PRESENT_ABOVE_OPEN" | "ABSENT_ABOVE_OPEN";

/// Entered attendance: whole numbers from 0 to 366; present and absent may not exceed the times the school opened when that is known. Null means "use the register".
export function checkAttendance(a: AttendanceNumbers): AttendanceProblem | null {
  for (const n of [a.timesOpen, a.timesPresent, a.timesAbsent])
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > MAX_DAYS)) return "RANGE";
  if (a.timesOpen !== null && a.timesPresent !== null && a.timesPresent > a.timesOpen) return "PRESENT_ABOVE_OPEN";
  if (a.timesOpen !== null && a.timesAbsent !== null && a.timesAbsent > a.timesOpen) return "ABSENT_ABOVE_OPEN";
  return null;
}
export const ATTENDANCE_MESSAGES: Record<AttendanceProblem, string> = {
  RANGE: `Use whole numbers from 0 to ${MAX_DAYS}.`,
  PRESENT_ABOVE_OPEN: "Times present cannot be more than the times the school opened.",
  ABSENT_ABOVE_OPEN: "Times absent cannot be more than the times the school opened.",
};

export type RegisterRow = { date: string; status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED"; mine: boolean };

/// What the register says for a term: the days the school opened are the distinct dates on which the branch took a register (rows of any pupil), less the dates inside a break; present is
/// the pupil's PRESENT and LATE days, absent their ABSENT days (EXCUSED counts as neither). Nothing is invented: with no register in the term every number is null.
export function fromRegister(rows: readonly RegisterRow[], breaks: readonly { start: string; end: string }[] = []): AttendanceNumbers {
  const inBreak = (d: string) => breaks.some((b) => d >= b.start && d <= b.end);
  const days = new Set(rows.filter((r) => !inBreak(r.date)).map((r) => r.date));
  if (days.size === 0) return { timesOpen: null, timesPresent: null, timesAbsent: null };
  const mine = rows.filter((r) => r.mine && !inBreak(r.date));
  return {
    timesOpen: days.size,
    timesPresent: new Set(mine.filter((r) => r.status === "PRESENT" || r.status === "LATE").map((r) => r.date)).size,
    timesAbsent: new Set(mine.filter((r) => r.status === "ABSENT").map((r) => r.date)).size,
  };
}

export type AttendanceSource = "entered" | "register" | null;
/// Entered numbers win over the register's, field by field; each says where it came from, so a card never passes off a derived number as an entered one.
export function mergeAttendance(entered: AttendanceNumbers, register: AttendanceNumbers) {
  const pick = (e: number | null, r: number | null): { value: number | null; source: AttendanceSource } =>
    e !== null ? { value: e, source: "entered" } : r !== null ? { value: r, source: "register" } : { value: null, source: null };
  return {
    timesOpen: pick(entered.timesOpen, register.timesOpen),
    timesPresent: pick(entered.timesPresent, register.timesPresent),
    timesAbsent: pick(entered.timesAbsent, register.timesAbsent),
  };
}

/// A subject's scores over the terms of a session, for the printed columns "3rd term | 2nd term | 1st term | annual score | annual average": `terms` are the totals by term ordinal (null where
/// the pupil has no result); the annual score is their sum and the annual average the percentage over the terms that have a result.
export function annualFigures(terms: readonly { ordinal: number; total: number | null; max: number | null }[]) {
  const have = terms.filter((t): t is { ordinal: number; total: number; max: number } => t.total !== null && t.max !== null && t.max > 0);
  if (have.length === 0) return { annual: null, annualAverage: null };
  const sum = have.reduce((n, t) => n + t.total, 0);
  const max = have.reduce((n, t) => n + t.max, 0);
  return { annual: Math.round(sum * 100) / 100, annualAverage: Math.round((sum / max) * 10000) / 100 };
}
