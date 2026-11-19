import "@/lib/zod-csp";
import { z } from "zod";

// The rules for the fields of a staff record, with NO database in them, so the browser (the single form, the bulk screen) and the server run the very same ones. `staff.ts`
// builds its strict input from these; the bulk import (task 0084) builds its row from them. Change a rule here and every door follows.

export const STAFF_NAME_MAX = 80;

export const personName = z.string().trim().min(1, "Give a name.").max(STAFF_NAME_MAX, `Use at most ${STAFF_NAME_MAX} characters.`);
export const staffPhone = z
  .string()
  .trim()
  .regex(/^[0-9+() -]{7,20}$/, "Use 7 to 20 digits (spaces, +, - and brackets are fine).");
export const staffEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "That does not look like an email address.");
export const staffCategory = z.enum(["TEACHING", "NON_TEACHING"]);
/// Optional for a staff record (task 0111); the same two values as a pupil's.
export const staffGender = z.enum(["MALE", "FEMALE"], { error: "Choose Male or Female." });

/// A job title (task 0111: "a specific title for non-teaching staff", e.g. Bursar, Driver, Security, Cook; stored as `designation`) and a qualification (e.g. B.Ed. Mathematics, NCE): free
/// text, optional, at most 120 characters. A blank one is "not given" and is stored as null.
export const STAFF_DETAIL_MAX = 120;
export const staffDetail = z.string().trim().max(STAFF_DETAIL_MAX, `Use at most ${STAFF_DETAIL_MAX} characters.`);
/// How the person is addressed (Mr, Mrs, Miss, Dr, Mallam, Ustadh…): free text, optional, at most 30 characters (task 0111). The form suggests the common ones.
export const STAFF_TITLE_MAX = 30;
export const staffTitle = z.string().trim().max(STAFF_TITLE_MAX, `Use at most ${STAFF_TITLE_MAX} characters.`);
/// A short display role label shown on the staff card (e.g. "Head of Science", "Form Tutor"). Optional, at most 80 characters.
export const STAFF_ROLE_MAX = 80;
export const staffRole = z.string().trim().max(STAFF_ROLE_MAX, `Use at most ${STAFF_ROLE_MAX} characters.`);
export const STAFF_TITLE_SUGGESTIONS = [
  "Mr",
  "Mrs",
  "Miss",
  "Ms",
  "Dr",
  "Prof",
  "Mallam",
  "Ustadh",
  "Ustadha",
  "Alhaji",
  "Alhaja",
  "Engr",
  "Barr",
] as const;
/// Blank, after trimming, is "not given".
export const detailOrNull = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

export const STAFF_CATEGORY_LABELS: Record<z.infer<typeof staffCategory>, string> = {
  TEACHING: "Teaching staff",
  NON_TEACHING: "Non-teaching staff",
};
