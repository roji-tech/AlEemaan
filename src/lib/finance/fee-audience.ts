// Who a fee line is for (task 0122), the pure rules: no database, no clock, safe for the browser. The invoice run, the opt-out service and the Finance screens all read these, so "does this pupil
// get this line" has one answer.

export type Admission = "NEW" | "RETURNING";
export type FeeGender = "MALE" | "FEMALE";
export type FeeResidence = "DAY" | "BOARDING";

/// What a fee line asks of a pupil. null = no condition (everyone).
export type Audience = { admission: Admission | null; gender: FeeGender | null; residence: FeeResidence | null };
/// What is known of a pupil for one period. `residence` is null when the record does not say.
export type PupilFacts = { admission: Admission; gender: FeeGender; residence: FeeResidence | null };

export type LineFacts = Audience & { id: string; optional: boolean };

/// Why a line is or is not on a pupil's invoice:
///   billed             on the invoice
///   other-audience     the line is for another kind of pupil (another gender, new vs returning, day vs boarding)
///   missing-residence  the line is for boarders or day pupils and the pupil's record does not say which: the school fixes the record and generates again
///   opted-out          an optional line the pupil chose not to take
export type LineVerdict = "billed" | "other-audience" | "missing-residence" | "opted-out";

/// A pupil is NEW for a period when they have no enrolment in a session that began before the period's session; otherwise RETURNING. Worked out, never typed, so there is no flag to keep in step.
export const admissionFor = (hasEarlierEnrolment: boolean): Admission => (hasEarlierEnrolment ? "RETURNING" : "NEW");

export function verdictFor(line: LineFacts, pupil: PupilFacts, optedOut: ReadonlySet<string>): LineVerdict {
  if (line.admission !== null && line.admission !== pupil.admission) return "other-audience";
  if (line.gender !== null && line.gender !== pupil.gender) return "other-audience";
  if (line.residence !== null) {
    if (pupil.residence === null) return "missing-residence";
    if (line.residence !== pupil.residence) return "other-audience";
  }
  if (line.optional && optedOut.has(line.id)) return "opted-out";
  return "billed";
}

/// The lines a pupil is billed, and how many lines were left off because the pupil's record lacks a residence (so the run can say so).
export function billedFor<L extends LineFacts>(
  lines: readonly L[],
  pupil: PupilFacts,
  optedOut: ReadonlySet<string>,
): { billed: L[]; missingResidence: number } {
  const billed: L[] = [];
  let missingResidence = 0;
  for (const line of lines) {
    const verdict = verdictFor(line, pupil, optedOut);
    if (verdict === "billed") billed.push(line);
    else if (verdict === "missing-residence") missingResidence++;
  }
  return { billed, missingResidence };
}

const ADMISSION_TEXT: Record<Admission, string> = { NEW: "New pupils", RETURNING: "Returning pupils" };
const GENDER_TEXT: Record<FeeGender, string> = { MALE: "Male", FEMALE: "Female" };
const RESIDENCE_TEXT: Record<FeeResidence, string> = { DAY: "Day", BOARDING: "Boarding" };

/// The audience in words, for the Finance screens: "Everyone", or "New pupils, Male, Boarding".
export function audienceText(a: Audience): string {
  const parts = [
    a.admission ? ADMISSION_TEXT[a.admission] : null,
    a.gender ? GENDER_TEXT[a.gender] : null,
    a.residence ? RESIDENCE_TEXT[a.residence] : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : "Everyone";
}

/// The same audience as an import cell says it: "New", "Returning" (admission), "Male", "Female" (gender), "Day", "Boarding" (residence). Blank, "all" and "everyone" mean no condition. null for text that is
/// none of these, so the import can say the cell is wrong instead of reading it as everyone.
export function parseAudienceCell<T extends string>(raw: string | undefined, words: Record<string, T>): T | null | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "" || t === "all" || t === "everyone" || t === "any") return null;
  return words[t];
}
export const ADMISSION_WORDS: Record<string, Admission> = { new: "NEW", "new intake": "NEW", returning: "RETURNING", old: "RETURNING" };
export const GENDER_WORDS: Record<string, FeeGender> = {
  male: "MALE",
  m: "MALE",
  boy: "MALE",
  boys: "MALE",
  female: "FEMALE",
  f: "FEMALE",
  girl: "FEMALE",
  girls: "FEMALE",
};
export type FeeRecurrence = "THIS_TERM" | "EVERY_TERM" | "EVERY_SESSION";
/// How often, as an import cell says it (task 0124). Blank = this term only (the Period column names the term).
export const HOW_OFTEN_WORDS: Record<string, "EVERY_TERM" | "EVERY_SESSION"> = {
  "every term": "EVERY_TERM",
  "each term": "EVERY_TERM",
  "all terms": "EVERY_TERM",
  termly: "EVERY_TERM",
  "once a year": "EVERY_SESSION",
  "once a session": "EVERY_SESSION",
  "every session": "EVERY_SESSION",
  "every year": "EVERY_SESSION",
  yearly: "EVERY_SESSION",
  annual: "EVERY_SESSION",
  annually: "EVERY_SESSION",
};
/// What the screens call each recurrence.
export const RECURRENCE_TEXT: Record<FeeRecurrence, string> = {
  THIS_TERM: "This term only",
  EVERY_TERM: "Every term",
  EVERY_SESSION: "Once a year",
};

export const RESIDENCE_WORDS: Record<string, FeeResidence> = {
  day: "DAY",
  boarding: "BOARDING",
  boarder: "BOARDING",
  boarders: "BOARDING",
};

/// Yes/no cells of the import: "yes", "y", "true", "1" and their opposites; blank means no. undefined for anything else.
export function parseYesNo(raw: string | undefined): boolean | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "") return false;
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return undefined;
}
