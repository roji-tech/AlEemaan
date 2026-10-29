import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { QuestionReportStatus } from "@prisma/client";
import { listReportsForReviewer, ReportServiceError } from "@/lib/question-bank/reports-service";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/question-bank/reports
 * Lists question reports for reviewers.
 * Reviewers see role and section only (e.g. "Pupil in JSS", "Teacher in Primary").
 * Never leaks pupil or student personal identifiers.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req, auth) => {
    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId") || undefined;
    const statusParam = url.searchParams.get("status");
    const itemId = url.searchParams.get("itemId") || undefined;

    let status: QuestionReportStatus | "ALL" | undefined = undefined;
    if (statusParam === "ALL") {
      status = "ALL";
    } else if (statusParam && Object.values(QuestionReportStatus).includes(statusParam as QuestionReportStatus)) {
      status = statusParam as QuestionReportStatus;
    }

    try {
      const reports = await listReportsForReviewer({
        userId: auth.userId,
        branchId,
        status,
        itemId,
      });
      return ok({ reports });
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("List question reports error:", err);
      return fail("Failed to load question reports", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
