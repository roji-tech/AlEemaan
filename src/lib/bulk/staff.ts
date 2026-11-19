import "@/lib/zod-csp";
import { z } from "zod";
import {
  personName,
  staffCategory,
  staffDetail,
  staffEmail,
  staffGender,
  staffPhone,
  staffTitle,
  STAFF_CATEGORY_LABELS,
  STAFF_DETAIL_MAX,
} from "@/lib/academics/staff-rules";
import { blankToUndefined, letters, phoneText, toGender } from "./fields";
import type { BulkColumn, BulkEntity } from "./types";

// The staff kind of the bulk entry (task 0084), client-safe: columns and the row's rules, which are the SAME field rules as the single form (`staff-rules.ts`).
// The server side (what the database knows, and the save) is `staff-server.ts`.

/// Teaching / Teacher / T and Non-teaching / Support / NT, in any capitals, with spaces, hyphens or underscores. Anything else is left as it is, so the rule below refuses it.
function toCategory(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const w = letters(v);
  if (["teaching", "teacher", "teachingstaff", "t"].includes(w)) return "TEACHING";
  if (["nonteaching", "nonteachingstaff", "support", "supportstaff", "nt"].includes(w)) return "NON_TEACHING";
  return v.trim() === "" ? undefined : v;
}
const CATEGORY_MESSAGE = "Choose Teaching or Non-teaching.";

/// Yes / Y / True / 1 and No / N / False / 0, in any capitals; an empty cell is absent (the save stores No). Anything else is left as it is, so the rule below refuses it (task 0111).
function toYesNo(v: unknown): unknown {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : v;
  if (typeof v !== "string") return v;
  const w = v.trim().toLowerCase();
  if (w === "") return undefined;
  if (["yes", "y", "true", "1"].includes(w)) return true;
  if (["no", "n", "false", "0"].includes(w)) return false;
  return v;
}

export type StaffRow = {
  category: z.infer<typeof staffCategory>;
  title?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  gender?: "MALE" | "FEMALE";
  designation?: string;
  qualification?: string;
  corpsMember?: boolean;
};

export const staffColumns: BulkColumn[] = [
  {
    key: "category",
    label: "Category",
    aliases: ["type", "staffcategory", "kind"],
    required: true,
    help: "Teaching or Non-teaching",
    options: (Object.keys(STAFF_CATEGORY_LABELS) as (keyof typeof STAFF_CATEGORY_LABELS)[]).map((value) => ({
      value,
      label: STAFF_CATEGORY_LABELS[value],
    })),
  },
  { key: "firstName", label: "First name", aliases: ["givenname", "forename"], required: true, help: "Up to 80 characters" },
  { key: "lastName", label: "Last name", aliases: ["surname", "familyname"], required: true, help: "Up to 80 characters" },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phonenumber", "mobile", "telephone", "tel"],
    required: false,
    help: "7 to 20 digits; may be left empty",
  },
  {
    key: "email",
    label: "Email",
    aliases: ["emailaddress", "mail"],
    required: false,
    help: "Must be unused by another live staff record in the branch; may be left empty",
  },
  // Task 0111: the new optional columns come after the old ones, so a template filled or a block pasted the old way still lands in the right cells.
  {
    key: "title",
    label: "Title",
    aliases: ["honorific", "salutation", "prefix"],
    required: false,
    help: "Mr, Mrs, Miss, Dr, Mallam…; may be left empty",
  },
  {
    key: "gender",
    label: "Gender",
    aliases: ["sex"],
    required: false,
    help: "Male or Female; may be left empty",
    options: [
      { value: "MALE", label: "Male" },
      { value: "FEMALE", label: "Female" },
    ],
  },
  {
    key: "designation",
    label: "Job title",
    aliases: ["jobtitle", "designation", "position", "role"],
    required: false,
    help: `For example Bursar, Driver or Security; up to ${STAFF_DETAIL_MAX} characters; may be left empty`,
  },
  {
    key: "qualification",
    label: "Qualification",
    aliases: ["qualifications", "degree", "certificate"],
    required: false,
    help: `For example B.Ed. Mathematics or NCE; up to ${STAFF_DETAIL_MAX} characters; may be left empty`,
  },
  {
    key: "corpsMember",
    label: "Corps member",
    aliases: ["nysc", "corper", "corpsmember", "nyscmember"],
    required: false,
    help: "Yes or No (an NYSC corps member); empty is No",
  },
];

export const staffRowSchema: z.ZodType<StaffRow> = z.object({
  category: z.preprocess(toCategory, z.enum(["TEACHING", "NON_TEACHING"], { error: CATEGORY_MESSAGE })),
  title: z.preprocess(blankToUndefined, staffTitle.optional()),
  firstName: personName,
  lastName: personName,
  phone: z.preprocess(phoneText, staffPhone.optional()),
  email: z.preprocess(blankToUndefined, staffEmail.optional()),
  gender: z.preprocess(toGender, staffGender.optional()),
  designation: z.preprocess(blankToUndefined, staffDetail.optional()),
  qualification: z.preprocess(blankToUndefined, staffDetail.optional()),
  corpsMember: z.preprocess(toYesNo, z.boolean({ error: "Write Yes or No." }).optional()),
});

export const staffEntity: BulkEntity<StaffRow> = {
  id: "staff",
  label: "staff",
  columns: staffColumns,
  rowSchema: staffRowSchema,
  uniqueKeys: ["email"],
};
