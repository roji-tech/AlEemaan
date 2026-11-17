import "@/lib/zod-csp";
import { z } from "zod";
import { blankToUndefined, letters, optionalEmail, optionalPhone, optionalText } from "./fields";
import type { BulkColumn, BulkEntity } from "./types";

// The pupil kind of the bulk entry (task 0084), client-safe: the columns and the rules of a row. The server half (what the database knows, and the save) is `pupils-server.ts`.
// Only first name, last name, gender and date of birth must be in the file; everything else may be missing or empty.

export type PupilRow = {
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
  admissionNo?: string;
  className?: string;
  arm?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
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
const MIN_YEAR = 1900;
const dateOfBirth = z.preprocess(
  (v) => (typeof v === "string" ? (toIsoDate(v) ?? v) : v),
  z
    .string({ error: "Give the date of birth." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date, like 2014-03-21 or 21/03/2014.")
    .refine((v) => Number(v.slice(0, 4)) >= MIN_YEAR, `The year must be ${MIN_YEAR} or later.`)
    .refine((v) => v <= new Date().toISOString().slice(0, 10), "The date of birth can't be in the future."),
);

const toGender = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const g = letters(v);
  if (["m", "male", "boy"].includes(g)) return "MALE";
  if (["f", "female", "girl"].includes(g)) return "FEMALE";
  return v.trim() === "" ? undefined : v;
};
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

export const pupilRowSchema: z.ZodType<PupilRow> = z.object({
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
});

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
    required: true,
    help: "Like 2014-03-21 or 21/03/2014; not in the future",
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
];

/// The kind for a branch: its classes become the dropdown of the Class column.
export const pupilEntityFor = (classNames: readonly string[]): BulkEntity<PupilRow> => ({
  id: "pupils",
  label: "pupils",
  columns: columns(classNames),
  rowSchema: pupilRowSchema,
  uniqueKeys: ["admissionNo"],
});
export const pupilEntity = pupilEntityFor([]);
