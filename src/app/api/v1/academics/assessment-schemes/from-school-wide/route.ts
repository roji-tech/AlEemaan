import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { copySchoolWideScheme } from "@/lib/academics/assessment";
import { structureCall } from "@/lib/academics/structure-http";

// POST /api/v1/academics/assessment-schemes/from-school-wide { branchId }   (task 0128) Makes the school-wide default scheme this branch's default scheme, as a COPY owned by the branch (marks
// entry never reads the school-wide scheme directly: every result names its own branch's scheme). Administrators of that branch (a branch named in the body that is not theirs: 403). 409 when
// the branch already has a default scheme or the school has no default scheme. The copy is an ordinary scheme: edited in place until a result uses it, then versioned.
const body = z.strictObject({ branchId: z.string().min(1) });

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("SCHEME_FROM_SCHOOL_WIDE", async () =>
          ok({ scheme: await copySchoolWideScheme(auth.userId, body.branchId) }, {}, 201),
        ),
    ),
  ),
  { roles: [Role.ADMIN] },
);
