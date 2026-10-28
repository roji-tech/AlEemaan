import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import {
  getResponseForMarking,
  markFormAnswer,
  markFormAttempt,
  ManualMarkingError,
} from "@/lib/forms/manual-marking-service";
import {
  markAnswerSchema,
  markAttemptSchema,
} from "@/lib/forms/validation";
import { BANK_STAFF_ROLES, badId, FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms/[id]/responses/[responseId]/marking?branchId=...
 * Fetches detailed response and questions for grading.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req, auth, context: { params: Promise<{ id: string; responseId: string }> }) => {
    const { id: formId, responseId } = await context.params;
    const badForm = badId(formId);
    if (badForm) return badForm;
    const badResp = badId(responseId);
    if (badResp) return badResp;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      const data = await getResponseForMarking({
        branchId,
        formId,
        responseId,
        actorUserId: auth.userId,
      });
      return ok(data);
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode);
      }
      console.error("Get response for marking error:", err);
      return fail("Failed to load response for marking", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);

/**
 * PATCH /api/v1/forms/[id]/responses/[responseId]/marking
 * Grades an individual answer or a batch of answers for an attempt.
 */
export const PATCH = withAuthGated(
  "staff-write",
  async (req, auth, context: { params: Promise<{ id: string; responseId: string }> }) => {
    const { id: formId, responseId } = await context.params;
    const badForm = badId(formId);
    if (badForm) return badForm;
    const badResp = badId(responseId);
    if (badResp) return badResp;

    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const raw = (read.json && typeof read.json === "object" ? read.json : {}) as Record<string, unknown>;
    const url = new URL(req.url);
    const branchId = (raw.branchId as string) || url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      // Check if it's a batch attempt marking
      if (Array.isArray(raw.answers)) {
        const parsed = markAttemptSchema.safeParse({ answers: raw.answers });
        if (!parsed.success) {
          return fail(parsed.error.issues[0]?.message || parsed.error.message || "Invalid attempt marking input", 400, "VALIDATION");
        }
        const result = await markFormAttempt({
          branchId,
          formId,
          responseId,
          answers: parsed.data.answers,
          overallFeedback: typeof raw.overallFeedback === "string" ? raw.overallFeedback : undefined,
          actorUserId: auth.user.id,
        });
        return ok(result);
      }

      // Otherwise single answer marking
      if (!raw.answerId || typeof raw.answerId !== "string") {
        return fail("Either 'answerId' or 'answers' array is required.", 400, "VALIDATION");
      }
      const parsed = markAnswerSchema.safeParse({
        score: raw.score,
        feedback: raw.feedback,
      });
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message || parsed.error.message || "Invalid answer score input", 400, "VALIDATION");
      }

      const result = await markFormAnswer({
        branchId,
        formId,
        responseId,
        answerId: raw.answerId,
        score: parsed.data.score,
        feedback: parsed.data.feedback,
        actorUserId: auth.user.id,
      });
      return ok(result);
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode);
      }
      console.error("Mark response error:", err);
      return fail("Failed to mark response", 500);
    }
  },
  { roles: FORM_STAFF_ROLES },
);
