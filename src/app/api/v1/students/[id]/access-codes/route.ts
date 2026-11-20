import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { adminScope } from "@/lib/auth/branch-access";
import { studentBranchId, studentNotFound } from "@/lib/students/scope";
import { codeStatus, regeneratePupilCode, signInAddresses } from "@/lib/portal/access-codes";

type Context = { params: Promise<{ id: string }> };

// GET  /api/v1/students/[id]/access-codes   when the pupil code was made, each guardian of the pupil with when their code was made (and whether this administrator may make it), whether
//                                            the branch's family sign-in is open, and where each code is used.
// POST /api/v1/students/[id]/access-codes { which: "pupil" }   a new pupil code, shown ONCE in this answer; the old one stops at once and the pupil's sessions end. (A guardian's code:
//                                            POST /api/v1/guardians/[id]/access-code, task 0113 D7.)
// Task 0113. An administrator of the pupil's branch or a superadmin (a teacher is refused; another branch's pupil is the same 404 as an unknown one). Audited without the code; never cached;
// at most CODES_LIMIT regenerations per administrator per 5 minutes.
const CODES_LIMIT = 60;
const body = z.strictObject({ which: z.literal("pupil") });
const of = async (_input: unknown, _req: unknown, ctx: Context) => studentBranchId((await ctx.params).id);

export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>({ of, as: "administer", refuse: studentNotFound }, async (_req, auth, ctx) => {
    const status = await codeStatus(await adminScope(auth.userId), (await ctx.params).id);
    return noStore(status ? ok(status) : studentNotFound());
  }),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth<Context>(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of, as: "administer", refuse: studentNotFound },
      async (_req, auth, ctx) => {
        if (!(await reserveAttempt(`access-code:${auth.userId}`, CODES_LIMIT))) {
          return noStore(fail("Several codes were made in the last few minutes. Please wait a few minutes.", 429, "RATE_LIMITED"));
        }
        const slip = await regeneratePupilCode(auth.userId, (await ctx.params).id);
        return noStore(slip ? ok({ slip, signIn: signInAddresses() }) : fail("Restore this pupil before making a code.", 409, "CONFLICT"));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
