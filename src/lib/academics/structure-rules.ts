import "@/lib/zod-csp";
import { z } from "zod";

// The field rules of classes, arms and subjects, CLIENT-SAFE (no database): the single forms' routes (`structure.ts`) and the bulk entry (`lib/bulk/classes.ts`, `subjects.ts`) both use
// these, so a name is refused in the same words wherever it is typed (task 0084, the same way `staff-rules.ts` does it for staff).

export const structureName = z.string().trim().min(1, "Give a name.").max(60, "Use at most 60 characters.");
export const subjectCode = z
  .string()
  .trim()
  .max(12, "Use at most 12 characters.")
  .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only.")
  .transform((v) => v.toUpperCase());

export const CLASS_TAKEN = "This branch already has a class with that name.";
export const SUBJECT_TAKEN = "This branch already has a subject with that name or code.";
