import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditDetails = { before?: unknown; after?: unknown; reason?: string };

/// Records a person-level security event (password reset/changed, MFA, profile and email changes, sessions).
/// Single school, so one row — Octalve Edu's version writes one per school the person belongs to (its AuditLog
/// has a tenant column; this one doesn't). A divergence kept on purpose. `details` is for events that changed
/// something: what it was and what it became.
export async function auditPersonEvent(userId: string, action: string, details: AuditDetails = {}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action,
      targetType: "User",
      targetId: userId,
      ...(details.before !== undefined ? { beforeValue: details.before as Prisma.InputJsonValue } : {}),
      ...(details.after !== undefined ? { afterValue: details.after as Prisma.InputJsonValue } : {}),
      ...(details.reason ? { reason: details.reason } : {}),
    },
  });
}
