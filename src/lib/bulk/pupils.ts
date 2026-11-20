import "@/lib/zod-csp";
import { z } from "zod";
import { blankToUndefined, optionalEmail, optionalPhone, optionalText, toGender } from "./fields";
import type { BulkColumn, BulkEntity } from "./types";

// The pupil kind of the bulk entry (task 0084), client-safe: the columns and the rules of a row. The server half (what the database knows, and the save) is `pupils-server.ts`.
// Only first name, last name and gender must be in the file (the maintainer, 2026-11-18); everything else, the date of birth included, may be missing or empty.

export type PupilRow = {
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth?: string;
  admissionNo?: string;
  className?: string;
  arm?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  residence?: "DAY" | "BOARDING";
  /// How the fee lines see the pupil (task 0122): empty = worked out from the pupil's earlier years; New or Returning sets it. For the pupils loaded into the app already at the school.
  feeAdmission?: "NEW" | "RETURNING";
  /// A scholarship type of the branch, by name, and (optionally) this pupil's share of it (task 0113 S1); the share comes from the type when it is not given.
  scholarship?: string;
  scholarshipPercent?: number;
};

/// 2014-03-21 or 21/03/2014 (day first, as written in Nigeria; also - and . as separators) → 2014-03-21; null when it is not a real calendar date.
export function toIsoDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/// Day or Boarding, as a school writes it (task 0113 R1): any case; "boarder" and "boarding" are boarding, "day" and "day student" are day; blank is not set; anything else is left for
/// the rule to refuse.
export const toFeeAdmission = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const t = v
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  if (t === "") return undefined;
  if (["new", "new intake", "new pupil", "new student", "newly admitted"].includes(t)) return "NEW";
  if (["returning", "returning student", "returning pupil", "old", "old student", "continuing"].includes(t)) return "RETURNING";
  return v;
};

export const toResidence = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const t = v
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  if (t === "") return undefined;
  if (["day", "day student", "day pupil", "dayboy", "daygirl", "day boy", "day girl"].includes(t)) return "DAY";
  if (["boarding", "boarder", "boarding student", "boarding pupil", "border"].includes(t)) return "BOARDING";
  return v;
};

/// "50", "50%" and " 50 % " are 50; blank is not given; anything else is left for the rule to refuse.
export const toPercent = (v: unknown): unknown => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return v;
  const t = v.trim().replace(/\s*%$/, "").trim();
  if (t === "") return undefined;
  return /^\d+$/.test(t) ? Number(t) : v;
};

const MIN_YEAR = 1900;
const dateOfBirth = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : (toIsoDate(v) ?? v)) : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date, like 2014-03-21 or 21/03/2014.")
    // A date that only looks right ("2014-02-31") is not on the calendar: `toIsoDate` returned null for it, so the text came through unchanged and the pattern alone accepted it.
    .refine((v) => toIsoDate(v) !== null, "Use a real date, like 2014-03-21 or 21/03/2014.")
    .refine((v) => Number(v.slice(0, 4)) >= MIN_YEAR, `The year must be ${MIN_YEAR} or later.`)
    .refine((v) => v <= new Date().toISOString().slice(0, 10), "The date of birth can't be in the future.")
    .optional(),
);

const name = z
  .string({ error: "Give a name." })
  .trim()
  .min(1, "Give a name.")
  .min(2, "Use at least 2 letters.")
  .max(60, "Use at most 60 characters.");
const admissionNo = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(40, "Use at most 40 characters.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9/._ -]*$/, "Use letters, digits and / . _ - only.")
    .optional(),
);

const pupilRowBase = z.object({
  firstName: name,
  middleName: optionalText(60),
  lastName: name,
  gender: z.preprocess(toGender, z.enum(["MALE", "FEMALE"], { error: "Choose Male or Female." })),
  dateOfBirth,
  admissionNo,
  className: optionalText(50),
  arm: optionalText(30),
  guardianName: optionalText(100),
  guardianPhone: optionalPhone,
  guardianEmail: optionalEmail,
  residence: z.preprocess(toResidence, z.enum(["DAY", "BOARDING"], { error: "Write Day or Boarding, or leave it empty." }).optional()),
  feeAdmission: z.preprocess(
    toFeeAdmission,
    z.enum(["NEW", "RETURNING"], { error: "Write New or Returning, or leave it empty." }).optional(),
  ),
  scholarship: optionalText(80),
  scholarshipPercent: z.preprocess(
    toPercent,
    z
      .number({ error: "Write the share as a whole number from 1 to 100." })
      .int("Write the share as a whole number from 1 to 100.")
      .min(1, "The share is at least 1%.")
      .max(100, "The share is at most 100%.")
      .optional(),
  ),
});
export const pupilRowSchema: z.ZodType<PupilRow> = pupilRowBase;

