import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema, resolveQuestionReportSchema } from "@/lib/question-bank/validation";
import { resolveQuestionReport, ReportServiceError } from "@/lib/question-bank/reports-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

const ResolveBody = resolveQuestionReportSchema.extend({
  branchId: idSchema.optional(),
});

/**
 * PATCH /api/v1/question-bank/reports/[id]
 * A reviewer in scope resolves a question report with an outcome (FIXED, NOT_AN_ERROR, NEEDS_DISCUSSION).
 * Optional re-grade execution if FIXED and question was used in assessments.
 */
export const PATCH = withAuthGated(
  "staff-write",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id: reportId } = await context.params;
    const bad = badId(reportId);
    if (bad) return bad;

    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = ResolveBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid report resolution payload", 400, "VALIDATION");
    }

    try {
      const result = await resolveQuestionReport({
        userId: auth.userId,
        reportId,
        outcome: parsed.data.outcome,
        outcomeReason: parsed.data.outcomeReason,
        applyRegrade: parsed.data.applyRegrade,
      });
      return ok(result);
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Resolve question report error:", err);
      return fail("Failed to resolve question report", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
