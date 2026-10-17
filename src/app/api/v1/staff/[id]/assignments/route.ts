import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { addAssignment, assignmentInput, staffBranchId } from "@/lib/academics/staff";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/staff/[id]/assignments { subjectId, classArmId }   Administrators of the record's branch. The arm's class must study the subject; everything live, same branch.
export const POST = withAuth<Context>(
  validate(
    { body: assignmentInput },
    withBranch<Parsed<z.infer<typeof assignmentInput>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Staff record") },
      async (_req, auth, ctx, { body }) =>
        structureCall("STAFF_ASSIGN", async () => {
          const assignment = await addAssignment(auth.userId, (await ctx.params).id, body);
          return assignment ? ok({ assignment }, {}, 201) : notFound("Staff record");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
