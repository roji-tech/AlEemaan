// The tabs of the Academics page, in a plain module (no "use client") so the server page and the client component can both read them: the page validates `?section=` against the list, and a
// function exported from a client component cannot be called from the server (task 0093).
export const SECTIONS = [
  { id: "classes", label: "Classes" },
  { id: "subjects", label: "Subjects" },
  { id: "sessions", label: "Sessions" },
  { id: "grading", label: "Assessment and grading" },
  { id: "staff", label: "Staff" },
  /// Shown only where a branch uses departments, or to an administrator (who turns them on there): `AcademicsSections` and the page decide (task 0101 D7).
  { id: "departments", label: "Departments" },
  { id: "promotion", label: "Promotion & rollover" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
export const isSectionId = (value: unknown): value is SectionId => SECTIONS.some((s) => s.id === value);
