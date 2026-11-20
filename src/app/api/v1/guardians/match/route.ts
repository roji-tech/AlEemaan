import { z } from "zod";
import { Role } from "@prisma/client";
import { noStore, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { matchGuardians } from "@/lib/guardians/service";

// GET /api/v1/guardians/match?contact=   the guardians in the caller's reach with exactly this phone number (any way of writing it) or e-mail address, each with their children in reach:
// how the student form links an existing guardian instead of typing them again (task 0113 D9). Administrators only. Never looks outside the caller's reach, so it never confirms that
// someone is a guardian in another branch.
const query = z.object({ contact: z.string().trim().min(3).max(254) });

export const GET = withAuth(
  validate({ query }, async (_req, auth, _ctx: unknown, { query: q }) =>
    noStore(ok({ guardians: await matchGuardians(await adminScope(auth.userId), q.contact) })),
  ),
  { roles: [Role.ADMIN] },
);
