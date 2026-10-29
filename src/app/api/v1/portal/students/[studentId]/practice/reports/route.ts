import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { readJsonBody } from "@/lib/api/validate";
import { idSchema, createQuestionReportSchema } from "@/lib/question-bank/validation";
import {
  reportQuestionAsPupil,
  getPupilReportHistory,
  ReportServiceError,
} from "@/lib/question-bank/reports-service";

const PupilReportBody = createQuestionReportSchema.extend({
  itemId: idSchema,
});

/**
 * POST /api/v1/portal/students/[studentId]/practice/reports
 * A pupil reports an issue on a question they have practised.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);

  const parsed = PupilReportBody.safeParse(read.json);
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid report payload", 400, "VALIDATION"));
  }

  try {
    const result = await reportQuestionAsPupil({
      studentId,
      branchId: gate.branchId,
      itemId: parsed.data.itemId,
      reason: parsed.data.reason,
    });
    return noStore(ok(result, {}, 201));
  } catch (err) {
    if (err instanceof ReportServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal pupil report error:", err);
    return noStore(fail("Failed to file question report", 500));
  }
}

/**
 * GET /api/v1/portal/students/[studentId]/practice/reports
 * Returns reports filed by this pupil, including resolution status and reviewer outcome reason.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const reports = await getPupilReportHistory({
      studentId,
    });
    return noStore(ok({ reports }));
  } catch (err) {
    if (err instanceof ReportServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal pupil reports listing error:", err);
    return noStore(fail("Failed to load question reports", 500));
  }
}
