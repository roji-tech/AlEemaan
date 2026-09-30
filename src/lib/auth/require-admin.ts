import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

/// Any Membership with role ADMIN grants access to every branch, regardless
/// of which branch that row's branchId anchors to — same rule Octalve Edu's
/// plan adopted for its own ADMIN/campusId (domain-implementation-plan.md
/// §0.5.2), kept identical between the two projects deliberately.
export async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return null;

  const adminMembership = await prisma.membership.findFirst({
    where: { userId: session.userId, role: Role.ADMIN },
  });
  if (!adminMembership) return null;

  return { userId: session.userId };
}
