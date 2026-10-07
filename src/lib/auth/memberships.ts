import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type UserMembership = {
  branchId: string;
  branchName: string;
  role: Role;
};

/// The branches a user belongs to (ACTIVE memberships only), with their role in each. (Octalve Edu's
/// equivalent is tenant-scoped; here there is exactly one school and the
/// "where" is a Branch. An ADMIN's role applies across every branch by design —
/// domain-implementation-plan.md §0.5.1.2 — the row's branch is bookkeeping.)
export async function getUserMemberships(userId: string): Promise<UserMembership[]> {
  const rows = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null }, // a deactivated membership is no membership
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((m) => ({ branchId: m.branch.id, branchName: m.branch.name, role: m.role }));
}
