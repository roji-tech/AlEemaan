import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

/// Any Membership with role ADMIN grants access to every branch, regardless
/// of which branch that row's branchId anchors to — resolves the open
/// question left in prisma/schema.prisma's Membership comment since Phase
/// 0.5.0 (see domain-implementation-plan.md §0.5.1.2).
export async function requireAdmin() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const adminMembership = await prisma.membership.findFirst({
    where: { userId, role: Role.ADMIN },
  });
  if (!adminMembership) return null;

  return { userId };
}
