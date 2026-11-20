import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { ScholarshipError, createType, listTypes } from "@/lib/scholarships/service";

// GET  /api/v1/finance/scholarship-types?branchId=   the branch's scholarship types (live first, archived after), each with how many pupils hold it today.
// POST /api/v1/finance/scholarship-types { branchId, name, percent, description? }   a new type: a name used once among the branch's live types, and its default share, 1 to 100 (100 = full).
// Task 0113 S1 (the maintainer: "scholarship can be of different types"). An administrator of the branch or a superadmin (a teacher is 403; a branch that is not theirs: 404 on GET, 403 in a
// POST body). Audited. Never cached.
const query = z.object({ branchId: z.string().trim().min(1).max(64) });
const body = z.strictObject({
  branchId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2, "Give the scholarship a name.").max(80),
  percent: z.number().int("The share must be a whole number.").min(1, "The share is at least 1%.").max(100, "The share is at most 100%."),
  description: z.string().trim().max(300).nullable().optional(),
});

export const GET = withAuth(
  validate(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "administer" },
      async (_req, _auth, _ctx, { query: q }) => noStore(ok({ types: await listTypes(q.branchId) })),
    ),
  ),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body: input }) => {
        try {
          return noStore(ok({ type: await createType(auth.userId, input) }, {}, 201));
        } catch (error) {
          if (error instanceof ScholarshipError) return noStore(fail(error.message, error.status, error.code));
          throw error;
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
