import { z } from "zod";
import { PRACTICE_LEVELS, portalAccessProblems } from "./access";

// What the Portal access settings route takes (task 0040): both actors, every key, nothing else, and the rules of `portalAccessProblems`. Server only: the Settings screen
// uses `portalAccessProblems` directly, so the browser never loads zod.

const accessSchema = z.strictObject({
  overview: z.boolean(),
  results: z.boolean(),
  invoices: z.boolean(),
  materials: z.boolean(),
  submitWork: z.boolean(),
  takeQuizzes: z.boolean(),
  siblings: z.boolean(),
  practice: z.enum(PRACTICE_LEVELS),
});

export const portalAccessInput = z.strictObject({ pupil: accessSchema, guardian: accessSchema }).superRefine((value, ctx) => {
  for (const problem of portalAccessProblems(value)) ctx.addIssue({ code: "custom", path: problem.path, message: problem.message });
});
