// A break inside a term or semester (task 0098: the mid-term or mid-semester holiday), as pure rules: what the form and the server both check, and the words of the announcement that goes
// with it. No database and no React, so every rule is tested without either (tests/unit/session-breaks.spec.ts) and the browser and the server cannot disagree.
//
// A day is the text "YYYY-MM-DD" (a calendar day, never a clock time). Such days compare correctly as plain text, so no time zone can move one.

import { addDays, isDay, type Day, type PeriodDates } from "./session-schedule";

export type BreakDates = PeriodDates & { label: string };
export type BreakProblem = { path: "label" | "startDate" | "endDate"; message: string };

export const BREAK_LABEL_MIN = 2;
export const BREAK_LABEL_MAX = 60;

/// "Mid-term break" or "Mid-semester break": what the form suggests.
export const defaultBreakLabel = (kind: "TERM" | "SEMESTER"): string => (kind === "SEMESTER" ? "Mid-semester break" : "Mid-term break");

/// Everything wrong with a break, each with the field it belongs to. School does not run between its first and last day, both included, so a one-day break has the same first and last day.
/// Rules: a name; real days; the last day is not before the first; it lies inside its term or semester; it does not overlap another break of the same term (`others`, the ones already saved).
export function validateBreak(
  period: PeriodDates,
  others: readonly BreakDates[],
  input: { label: string; startDate: string; endDate: string },
  periodName = "this term",
): BreakProblem[] {
  const out: BreakProblem[] = [];
  const add = (path: BreakProblem["path"], message: string) => out.push({ path, message });
  const label = input.label.trim();
  if (label.length < BREAK_LABEL_MIN || label.length > BREAK_LABEL_MAX)
    add("label", `Name the break in ${BREAK_LABEL_MIN} to ${BREAK_LABEL_MAX} characters, for example Mid-term break.`);
  const startOk = isDay(input.startDate);
  const endOk = isDay(input.endDate);
  if (!startOk) add("startDate", "Choose the first day of the break.");
  if (!endOk) add("endDate", "Choose the last day of the break.");
  if (!startOk || !endOk) return out;
  if (input.endDate < input.startDate) add("endDate", "The last day of the break cannot be before its first day.");
  else {
    if (input.startDate < period.startDate || input.startDate > period.endDate)
      add("startDate", `The break must sit inside ${periodName} (${period.startDate} to ${period.endDate}).`);
    else if (input.endDate > period.endDate)
      add("endDate", `The break must sit inside ${periodName} (${period.startDate} to ${period.endDate}).`);
    const clash = others.find((o) => input.startDate <= o.endDate && input.endDate >= o.startDate);
    if (clash) add("startDate", `It overlaps ${clash.label} (${clash.startDate} to ${clash.endDate}).`);
  }
  return out;
}

/// The breaks that would no longer lie inside their term if the term's days became `dates` (used when the dates of a session are edited: a break is never left outside its term).
export function breaksOutside<T extends BreakDates>(dates: PeriodDates, breaks: readonly T[]): T[] {
  return breaks.filter((b) => b.startDate < dates.startDate || b.endDate > dates.endDate);
}

/// The weekday of a day (0 = Sunday), counted in UTC.
const weekday = (day: Day): number => new Date(`${day}T00:00:00.000Z`).getUTCDay();

/// The day classes start again: the day after the break ends, or the Monday after when that is a Saturday or a Sunday (the school week is Monday to Friday; the person can correct the text).
export function resumeDay(endDate: Day): Day {
  let next = addDays(endDate, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
  return next;
}

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/// "Monday 26 October 2026".
export const longDay = (day: Day): string => LONG.format(new Date(`${day}T00:00:00.000Z`)).replace(",", "");

/// The announcement to offer when a break is saved: a title and a message the person may change before sending. Plain words, no markup.
export function breakAnnouncement(input: {
  label: string;
  startDate: Day;
  endDate: Day;
  periodLabel: string;
  sessionLabel: string;
  branchName: string;
}): { title: string; body: string } {
  const one = input.startDate === input.endDate;
  const when = one ? `on ${longDay(input.startDate)}` : `from ${longDay(input.startDate)} to ${longDay(input.endDate)}`;
  return {
    title: `${input.label}: ${one ? longDay(input.startDate) : `${longDay(input.startDate)} to ${longDay(input.endDate)}`}`,
    body: `${input.branchName} will have no classes ${when} for the ${input.label.toLowerCase()} in the ${input.periodLabel} of ${input.sessionLabel}. Classes resume on ${longDay(resumeDay(input.endDate))}.`,
  };
}

/// When the announcement stops showing: the end of the day classes resume (an ISO instant, as the announcements API takes it).
export const announcementExpiry = (endDate: Day): string => `${resumeDay(endDate)}T23:59:59.000Z`;
