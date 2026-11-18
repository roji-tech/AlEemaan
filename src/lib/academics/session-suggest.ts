// What the New session form suggests (task 0093). Pure, so the rule is tested without a browser. A school year here runs from 1 September to 31 July; the year that has not been
// created yet, counting from today, is the suggestion.

export type SessionSuggestion = { label: string; startDate: string; endDate: string };

/// The label "2026/2027" for the school year starting in `year`.
export const sessionLabel = (year: number) => `${year}/${year + 1}`;

/// The year of the school year that is under way on `today` (UTC): August onwards belongs to the year that starts in September, January to July to the one before it.
export const schoolYearStarting = (today: Date): number => (today.getUTCMonth() >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1);

/// The first school year, counting from today's, whose label is not among `existing` (at most ten years on, then that one even if it exists: the server refuses a duplicate, loudly).
export function suggestSession(today: Date, existing: readonly string[]): SessionSuggestion {
  const taken = new Set(existing.map((label) => label.trim()));
  let year = schoolYearStarting(today);
  for (let i = 0; i < 10 && taken.has(sessionLabel(year)); i++) year++;
  return { label: sessionLabel(year), startDate: `${year}-09-01`, endDate: `${year + 1}-07-31` };
}

/// How many terms a new session starts with in a branch: the Arabic branches use two, the others three (the server applies the same rule when the form does not send a number).
export const defaultTermCount = (branchName: string): number => (branchName.toLowerCase().includes("arabic") ? 2 : 3);
