// The notable alumni of the school website's "Old students" page (task 0080). EMPTY on purpose: the old page's script drew ten people (a doctor at a teaching hospital, an engineer at a named company, and so on) from a list its own
// comment called "replace / extend with real alumni data", that is, invented examples shown to visitors as real graduates. Add a person here only when the school has confirmed their name, year and achievement with them.
export type AlumniField = "medicine" | "technology" | "islamic" | "engineering" | "business";

export type Alumnus = { name: string; year: string; field: AlumniField; achievement: string };

export const ALUMNI_FIELDS: { value: AlumniField; label: string }[] = [
  { value: "medicine", label: "Medicine" },
  { value: "technology", label: "Technology" },
  { value: "islamic", label: "Islamic Studies" },
  { value: "engineering", label: "Engineering" },
  { value: "business", label: "Business" },
];

export const ALUMNI: Alumnus[] = [];
