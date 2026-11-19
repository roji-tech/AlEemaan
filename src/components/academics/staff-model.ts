// The staff list's filters and the words it shows (task 0111), pure: no React, no fetch, so every rule is unit-tested. The list loads a branch's staff in one answer (at most 500), so
// these filters run in the browser, as Show and the search already did (task 0103, D2: "room for the filters of task 0101 later").

export type StaffCategory = "TEACHING" | "NON_TEACHING";
export type StaffGender = "MALE" | "FEMALE";

/// What the filters read from a staff record.
export type StaffLike = {
  category: StaffCategory;
  gender: StaffGender | null;
  corpsMember: boolean;
  designation: string | null;
  qualification: string | null;
  /// A short display role label (e.g. "Head of Science", "Form Tutor"). Optional.
  role: string | null;
  standing: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  account: { state: "none" | "linked" };
};

export type StaffFilters = {
  kind: "" | StaffCategory;
  /// NONE: the gender is not given.
  gender: "" | StaffGender | "NONE";
  corps: "" | "yes" | "no";
  signIn: "" | "yes" | "no";
  standing: "" | "ACTIVE" | "SUSPENDED" | "TERMINATED";
};

export const NO_STAFF_FILTERS: StaffFilters = { kind: "", gender: "", corps: "", signIn: "", standing: "" };

export const CATEGORY_TEXT: Record<StaffCategory, string> = { TEACHING: "Teaching", NON_TEACHING: "Non-teaching" };
export const GENDER_TEXT: Record<StaffGender, string> = { MALE: "Male", FEMALE: "Female" };
export const STANDING_TEXT: Record<StaffLike["standing"], string> = { ACTIVE: "Active", SUSPENDED: "Suspended", TERMINATED: "Terminated" };

/// The options of each filter, in the order the panel shows them ("" is "any").
export const FILTER_OPTIONS = {
  kind: [
    { value: "", label: "Every kind" },
    { value: "TEACHING", label: "Teaching" },
    { value: "NON_TEACHING", label: "Non-teaching" },
  ],
  gender: [
    { value: "", label: "Any gender" },
    { value: "MALE", label: "Male" },
    { value: "FEMALE", label: "Female" },
    { value: "NONE", label: "Not given" },
  ],
  corps: [
    { value: "", label: "Everyone" },
    { value: "yes", label: "Corps members only" },
    { value: "no", label: "Not corps members" },
  ],
  signIn: [
    { value: "", label: "Everyone" },
    { value: "yes", label: "Can sign in" },
    { value: "no", label: "No sign-in" },
  ],
  standing: [
    { value: "", label: "Any standing" },
    { value: "ACTIVE", label: "Active" },
    { value: "SUSPENDED", label: "Suspended" },
    { value: "TERMINATED", label: "Terminated" },
  ],
} as const;

/// How many filters are set (for the toolbar's count and its Clear button).
export function activeStaffFilters(filters: StaffFilters): number {
  return (Object.values(filters) as string[]).filter((value) => value !== "").length;
}

/// The records that pass every filter that is set.
export function filterStaff<T extends StaffLike>(rows: readonly T[], filters: StaffFilters): T[] {
  return rows.filter(
    (row) =>
      (filters.kind === "" || row.category === filters.kind) &&
      (filters.gender === "" || (filters.gender === "NONE" ? row.gender === null : row.gender === filters.gender)) &&
      (filters.corps === "" || row.corpsMember === (filters.corps === "yes")) &&
      (filters.signIn === "" || (row.account.state === "linked") === (filters.signIn === "yes")) &&
      (filters.standing === "" || row.standing === filters.standing),
  );
}

/// The name as the list and the details show it: the title first when there is one ("Mrs Amina Yusuf").
export function displayName(row: { title: string | null; firstName: string; lastName: string }): string {
  return [row.title, row.firstName, row.lastName].filter(Boolean).join(" ");
}

/// The line under a person's name: what they do. A non-teaching member's job title when there is one ("Bursar"), otherwise their kind; then the qualification when there is one.
export function roleLine(row: Pick<StaffLike, "category" | "designation" | "qualification" | "role">): string {
  const base = row.category === "NON_TEACHING" && row.designation ? row.designation : CATEGORY_TEXT[row.category];
  const withRole = row.role ? `${base} · ${row.role}` : base;
  return row.qualification ? `${withRole} · ${row.qualification}` : withRole;
}
