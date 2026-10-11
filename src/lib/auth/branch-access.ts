import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

const STAFF: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

type Held = { role: Role; branchId: string };

/// The person's ACTIVE memberships and whether they are a superadmin, in one round trip. A superadmin counts only while they hold at least
/// one active membership (as signing in does): a person with every membership deactivated is signed out and has no authority.
async function load(userId: string): Promise<{ memberships: Held[]; superAdmin: boolean }> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    prisma.membership.findMany({ where: { userId, deactivatedAt: null }, select: { role: true, branchId: true } }),
  ]);
  return { memberships, superAdmin: Boolean(user?.isSuperAdmin) && memberships.length > 0 };
}

/// True when the person is a superadmin: administers every branch and the school itself (branches, settings, other administrators).
export async function isSuperAdmin(userId: string): Promise<boolean> {
  return (await load(userId)).superAdmin;
}

/// True when the person may administer THIS branch: a superadmin, or an active ADMIN membership in that very branch (ADR 0012, plan S2).
export async function canAdminister(userId: string, branchId: string): Promise<boolean> {
  const { memberships, superAdmin } = await load(userId);
  return superAdmin || memberships.some((m) => m.role === Role.ADMIN && m.branchId === branchId);
}

/// The STAFF role a caller holds FOR ONE BRANCH, or `null` when they may not touch it. A superadmin is `ADMIN` in every branch; an ADMIN
/// membership administers only its own branch; anyone else needs an ACTIVE STAFF membership in that very branch, and the role returned is
/// the one held THERE (a teacher in Primary may be non-teaching in Secondary). A STUDENT or PARENT membership is not a staff role and gives
/// nothing. There is no default role: no membership means `null`, and callers answer that exactly like an unknown branch.
export async function resolveBranchRole(userId: string, branchId: string): Promise<Role | null> {
  const { memberships, superAdmin } = await load(userId);
  if (superAdmin) return Role.ADMIN;
  const here = memberships.find((m) => m.branchId === branchId)?.role ?? null;
  return here && STAFF.includes(here) ? here : null;
}

/// The branches a STAFF caller may see: `"all"` for a superadmin, else the ids of the branches where they hold an active STAFF membership
/// (possibly empty). Used to narrow lists; `resolveBranchRole` answers the same question for ONE branch.
export async function branchIdsFor(userId: string): Promise<"all" | string[]> {
  const { memberships, superAdmin } = await load(userId);
  if (superAdmin) return "all";
  return memberships.filter((m) => STAFF.includes(m.role)).map((m) => m.branchId);
}
