// Where a school year stands today, for the session card's timeline and term cards (task 0105). Pure: "today" is passed in, so every rule is tested without a clock.
// Dates are calendar days stored at midnight UTC, so a date is read as the day number of its UTC date part (days since 1970-01-01), and today is the viewer's own calendar day in the same
// numbers: a viewer west of Greenwich is not told it is yesterday.

const DAY_MS = 86_400_000;

export type TermState = "current" | "upcoming" | "ended";
export type TermLike = { label: string; startDate: string; endDate: string; isCurrent: boolean };

/// The day number of an ISO date or date-time string's UTC date.
export const dayNumber = (iso: string): number => {
  const d = new Date(iso);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
};

/// The viewer's calendar day as a day number.
export const todayNumber = (now: Date): number => Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);

/// Both ends count: a term from the 1st to the 1st is one day long.
export const lengthDays = (p: Pick<TermLike, "startDate" | "endDate">): number => dayNumber(p.endDate) - dayNumber(p.startDate) + 1;

/// What the administrator said wins ("current" is a choice they make); otherwise the dates decide: over is ended, anything else is still to come.
export function termState(p: TermLike, today: number): TermState {
  if (p.isCurrent) return "current";
  return dayNumber(p.endDate) < today ? "ended" : "upcoming";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const daysText = (n: number): string => plural(n, "day", "days");
/// "15 weeks"; under two weeks the days are clearer.
export const lengthText = (days: number): string => (days < 14 ? daysText(days) : `${Math.round(days / 7)} weeks`);

/// How far through a term today is: the day (1 at its first day, never beyond its length), its length, the days after today, and the share done (0 to 1).
export function progressOf(p: Pick<TermLike, "startDate" | "endDate">, today: number) {
  const of = lengthDays(p);
  const day = Math.min(Math.max(today - dayNumber(p.startDate) + 1, 0), of);
  return { day, of, left: of - day, ratio: of === 0 ? 0 : day / of };
}

/// The segments of the year's bar: each term's start and width as a percentage of the whole span from the first term's start to the last term's end, with a gap between neighbours
/// (a holiday between two terms is a visible gap, as it is in the year). Widths are never below `minWidth` so a short term is still a segment.
export function segmentsOf<P extends Pick<TermLike, "startDate" | "endDate">>(periods: readonly P[], minWidth = 3) {
  if (periods.length === 0) return [];
  const first = Math.min(...periods.map((p) => dayNumber(p.startDate)));
  const last = Math.max(...periods.map((p) => dayNumber(p.endDate)));
  const span = Math.max(last - first + 1, 1);
  return periods.map((p) => {
    const start = ((dayNumber(p.startDate) - first) / span) * 100;
    const width = Math.max((lengthDays(p) / span) * 100, minWidth);
    return { period: p, x: start, width };
  });
}

/// One line of where the year is: "1st Term, day 66 of 107, 41 days left" / "2nd Term starts in 12 days" / "All terms have ended". `status` is the session's own: a closed session says so.
export function whereWeAre(
  status: "PLANNED" | "ACTIVE" | "CLOSED",
  periods: readonly TermLike[],
  session: { startDate: string; endDate: string },
  today: number,
): string {
  if (status === "CLOSED") return "This session is closed.";
  const current = periods.find((p) => p.isCurrent);
  if (current) {
    const at = progressOf(current, today);
    if (today < dayNumber(current.startDate)) return `${current.label} starts in ${daysText(dayNumber(current.startDate) - today)}.`;
    if (today > dayNumber(current.endDate)) return `${current.label} has ended; the next term is not set as current yet.`;
    return `${current.label}, day ${at.day} of ${at.of}, ${at.left === 0 ? "last day" : `${daysText(at.left)} left`}.`;
  }
  const next = [...periods].sort((a, b) => dayNumber(a.startDate) - dayNumber(b.startDate)).find((p) => dayNumber(p.endDate) >= today);
  if (periods.length > 0 && !next) return "All terms have ended.";
  if (next) {
    const until = dayNumber(next.startDate) - today;
    return until > 0 ? `${next.label} starts in ${daysText(until)}.` : `${next.label} has begun but is not set as current.`;
  }
  const until = dayNumber(session.startDate) - today;
  return until > 0 ? `Starts in ${daysText(until)}.` : "No terms yet.";
}