const columns = (classNames: readonly string[]): BulkColumn[] => [
  { key: "firstName", label: "First name", aliases: ["givenname", "forename"], required: true, help: "2 to 60 characters" },
  { key: "middleName", label: "Middle name", aliases: ["othernames", "othername"], required: false, help: "May be left empty" },
  { key: "lastName", label: "Last name", aliases: ["surname", "familyname"], required: true, help: "2 to 60 characters" },
  {
    key: "gender",
    label: "Gender",
    aliases: ["sex"],
    required: true,
    help: "Male or Female",
    options: [
      { value: "MALE", label: "Male" },
      { value: "FEMALE", label: "Female" },
    ],
  },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    aliases: ["dob", "birthdate", "born"],
    required: false,
    help: "May be left empty. Like 2014-03-21 or 21/03/2014; not in the future",
  },
  {
    key: "admissionNo",
    label: "Admission number",
    aliases: ["admissionno", "admno"],
    required: false,
    help: "Leave empty to give the next number automatically; must not be used already",
  },
  {
    key: "className",
    label: "Class",
    aliases: ["classname", "grade"],
    required: false,
    help: "A class of this branch; needs an active academic session. Leave empty to add the pupil with no class",
    ...(classNames.length > 0 ? { options: classNames.map((c) => ({ value: c, label: c })) } : {}),
  },
  {
    key: "arm",
    label: "Arm",
    aliases: ["section", "stream"],
    required: false,
    help: "An arm of that class; empty means Main, or the class's only arm",
  },
  {
    key: "guardianName",
    label: "Guardian name",
    aliases: ["parentname", "guardian", "parent"],
    required: false,
    help: "May be left empty",
  },
  {
    key: "guardianPhone",
    label: "Guardian phone",
    aliases: ["parentphone", "guardiantel"],
    required: false,
    help: "7 to 20 digits; may be left empty",
  },
  { key: "guardianEmail", label: "Guardian email", aliases: ["parentemail"], required: false, help: "May be left empty" },
  {
    key: "residence",
    label: "Day or boarding",
    aliases: ["dayorboarding", "residence", "boarding", "dayboarding", "boarder"],
    required: false,
    help: "Day or Boarding; may be left empty (not set)",
    options: [
      { value: "DAY", label: "Day" },
      { value: "BOARDING", label: "Boarding" },
    ],
  },
  {
    key: "feeAdmission",
    label: "Admission status",
    aliases: ["newreturning", "newoldstudent", "pupiltype", "feeadmission"],
    required: false,
    help: "New or Returning, for the fee lines; empty = worked out from the pupil's earlier years. Mark the pupils already at the school as Returning",
    options: [
      { value: "NEW", label: "New" },
      { value: "RETURNING", label: "Returning" },
    ],
  },
  {
    key: "scholarship",
    label: "Scholarship",
    aliases: ["scholarshiptype", "scholarshipname"],
    required: false,
    help: "A scholarship type of this branch, by name (set up under Finance > Scholarships); may be left empty. Administrators only: it is financial",
  },
  {
    key: "scholarshipPercent",
    label: "Scholarship %",
    aliases: ["scholarshippercent", "scholarshipshare", "scholarshippct"],
    required: false,
    help: "1 to 100: this pupil's share; empty takes the type's own share",
  },
];

/// The kind for a branch: its classes become the dropdown of the Class column.
export const pupilEntityFor = (classNames: readonly string[]): BulkEntity<PupilRow> => ({
  id: "pupils",
  label: "pupils",
  columns: columns(classNames),
  rowSchema: pupilRowSchema,
  uniqueKeys: ["admissionNo"],
  fullName: {
    aliases: ["name", "full name", "full_name", "fullname", "pupil name", "pupil's name", "student name", "student's name"],
    first: "firstName",
    middle: "middleName",
    last: "lastName",
    note: "Instead of First, Middle and Last name columns, a file may have ONE column called Name, Full name or full_name: the first word becomes the first name, the last word the last name and any words between the middle name. A name of one word has no last name and is refused until you add one.",
  },
});
export const pupilEntity = pupilEntityFor([]);
