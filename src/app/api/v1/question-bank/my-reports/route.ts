import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { getTeacherReportHistory } from "@/lib/question-bank/reports-service";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/question-bank/my-reports
 * The reports the signed-in member of staff filed, with where each stands and the reviewer's outcome. Only their own: the filter is the caller's id, there is no parameter to
 * widen it. (The reviewers' list, `GET /reports`, is a different thing: it shows every report, with the reporter masked.)
 */
export const GET = withAuthGated(
  "staff-read",
  async (_req, auth) => {
    try {
      const reports = await getTeacherReportHistory({ userId: auth.userId });
      return ok({ reports });
    } catch (err) {
      console.error("My question reports error:", err);
      return fail("Failed to load your reports", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
