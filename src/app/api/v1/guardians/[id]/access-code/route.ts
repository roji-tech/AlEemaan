import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { GUARDIAN_NOT_FOUND, NOT_EVERY_BRANCH, guardianAuthority } from "@/lib/guardians/service";
import { issueGuardianCode, signInAddresses } from "@/lib/portal/access-codes";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/guardians/[id]/access-code   a new access code for this guardian (task 0113 D7): one code for all their children, shown ONCE in this answer with the children it opens and
// where it is used; the old one stops at once and the guardian's open sessions end. A superadmin, or an administrator of EVERY branch the guardian's children are in (task 0113 D4: the
// code opens all of them); out of reach is the same 404 as unknown. Audited without the code; never cached; at most CODES_LIMIT codes per administrator per 5 minutes.
const CODES_LIMIT = 60;

export const POST = withAuth<Context>(
  async (_req, auth, ctx) => {
    const id = (await ctx.params).id;
    const authority = await guardianAuthority(await adminScope(auth.userId), id);
    if (authority === "none") return noStore(fail(GUARDIAN_NOT_FOUND, 404, "NOT_FOUND"));
    if (authority !== "act") return noStore(fail(NOT_EVERY_BRANCH, 403, "FORBIDDEN"));
    if (!(await reserveAttempt(`access-code:${auth.userId}`, CODES_LIMIT))) {
      return noStore(fail("Several codes were made in the last few minutes. Please wait a few minutes.", 429, "RATE_LIMITED"));
    }
    const made = await issueGuardianCode(auth.userId, id);
    return noStore(made ? ok({ ...made, signIn: signInAddresses() }) : fail(GUARDIAN_NOT_FOUND, 404, "NOT_FOUND"));
  },
  { roles: [Role.ADMIN] },
);
