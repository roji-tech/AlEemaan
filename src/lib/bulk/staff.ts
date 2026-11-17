import "@/lib/zod-csp";
import { z } from "zod";
import { personName, staffCategory, staffEmail, staffPhone, STAFF_CATEGORY_LABELS } from "@/lib/academics/staff-rules";
import type { BulkColumn, BulkEntity } from "./types";

// The staff kind of the bulk entry (task 0084), client-safe: columns and the row's rules, which are the SAME field rules as the single form (`staff-rules.ts`).
// The server side (what the database knows, and the save) is `staff-server.ts`.

const letters = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
/// Teaching / Teacher / T and Non-teaching / Support / NT, in any capitals, with spaces, hyphens or underscores. Anything else is left as it is, so the rule below refuses it.
function toCategory(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const w = letters(v);
  if (["teaching", "teacher", "teachingstaff", "t"].includes(w)) return "TEACHING";
  if (["nonteaching", "nonteachingstaff", "support", "supportstaff", "nt"].includes(w)) return "NON_TEACHING";
  return v.trim() === "" ? undefined : v;
}
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/// Excel keeps a phone typed as 08031234567 as a NUMBER and drops the zero: ten digits that do not start with 0 get it back.
const phoneText = (v: unknown) => {
  const t = blankToUndefined(v);
  return typeof t === "string" && /^[1-9]\d{9}$/.test(t.trim()) ? `0${t.trim()}` : t;
};

const CATEGORY_MESSAGE = "Choose Teaching or Non-teaching.";

export type StaffRow = {
  category: z.infer<typeof staffCategory>;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
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
];

export const staffRowSchema: z.ZodType<StaffRow> = z.object({
  category: z.preprocess(toCategory, z.enum(["TEACHING", "NON_TEACHING"], { error: CATEGORY_MESSAGE })),
  firstName: personName,
  lastName: personName,
  phone: z.preprocess(phoneText, staffPhone.optional()),
  email: z.preprocess(blankToUndefined, staffEmail.optional()),
});

export const staffEntity: BulkEntity<StaffRow> = {
  id: "staff",
  label: "staff",
  columns: staffColumns,
  rowSchema: staffRowSchema,
  uniqueKeys: ["email"],
};
