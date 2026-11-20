import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { ratingsInput, saveRatings, traitSheet, traitsQuery, traitsStudentBranch } from "@/lib/results/report-traits";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Student");

// GET /api/v1/students/[id]/report-traits?periodId=   what the report card asks about this pupil for the term: their template's trait groups with the 1 to 5 ratings so far, the
//   attendance (entered, from the register, and the one the card will print), the term's dates, whether it is locked by publication and whether THIS person may enter. Any staff role of
//   the pupil's branch; a student of another branch is the same 404 as an unknown id.
// PUT /api/v1/students/[id]/report-traits { periodId, ratings: [{ traitId, rating | null }] }   sets or clears ratings, all or nothing. An administrator of the branch, or the class
//   teacher of the arm the pupil is in for the term's session (another teacher: 403). 409 once the pupil's results for the term are published, for a trait that is not on this pupil's
//   template, or a rating outside 1 to 5 (400).
export const GET = withAuth<Context>(
  validate(
    { query: traitsQuery },
    withBranch<Parsed<undefined, z.infer<typeof traitsQuery>>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => traitsStudentBranch((await ctx.params).id), as: "staff-read", refuse: gone },
      async (_req, auth, ctx, { query }, branch) =>
        structureCall("REPORT_TRAITS_GET", async () => {
          const sheet = await traitSheet(
            { userId: auth.userId, role: branch.role },
            branch.branchId,
            (await ctx.params).id,
            query.periodId,
          );
          return sheet ? noStore(ok({ sheet })) : notFound("Term");
        }),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);

export const PUT = withAuth<Context>(
  validate(
    { body: ratingsInput },
    withBranch<Parsed<z.infer<typeof ratingsInput>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => traitsStudentBranch((await ctx.params).id), as: "staff-write", refuse: gone },
      async (_req, auth, ctx, { body }, branch) =>
        structureCall("REPORT_TRAITS_SAVE", async () =>
          noStore(ok(await saveRatings({ userId: auth.userId, role: branch.role }, branch.branchId, (await ctx.params).id, body))),
        ),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
