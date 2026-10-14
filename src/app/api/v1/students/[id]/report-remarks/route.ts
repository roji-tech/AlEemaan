import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { remarksInput, saveRemarks, studentBranch } from "@/lib/academics/report-card";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// PUT /api/v1/students/[id]/report-remarks { periodId, teacherRemark?, principalRemark? }   the two remarks on a student's report card for a term (blank clears one).
// Administrators of the student's branch; a student of another branch is the same 404 as an unknown id. Refused (409) once any of the student's results for the term
// is published.
export const PUT = withAuth<Context>(
  validate(
    { body: remarksInput },
    withBranch<Parsed<z.infer<typeof remarksInput>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => studentBranch((await ctx.params).id), as: "administer", refuse: () => notFound("Student") },
      async (_req, auth, ctx, { body }, branch) =>
        structureCall("REPORT_REMARKS", async () =>
          ok({ remarks: await saveRemarks(auth.userId, branch.branchId, (await ctx.params).id, body) }),
        ),
    ),
  ),
  { roles: [Role.ADMIN] },
);
