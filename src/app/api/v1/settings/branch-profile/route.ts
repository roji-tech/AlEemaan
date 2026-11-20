import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { branchProfilePatchSchema, branchProfileQuerySchema, branchProfileView, updateBranchProfile } from "@/lib/settings/branch-profile";
import { PROFILE_FIELDS } from "@/lib/settings/branch-profile-rules";

// School details per branch (task 0115, task 0101 D4). The school's own details stay at /api/v1/settings/school (superadmin only, unchanged); these are one branch's own.
//
// GET   /api/v1/settings/branch-profile?branchId=   { school, branch, effective }: the school's values, the branch's own (null where it has none), and what the branch shows with where
//                                                   each value comes from. An administrator of THAT branch or a superadmin; another branch is a 404, a teacher or anyone else a 403.
// PATCH /api/v1/settings/branch-profile             { branchId, schoolName?, principal?, phone?, motto?, address?, email?, website? }: only the fields sent, and only those that change are written
//                                                   and audited (BRANCH_PROFILE_UPDATED). Blank or null clears the branch's value ("Using the school's"). A branch named in the body that
//                                                   is not the caller's is a 403. 30 saves per administrator per 5 minutes.
const SAVES_PER_WINDOW = 30;

type Query = Parsed<undefined, z.infer<typeof branchProfileQuerySchema>>;
type Body = Parsed<z.infer<typeof branchProfilePatchSchema>, undefined>;

export const GET = withAuth(
  validate(
    { query: branchProfileQuerySchema },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "administer" }, async (_req, _auth, _ctx, { query }) =>
      noStore(ok(await branchProfileView(query.branchId))),
    ),
  ),
  { roles: [Role.ADMIN] },
);

export const PATCH = withAuth(
  validate(
    { body: branchProfilePatchSchema },
    withBranch<Body, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        if (!(await reserveAttempt(`branch-profile:${auth.userId}`, SAVES_PER_WINDOW))) {
          return noStore(fail("Too many saves in a few minutes. Please wait and try again.", 429, "RATE_LIMITED"));
        }
        const { branchId, ...fields } = body;
        const changed = await updateBranchProfile(auth.userId, branchId, fields);
        return noStore(ok({ ...(await branchProfileView(branchId)), changed: PROFILE_FIELDS.filter((f) => changed.includes(f)) }));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
