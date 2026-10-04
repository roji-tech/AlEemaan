import { prisma } from "@/lib/db";

/// Records a person-level security event (password reset/changed). Single school, so one row — Octalve
/// Edu's version writes one per school the person belongs to (its AuditLog has a tenant column; this
/// one doesn't). A divergence kept on purpose.
export async function auditPersonEvent(userId: string, action: string): Promise<void> {
  await prisma.auditLog.create({
    data: { actorUserId: userId, action, targetType: "User", targetId: userId },
  });
}
