import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { addEntriesToBranch } from "@/lib/academics/subject-catalog";
import { fromCatalogInput } from "@/lib/academics/subject-catalog-rules";

// POST /api/v1/academics/subjects/from-catalog { branchId, catalogIds: [..] }   (task 0119) The branch takes subjects from the school's catalogue (at most 50 at a time).
// Administrators of that branch (a branch named in the body that is not theirs: 403), or a superadmin. Each subject is its own transaction and is reported: added (the branch gets its own
// subject), linked (it already had one of that name: linked, not duplicated), already, clash (another subject linked to a different entry has that name), gone (not in the catalogue or archived).
const body = fromCatalogInput;
const WRITES_PER_WINDOW = 60; // per administrator per 5 minutes

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        if (!(await reserveAttempt(`catalog-from:${auth.userId}`, WRITES_PER_WINDOW)))
          return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
        return structureCall("SUBJECT_FROM_CATALOG", async () =>
          ok({ results: await addEntriesToBranch(auth.userId, body.branchId, body.catalogIds) }, {}, 201),
        );
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
