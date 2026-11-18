import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { setLoginSwitches, switchableBranches } from "@/lib/auth/login-switch";
import { loginSwitchesInput, type LoginSwitchesInput } from "@/lib/auth/login-switch-input";
import { structureCall } from "@/lib/academics/structure-http";

// Student and parent sign-in, PER BRANCH (task 0091): two switches on every branch, OFF until turned on. `roles: [ADMIN]` admits a superadmin and an administrator (an active ADMIN membership);
// everyone else (a teacher, a member of staff, a student, a parent, a signed-out caller) is refused before anything below runs. What each of the two may touch is decided by `adminScope`,
// the one place that says which branches a caller administers: a superadmin every branch, an administrator only the branches where they hold an active ADMIN membership.
//
// GET   The branches the caller may switch, one row each with both values, and whether the caller is a superadmin (who also gets the bulk controls). Never from a cache.
// PATCH Body `{ branchIds: string[] }` or `{ allBranches: true }` (exactly one), and `studentLoginEnabled` and/or `parentLoginEnabled`; nothing else. All the branches named are changed in ONE
//       transaction or none are: an administrator naming a branch that is not theirs (or does not exist: the same answer) is refused whole with 403; a superadmin naming one that does not
//       exist gets 404. `allBranches` is every branch the caller may switch. One audit entry per branch that changed. A student or parent already signed in to a branch that is now
//       closed is signed out on their next request (the session check reads the switches with the session, `lib/auth/session.ts`).
type PatchBody = Parsed<LoginSwitchesInput, undefined>;

export const GET = withAuth(
  async (_req, auth) => {
    const scope = await adminScope(auth.userId);
    return ok({ branches: await switchableBranches(scope), canBulk: scope.superAdmin });
  },
  { roles: [Role.ADMIN] },
);

export const PATCH = withAuth(
  validate({ body: loginSwitchesInput }, async (_req, auth, _ctx, { body }: PatchBody) =>
    structureCall("SETTINGS_LOGIN_SWITCHES_PATCH", async () => {
      const result = await setLoginSwitches(auth.userId, await adminScope(auth.userId), body);
      if (!result.ok) return fail(result.message, result.status, result.code);
      return ok({ branches: result.branches, changes: result.changes });
    }),
  ),
  { roles: [Role.ADMIN] },
);
