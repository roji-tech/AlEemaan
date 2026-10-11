import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

/// The role a caller holds FOR ONE BRANCH, or `null` when they may not touch it. An ADMIN membership anywhere reaches every branch (as
/// everywhere in AlEemaan); anyone else needs an ACTIVE membership in that very branch. There is deliberately no default role: a person with
/// no membership in the branch gets `null`, and callers answer that exactly like an unknown branch.
export async function resolveBranchRole(userId: string, branchId: string): Promise<Role | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null },
    select: { role: true, branchId: true },
  });
  if (memberships.some((m) => m.role === Role.ADMIN)) return Role.ADMIN;
  return memberships.find((m) => m.branchId === branchId)?.role ?? null;
}

/// The branches a STAFF caller may see: `"all"` for an ADMIN membership anywhere, else the ids of the branches where they hold an active
/// membership (possibly empty). Used to narrow lists; `resolveBranchRole` answers the same question for ONE branch.
export async function branchIdsFor(userId: string): Promise<"all" | string[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null },
    select: { role: true, branchId: true },
  });
  if (memberships.some((m) => m.role === Role.ADMIN)) return "all";
  return memberships.map((m) => m.branchId);
}
