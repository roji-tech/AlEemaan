import { after } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { readJsonBody } from "@/lib/api/validate";
import { REPORTS_PER_WINDOW, reportBody, type StoredReport } from "@/lib/reports/report";
import { mailReport, recordReport } from "@/lib/reports/service";

/**
 * POST /api/v1/reports
 * Any signed-in person (task 0099). Records a problem report and mails it to DEVELOPER_EMAIL after the response. Body: { category, message, pagePath, viewport? }; who sent it, their roles,
 * branches and browser are read here, not trusted from the body. At most 5 in five minutes per person. The reply never says whether the mail went (that is the developer's concern).
 *
 * GET /api/v1/reports
 * Superadmin only. The 50 newest reports, newest first: what was recorded, and whether it was mailed.
 */
export const POST = withAuth(
  async (req, auth) => {
    if (!(await reserveAttempt(`report:${auth.userId}`, REPORTS_PER_WINDOW)))
      return fail("You have sent several reports just now. Please wait a few minutes.", 429, "RATE_LIMITED");
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const parsed = reportBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid report",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    try {
      const report = await recordReport(auth.userId, parsed.data, req.headers.get("user-agent"));
      after(async () => {
        await mailReport(report as StoredReport);
      });
      return ok({ report: { id: report.id, createdAt: report.createdAt } }, {}, 201);
    } catch (error) {
      console.error("[REPORT_RECORD_ERROR]", error);
      return fail("The report could not be saved. Please try again.", 500, "INTERNAL");
    }
  },
  { roles: Object.values(Role) },
);

export const GET = withAuth(
  async (_req, auth) => {
    if (!(await isSuperAdmin(auth.userId))) return fail("Forbidden", 403, "FORBIDDEN");
    const reports = await prisma.problemReport.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return ok({ reports });
  },
  { roles: [Role.ADMIN] },
);
