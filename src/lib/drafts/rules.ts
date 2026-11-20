// Draft staff and draft pupils (task 0101 D1, batch 3a): what "complete" means. PURE (no database, no framework), so the server decides and the unit tests pin it down. The server sends
// the result with each record (`missing`), so no screen has a rule of its own.
//
// The maintainer, 2026-11-19: "how do I mark a new staff record or multiple records as draft?" A draft is saved with only the names (and the kind for staff, the gender for pupils, which the
// forms already ask for); it becomes a normal record when it is COMPLETE. The defaults below answer the (ask) in task 0101 D1 and may be changed here, in one place.

const present = (value: string | null | undefined): boolean => typeof value === "string" && value.trim() !== "";

/// "Missing: gender, e-mail or phone". Nothing when nothing is missing.
export const missingText = (missing: readonly string[]): string => (missing.length === 0 ? "" : `Missing: ${missing.join(", ")}`);

export type StaffDraftFacts = {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  category: string | null | undefined;
  gender: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
};

/// What a staff record still needs to be complete: the names, the kind, the gender, and an e-mail address or a phone number.
export function staffMissing(r: StaffDraftFacts): string[] {
  const missing: string[] = [];
  if (!present(r.firstName)) missing.push("first name");
  if (!present(r.lastName)) missing.push("last name");
  if (!present(r.category)) missing.push("kind of staff");
  if (!present(r.gender)) missing.push("gender");
  if (!present(r.email) && !present(r.phone)) missing.push("e-mail or phone");
  return missing;
}

export type PupilDraftFacts = {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  gender: string | null | undefined;
  /// Placed in a class: an active enrolment.
  hasClass: boolean;
  guardianName: string | null | undefined;
  guardianPhone: string | null | undefined;
  guardianEmail: string | null | undefined;
};

/// What a pupil record still needs to be complete: the names, the gender, a class (an active enrolment) and a guardian contact (a guardian with a name and a phone or an e-mail address).
/// The date of birth is NOT asked (the maintainer approved this on 2026-11-19: the ordinary pupil form does not require it either, so a draft cannot be held to more than a record).
export function pupilMissing(r: PupilDraftFacts): string[] {
  const missing: string[] = [];
  if (!present(r.firstName)) missing.push("first name");
  if (!present(r.lastName)) missing.push("last name");
  if (!present(r.gender)) missing.push("gender");
  if (!r.hasClass) missing.push("class");
  if (!present(r.guardianName)) missing.push("guardian name");
  if (!present(r.guardianPhone) && !present(r.guardianEmail)) missing.push("guardian phone or e-mail");
  return missing;
}

/// The three-way draft filter of a list (the same words for staff and pupils): everything, only drafts, or no drafts.
export type DraftFilter = "ANY" | "YES" | "NO";
export const DRAFT_FILTER_OPTIONS: { value: DraftFilter; label: string }[] = [
  { value: "ANY", label: "Any" },
  { value: "YES", label: "Drafts only" },
  { value: "NO", label: "Not drafts" },
];
