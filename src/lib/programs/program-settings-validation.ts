import { z } from "zod";
import { bandsSchema } from "./assessment-validation";
import { MAX_CERT_BODY, MAX_CERT_TITLE, MAX_SIGNATORIES, MAX_SIGNATORY_FIELD } from "./completion-rules";
import { HAS_CONTROL_CHARACTER } from "./rules";

const plain = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} can be at most ${max} characters`)
    .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`);

// The program's own settings, one strict body for every slice that has one (task 0043): attendance (P3), assessments (P3b), fees (P4), completion and certificates (P5).

export const programSettingsSchema = z
  .object({
    attendanceEnabled: z.boolean().optional(),
    lowAttendancePercent: z
      .number()
      .int()
      .min(1, "The threshold is a percentage from 1 to 100")
      .max(100, "The threshold is a percentage from 1 to 100")
      .optional(),
    assessmentsEnabled: z.boolean().optional(),
    gradeBands: bandsSchema.optional(),
    feesEnabled: z.boolean().optional(),
    certTitle: plain("The title", 1, MAX_CERT_TITLE).optional(),
    certBody: plain("The wording", 1, MAX_CERT_BODY).optional(),
    certSignatories: z
      .array(
        z
          .object({
            name: plain("A signatory's name", 1, MAX_SIGNATORY_FIELD),
            title: plain("A signatory's title", 0, MAX_SIGNATORY_FIELD),
          })
          .strict(),
      )
      .max(MAX_SIGNATORIES, `At most ${MAX_SIGNATORIES} signatories`)
      .optional(),
    completionMinAverage: z
      .number()
      .min(0, "The average is a percentage from 0 to 100")
      .max(100, "The average is a percentage from 0 to 100")
      .refine((n) => Math.round(n * 100) / 100 === n, "At most two decimal places")
      .nullable()
      .optional(),
    completionRequirePassed: z.boolean().optional(),
    noCertWhileOwing: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Change at least one setting");
