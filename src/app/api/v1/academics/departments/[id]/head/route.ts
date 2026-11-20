import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { departmentBranchId, headInput, setHead } from "@/lib/academics/departments";

type Context = { params: Promise<{ id: string }> };

// PUT /api/v1/academics/departments/[id]/head { staffRecordId | null, replacing | null }   Chooses the head of the department, or none (task 0101 D7). Administrators of its branch only: a head
// cannot choose their own successor. `replacing` is the head the caller was looking at; if it is no longer the head, 409 and nothing changes. The old head stays a member; a person who is not
// yet a member becomes one.
export const PUT = withAuth<Context>(
  validate(
    { body: headInput },
    withBranch<Parsed<z.infer<typeof headInput>, undefined>, AuthContext, Context>(
      {
        of: async (_input, _req, ctx) => departmentBranchId((await ctx.params).id),
        as: "administer",
        refuse: () => notFound("Department"),
      },
      async (_req, auth, ctx, { body }) =>
        structureCall("DEPARTMENT_HEAD_SET", async () => {
          const done = await setHead(auth.userId, (await ctx.params).id, body.staffRecordId, body.replacing);
          return done ? ok(done) : notFound("Department");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
