import type { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/envelope";
import { portalAdmitsRequest } from "@/lib/auth/portal-gate";
import { loginOpenFor } from "@/lib/auth/login-switch";
import { LOGIN_CLOSED_CODE, LOGIN_CLOSED_MESSAGE } from "@/lib/auth/login-switch-rules";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { liftEndedSuspensions } from "@/lib/standing/sign-in";
import { SESSION_COOKIE_NAME, createSession, deleteSessionByToken, setSessionCookie } from "@/lib/auth/session";

/// The ONE place a person becomes signed in. Used by sign-in step 1 (no second factor on the account) and
/// by step 2 (`/login/mfa`, after the second factor) — so the two can't drift apart, and nothing else may
/// call createSession on the strength of a password alone (and nothing else creates one: a reset link, an invitation and an e-mail confirmation sign nobody in).
///
/// Rotates first (a session the browser already presented is deleted before the new one exists, never left
/// valid alongside it), gives an administrator anywhere (or a superadmin) the shorter absolute lifetime, and honours `remember`
/// ("Keep me signed in": a persistent cookie and the long policy; otherwise a browser-session cookie and a
/// 12-hour server-side cap).
export async function completeSignIn(
  req: NextRequest,
  user: { id: string; name: string | null; email: string | null },
  remember: boolean,
  extra: Record<string, unknown> = {},
): Promise<NextResponse> {
  // The second step of sign-in comes here too, so a portal that does not admit the person is refused here as well, with the same answer as a wrong password (task 0086).
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { isSuperAdmin: true } });
  if (!(await portalAdmitsRequest(req, user.id, account?.isSuperAdmin ?? false)))
    return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
  // Student and parent sign-in, per branch (task 0091): this is the ONE place a session is made, so a switch that is off cannot be walked around by any way that ends here (the two-step
  // answer included, where the branch may have been closed since step 1). The credentials are proved by now (the password, and the second factor when there is one), so the person is
  // told the plain reason.
  if (!(await loginOpenFor(user.id, account?.isSuperAdmin ?? false))) return fail(LOGIN_CLOSED_MESSAGE, 403, LOGIN_CLOSED_CODE);

  const presentedToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (presentedToken) await deleteSessionByToken(presentedToken);

  // A suspension whose end date has passed ends here, before anything reads the person's memberships (task 0045).
  await liftEndedSuspensions(user.id);

  // An administrator of any branch, or a superadmin, gets the shorter lifetime.
  const holdsAdmin =
    Boolean(
      await prisma.membership.findFirst({
        where: { userId: user.id, role: Role.ADMIN, deactivatedAt: null },
        select: { id: true },
      }),
    ) || (await isSuperAdmin(user.id));
  const { token, expires, persistent } = await createSession(user.id, req.headers.get("user-agent"), {
    admin: holdsAdmin,
    remember,
  });

  const response = ok({ user: { id: user.id, name: user.name, email: user.email }, ...extra });
  return setSessionCookie(response, token, persistent ? expires : null);
}
