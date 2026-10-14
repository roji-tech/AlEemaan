import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { cardQuery, getReportCard, reportCardVisibleTo, studentBranch } from "@/lib/academics/report-card";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// GET /api/v1/students/[id]/report-card?periodId=&preview=true   the student's report card for a term: each PUBLISHED subject (parts, exam, total, grade, remark), total,
// average, position in the arm, the remarks and the grading legend. Any staff role held in the student's branch; a student of another branch is the same 404 as an
// unknown id. `preview=true` also shows results not yet published - administrators of the branch only (403 otherwise).
export const GET = withAuth<Context>(
  validate(
    { query: cardQuery },
    withBranch<Parsed<undefined, z.infer<typeof cardQuery>>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => studentBranch((await ctx.params).id), as: "staff-read", refuse: () => notFound("Student") },
      async (_req, _auth, ctx, { query }, branch) =>
        structureCall("REPORT_CARD", async () => {
          const preview = query.preview === "true";
          if (preview && branch.role !== Role.ADMIN)
            return fail("Only an administrator can preview unpublished results.", 403, "FORBIDDEN");
          const studentId = (await ctx.params).id;
          if (!(await reportCardVisibleTo(studentId, { kind: "staff" }))) return notFound("Report card");
          const card = await getReportCard(branch.branchId, studentId, query.periodId, preview);
          return card ? ok({ card }) : notFound("Report card");
        }),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);
