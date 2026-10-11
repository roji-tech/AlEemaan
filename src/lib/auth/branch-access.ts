import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

const STAFF: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

/// The STAFF role a caller holds FOR ONE BRANCH, or `null` when they may not touch it. An ADMIN membership anywhere reaches every branch
/// (interim: ADR 0012 keeps the school-wide admin of ADR 0001 until branch admins and superadmins are designed); anyone else needs an ACTIVE
/// STAFF membership in that very branch, and the role returned is the one held THERE (a teacher in Primary may be non-teaching in Secondary).
/// A STUDENT or PARENT membership is not a staff role and gives nothing. There is no default role: no membership means `null`, and callers
/// answer that exactly like an unknown branch.
export async function resolveBranchRole(userId: string, branchId: string): Promise<Role | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null },
    select: { role: true, branchId: true },
  });
  if (memberships.some((m) => m.role === Role.ADMIN)) return Role.ADMIN;
  const here = memberships.find((m) => m.branchId === branchId)?.role ?? null;
  return here && STAFF.includes(here) ? here : null;
}

/// The branches a STAFF caller may see: `"all"` for an ADMIN membership anywhere, else the ids of the branches where they hold an active
/// membership (possibly empty). Used to narrow lists; `resolveBranchRole` answers the same question for ONE branch.
export async function branchIdsFor(userId: string): Promise<"all" | string[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null },
    select: { role: true, branchId: true },
  });
  if (memberships.some((m) => m.role === Role.ADMIN)) return "all";
  return memberships.filter((m) => STAFF.includes(m.role)).map((m) => m.branchId);
}
