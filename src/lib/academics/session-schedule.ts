// The dates of a session and of its terms or semesters (task 0097), as pure rules: what the New session form suggests, what the form, the "Edit dates" dialog and the server all check, and
// the names of the periods. No database and no React here, so every rule is tested without either (tests/unit/session-schedule.spec.ts) and the browser and the server cannot disagree.
//
// A day is the text "YYYY-MM-DD" (a calendar day, never a clock time), compared and counted in UTC so no time zone can move it.

export type Day = string;
export type PeriodDates = { startDate: Day; endDate: Day };
export type PeriodKindName = "TERM" | "SEMESTER";
export type ScheduleProblem = { path: string; message: string };

/// How many periods a school year may be cut into, by kind (the maintainer, 2026-11-18: "select the number of terms if 2 or 3", and terms or semesters). Semesters are two.
export const COUNTS: Record<PeriodKindName, readonly number[]> = { TERM: [2, 3], SEMESTER: [2] };
export const MAX_PERIODS = 4;

const ORDINAL = ["1st", "2nd", "3rd", "4th"] as const;
/// "1st Term", "2nd Semester": the stored label of period number `ordinal` (1 to 4).
export const periodLabel = (kind: PeriodKindName, ordinal: number): string =>
  `${ORDINAL[ordinal - 1] ?? `${ordinal}th`} ${kind === "SEMESTER" ? "Semester" : "Term"}`;
export const kindNoun = (kind: PeriodKindName, plural = false): string =>
  kind === "SEMESTER" ? (plural ? "semesters" : "semester") : plural ? "terms" : "term";

/// The usual number of terms in a branch: the Arabic branches use two, the others three (the same rule the server has always applied).
export const usualCount = (branchName: string): number => (branchName.toLowerCase().includes("arabic") ? 2 : 3);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/// Is this a real calendar day (not 2027-02-30, not a time, not a bare year)?
export function isDay(value: unknown): value is Day {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const number = (day: Day): number => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
export function addDays(day: Day, days: number): Day {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/// The session's days shared equally between `count` periods: each starts where the share starts and ends the day before the next share, the last ends with the session. This is the
/// split the server has always made, now visible and editable.
export function defaultSchedule(startDate: Day, endDate: Day, count: number): PeriodDates[] {
  if (!isDay(startDate) || !isDay(endDate) || count < 1) return [];
  const total = number(endDate) - number(startDate);
  const share = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => ({
    startDate: addDays(startDate, i * share),
    endDate: i === count - 1 ? endDate : addDays(startDate, (i + 1) * share - 1),
  }));
}

/// Everything wrong with a session's dates and its periods' dates, each with the field it belongs to (`session.startDate`, `periods.1.endDate`) and a sentence for the person. Empty is fine.
/// Rules: real days; the session ends after it starts; each period ends after it starts; each lies inside the session; each starts after the one before it ends (a gap between two, a holiday,
/// is fine; an overlap is not).
export function validateSchedule(session: PeriodDates, periods: readonly PeriodDates[], names: readonly string[] = []): ScheduleProblem[] {
  const out: ScheduleProblem[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  const sessionOk = isDay(session.startDate) && isDay(session.endDate);
  if (!isDay(session.startDate)) add("session.startDate", "Choose the first day of the session.");
  if (!isDay(session.endDate)) add("session.endDate", "Choose the last day of the session.");
  if (sessionOk && number(session.endDate) <= number(session.startDate))
    add("session.endDate", "The last day of the session must be after its first day.");
  if (periods.length < 1 || periods.length > MAX_PERIODS) add("periods", `A session has between 1 and ${MAX_PERIODS} periods.`);

  periods.forEach((p, i) => {
    const name = names[i] ?? `Period ${i + 1}`;
    const startOk = isDay(p.startDate);
    const endOk = isDay(p.endDate);
    if (!startOk) add(`periods.${i}.startDate`, `Choose the first day of ${name}.`);
    if (!endOk) add(`periods.${i}.endDate`, `Choose the last day of ${name}.`);
    if (!startOk || !endOk) return;
    if (number(p.endDate) <= number(p.startDate)) add(`periods.${i}.endDate`, `The last day of ${name} must be after its first day.`);
    if (sessionOk && (number(p.startDate) < number(session.startDate) || number(p.endDate) > number(session.endDate)))
      add(`periods.${i}.startDate`, `${name} must sit inside the session's dates (${session.startDate} to ${session.endDate}).`);
    const before = periods[i - 1];
    if (before && isDay(before.endDate) && number(p.startDate) <= number(before.endDate))
      add(`periods.${i}.startDate`, `${name} must start after ${names[i - 1] ?? `Period ${i}`} ends.`);
  });
  return out;
}
