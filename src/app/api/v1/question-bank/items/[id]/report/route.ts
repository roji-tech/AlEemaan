import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema, createQuestionReportSchema } from "@/lib/question-bank/validation";
import { reportQuestionAsTeacher, ReportServiceError } from "@/lib/question-bank/reports-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

const ReportBody = createQuestionReportSchema.extend({
  branchId: idSchema,
});

/**
 * POST /api/v1/question-bank/items/[id]/report
 * A teacher reports an issue on a question bank item.
 * Inputs are sanitized, links stripped, and sent to the reviewer queue.
 */
export const POST = withAuthGated(
  "staff-read",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id: itemId } = await context.params;
    const bad = badId(itemId);
    if (bad) return bad;

    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = ReportBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid report payload", 400, "VALIDATION");
    }

    try {
      const result = await reportQuestionAsTeacher({
        userId: auth.userId,
        branchId: parsed.data.branchId,
        itemId,
        reason: parsed.data.reason,
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Question report error:", err);
      return fail("Failed to file question report", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
