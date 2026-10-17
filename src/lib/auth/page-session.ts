import { cache } from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/roles";
import { getUserMemberships } from "./memberships";
import { getSession } from "./session";

/// Most senior first: the role shown under a person's name when they hold several.
const ROLE_PRECEDENCE: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.PARENT, Role.STUDENT];

/// The session guard for PAGES (the API's is `withAuth`). Not signed in → /login. Wrapped in React's
/// `cache`, so the layout that draws the shell and the page inside it ask in the same request and
/// the database is hit once. **Every page must call this itself**: a layout doesn't re-render on a
/// client-side navigation between its pages, so it is display, never the guard.
///
/// `isAdmin` follows the API's rule (`withAuth({ roles: [ADMIN] })`): the person administers at least one branch (an ADMIN membership) or is
/// a superadmin. `isSuperAdmin` is school-wide authority (branches, school settings, other administrators); see ADR 0012 and the
/// branch-administrator design. Both are display and routing; the API behind every page enforces the real rule.
export const requirePageSession = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");

  const [memberships, user] = await Promise.all([
    getUserMemberships(session.userId),
    prisma.user.findUnique({ where: { id: session.userId }, select: { isSuperAdmin: true } }),
  ]);
  const primary = ROLE_PRECEDENCE.find((role) => memberships.some((m) => m.role === role));

  // A superadmin counts only while they hold an active membership (as in the API); a person with none has no role and no access here.
  const isSuperAdmin = Boolean(user?.isSuperAdmin) && memberships.length > 0;

  return {
    session,
    memberships,
    isAdmin: primary === Role.ADMIN || isSuperAdmin,
    isSuperAdmin,
    roleLabel: primary ? ROLE_LABELS[primary] : "No role yet",
  };
});
