import { cache } from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
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
/// `isAdmin` follows the API's rule (`withAuth({ roles: [ADMIN] })`): any ADMIN membership. This is a
/// single-school product — an admin's role applies across every branch by design (plan §0.5.1.2).
export const requirePageSession = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await getUserMemberships(session.userId);
  const primary = ROLE_PRECEDENCE.find((role) => memberships.some((m) => m.role === role));

  return {
    session,
    memberships,
    isAdmin: primary === Role.ADMIN,
    roleLabel: primary ? ROLE_LABELS[primary] : "No role yet",
  };
});
