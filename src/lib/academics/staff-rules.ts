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

export const STAFF_CATEGORY_LABELS: Record<z.infer<typeof staffCategory>, string> = {
  TEACHING: "Teaching staff",
  NON_TEACHING: "Non-teaching staff",
};
