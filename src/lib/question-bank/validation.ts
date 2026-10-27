import { z } from "zod";
import { ID_PATTERN } from "@/lib/api/ids";

/// An id from a request: the shape of a cuid, nothing else (see lib/api/ids.ts).
export const idSchema = z.string().regex(ID_PATTERN, "That is not a valid id.");

/// Whether a piece of text holds a control, format (zero-width, bidi), private-use, unassigned or lone-surrogate character. Whitespace is collapsed before this is asked.
/// A NUL cannot be stored at all, and the others only ever make two labels look the same while being different.
export const hasForbiddenCharacters = (text: string) => /\p{C}/u.test(text);

export const startPracticeSessionSchema = z.object({
  subjectLabel: z.string().max(100).optional(),
  topic: z.string().max(100).optional(),
  size: z.number().int().min(1).max(100).optional(),
  feedbackMode: z.enum(["EACH", "END"]).optional(),
});

export const submitPracticeAnswerSchema = z.object({
  bankItemId: idSchema,
  answer: z.unknown(),
});

export const archivePracticeAttemptSchema = z.object({
  archived: z.boolean(),
});
