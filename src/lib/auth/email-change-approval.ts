import { EmailChangeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, isSuperAdmin, type AdminScope } from "@/lib/auth/branch-access";
import { issueEmailChangeToken } from "@/lib/auth/email-change";

// Changing the address on an account needs approval (task 0088). The address is the recovery channel, so moving it is the
// most dangerous thing a signed-in person can do to an account: a stolen session plus the password would otherwise be enough.
// Who decides depends on who is asking:
//   - a superadmin has nobody above them: no approval, the link goes to the new address straight away (as before);
//   - an administrator (an active ADMIN membership somewhere): a superadmin decides;
//   - anyone else (staff, pupil, parent): an administrator of a branch they belong to, or a superadmin, decides.
// Nobody decides their own request.

export type ApprovalLevel = "NONE" | "ADMIN" | "SUPERADMIN";

/// What approval this person's email change needs, from their authority NOW (a superadmin needs none).
export async function requiredLevelFor(userId: string): Promise<ApprovalLevel> {
  if (await isSuperAdmin(userId)) return "NONE";
  const { branchIds } = await adminScope(userId);
  return branchIds.length > 0 ? "SUPERADMIN" : "ADMIN";
}

/// The pure rule: may `approver` decide a request from `requester`, whose approval level is `level`, who belongs to `branchIds`?
export function mayApprove(
  approver: { userId: string; scope: AdminScope },
  requester: { userId: string; level: "ADMIN" | "SUPERADMIN"; branchIds: readonly string[] },
): boolean {
  if (approver.userId === requester.userId) return false;
  if (approver.scope.superAdmin) return true;
  if (requester.level === "SUPERADMIN") return false;
  return requester.branchIds.some((id) => approver.scope.branchIds.includes(id));
}

const RANK = { ADMIN: 1, SUPERADMIN: 2 } as const;
/// The level a request needs now: the one recorded when it was made, or higher if the person has been promoted since (never lower).
export function effectiveLevel(stored: string, now: ApprovalLevel): "ADMIN" | "SUPERADMIN" {
  const base = stored === "SUPERADMIN" ? "SUPERADMIN" : "ADMIN";
  return now !== "NONE" && RANK[now] > RANK[base] ? now : base;
}

/// Records a request that waits for approval, replacing the person's earlier PENDING one.
export async function createPendingRequest(userId: string, newEmail: string, level: "ADMIN" | "SUPERADMIN") {
  return prisma.$transaction(async (tx) => {
    await tx.emailChangeRequest.deleteMany({ where: { userId, status: EmailChangeStatus.PENDING } });
    return tx.emailChangeRequest.create({ data: { userId, newEmail, requiredLevel: level } });
  });
}

/// The person's open request, if any (the account page shows it).
export const openRequestFor = (userId: string) =>
  prisma.emailChangeRequest.findFirst({
    where: { userId, status: EmailChangeStatus.PENDING },
    select: { id: true, newEmail: true, createdAt: true },
  });

/// Withdraws the person's own open request. True when there was one.
export async function cancelOwnRequest(userId: string): Promise<boolean> {
  const gone = await prisma.emailChangeRequest.deleteMany({ where: { userId, status: EmailChangeStatus.PENDING } });
  return gone.count > 0;
}

export type PendingEmailChange = {
  id: string;
  newEmail: string;
  createdAt: Date;
  person: { id: string; name: string | null; email: string | null };
  level: "ADMIN" | "SUPERADMIN";
  roles: string[];
};

const requesterSelect = {
  id: true,
  name: true,
  email: true,
  memberships: { where: { deactivatedAt: null }, select: { branchId: true, role: true } },
} as const;

/// The open requests this person may decide, oldest first. Anything they may not decide is simply absent.
export async function pendingFor(approverId: string): Promise<PendingEmailChange[]> {
  const scope = await adminScope(approverId);
  if (!scope.superAdmin && scope.branchIds.length === 0) return [];
  const rows = await prisma.emailChangeRequest.findMany({
    where: { status: EmailChangeStatus.PENDING, userId: { not: approverId } },
    orderBy: { createdAt: "asc" },
    include: { user: { select: requesterSelect } },
    take: 500,
  });
  const out: PendingEmailChange[] = [];
  for (const row of rows) {
    const level = effectiveLevel(row.requiredLevel, await requiredLevelFor(row.userId));
    const branchIds = row.user.memberships.map((m) => m.branchId);
    if (!mayApprove({ userId: approverId, scope }, { userId: row.userId, level, branchIds })) continue;
    out.push({
      id: row.id,
      newEmail: row.newEmail,
      createdAt: row.createdAt,
      person: { id: row.user.id, name: row.user.name, email: row.user.email },
      level,
      roles: [...new Set(row.user.memberships.map((m) => m.role))],
    });
  }
  return out;
}

export type Decision =
  | { kind: "GONE" } // unknown, already decided, or not this person's to decide: all answered alike
  | { kind: "DENIED"; userId: string; oldEmail: string | null; newEmail: string }
  | { kind: "APPROVED"; userId: string; oldEmail: string | null; newEmail: string; token: string | null }; // token null: the address now belongs to someone

/// Approves or denies one request, claimed by a conditional update (two administrators clicking at once: one wins). Approving issues the
/// link in the SAME transaction, unless the address has been taken since — then nothing is issued and the caller sends the "taken" notice,
/// the same answer the person would have had on the old, immediate flow.
export async function decideRequest(
  approverId: string,
  requestId: string,
  decision: "APPROVE" | "DENY",
  reason?: string,
): Promise<Decision> {
  const row = await prisma.emailChangeRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: requesterSelect } },
  });
  if (!row || row.status !== EmailChangeStatus.PENDING) return { kind: "GONE" };
  const scope = await adminScope(approverId);
  const level = effectiveLevel(row.requiredLevel, await requiredLevelFor(row.userId));
  const branchIds = row.user.memberships.map((m) => m.branchId);
  if (!mayApprove({ userId: approverId, scope }, { userId: row.userId, level, branchIds })) return { kind: "GONE" };

  return prisma.$transaction(async (tx): Promise<Decision> => {
    const now = new Date();
    const claimed = await tx.emailChangeRequest.updateMany({
      where: { id: requestId, status: EmailChangeStatus.PENDING },
      data: {
        status: decision === "APPROVE" ? EmailChangeStatus.APPROVED : EmailChangeStatus.DENIED,
        deciderUserId: approverId,
        decidedAt: now,
        decisionReason: reason?.trim() || null,
      },
    });
    if (claimed.count !== 1) return { kind: "GONE" };
    const base = { userId: row.userId, oldEmail: row.user.email, newEmail: row.newEmail };
    if (decision === "DENY") return { kind: "DENIED", ...base };
    const taken = await tx.user.findUnique({ where: { email: row.newEmail }, select: { id: true } });
    return { kind: "APPROVED", ...base, token: taken ? null : await issueEmailChangeToken(tx, row.userId, row.newEmail) };
  });
}
