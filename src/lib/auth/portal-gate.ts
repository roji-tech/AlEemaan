import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requestHost } from "@/lib/auth/csrf";
import { classifyHost, portalAdmits, portalFor, readPortalConfig, type Portal } from "@/lib/portals";

// Which sign-in portal a request is on, and whether it admits a person (task 0086). With no `*_SUBDOMAIN` variable set the feature is off and nothing here costs a query or changes an
// answer. Read once per process: the environment does not change while it runs.
const { config, problems } = readPortalConfig();
for (const problem of problems) console.error(`[PORTALS] ${problem}`);
export const portalConfig = config;

/// The portal this request was made to, null on the school's own host or when the feature is off.
export function portalOfRequest(req: NextRequest): Portal | null {
  const info = classifyHost(requestHost(req), config);
  return info.kind === "portal" ? info.portal : null;
}

/// True when the feature is off, or this request is on a portal that admits the person. With portals on, the school's own host admits nobody: signing in happens on a portal.
/// Always one read of the person's memberships when it is on, whether or not the person exists (`userId` null): "no such account" and "wrong portal" cost the same, and so does
/// a wrong password, so the answer to a failed sign-in never says which of the three it was.
export async function portalAdmitsRequest(req: NextRequest, userId: string | null, isSuperAdmin: boolean): Promise<boolean> {
  const info = classifyHost(requestHost(req), config);
  if (info.kind === "off") return true;
  const memberships = await prisma.membership.findMany({ where: { userId: userId ?? "-", deactivatedAt: null }, select: { role: true } });
  if (info.kind !== "portal" || userId === null) return false;
  // A superadmin counts only while they hold an active membership (as everywhere else).
  return portalAdmits(info.portal, { isSuperAdmin: isSuperAdmin && memberships.length > 0, roles: memberships.map((m) => m.role) });
}

/// The portal a person signs in on (the first that admits them, administrators first), for the links in the mail sent to them; null when they hold no role. Each mail builder is
/// handed this, so that a link never names a portal that would refuse its reader.
export async function portalForUser(userId: string): Promise<Portal | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true, memberships: { where: { deactivatedAt: null }, select: { role: true } } },
  });
  if (!user) return null;
  return portalFor({ roles: user.memberships.map((x) => x.role), isSuperAdmin: user.isSuperAdmin && user.memberships.length > 0 });
}
