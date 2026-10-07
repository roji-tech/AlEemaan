import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";

// The school's people (domain-implementation-plan.md "Build design — Users pages and invitations", a port of Octalve Edu's 0.5.4).
//
// People are read THROUGH `membership` with a narrow `select` of the person's name and address — never a bare `user` listing.
// A "member" here is a MEMBERSHIP, addressed by its own id: a person may belong to several branches (one membership each), and the id keeps
// every action unambiguous. Every change is audited in the same
// transaction as the change.

type Tx = Prisma.TransactionClient;

export type MemberStatus = "active" | "deactivated";
export type MemberFilters = { role?: Role; branchId?: string; status: MemberStatus | "all"; q?: string };

export type PublicMember = {
  /// The membership's id — what every action addresses.
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  branchId: string;
  branchName: string;
  status: MemberStatus;
  joinedAt: Date;
};

const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  branchId: true,
  deactivatedAt: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
  branch: { select: { name: true } },
} satisfies Prisma.MembershipSelect;

type MemberRow = Prisma.MembershipGetPayload<{ select: typeof MEMBER_SELECT }>;

const toPublic = (row: MemberRow): PublicMember => ({
  id: row.id,
  userId: row.userId,
  name: row.user.name,
  email: row.user.email,
  role: row.role,
  branchId: row.branchId,
  branchName: row.branch.name,
  status: row.deactivatedAt ? "deactivated" : "active",
  joinedAt: row.createdAt,
});

/// Prisma's `contains` hands the value to `ILIKE` as it is, so `%` and `_` in what someone typed would act as patterns (a search for
/// "%" listing everyone). Backslash is Postgres' default LIKE escape: escape the three special characters and the search is text.
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export async function listMembers(
  filters: MemberFilters,
  page: { skip: number; take: number },
): Promise<{ members: PublicMember[]; total: number }> {
  const where: Prisma.MembershipWhereInput = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.status === "active" ? { deactivatedAt: null } : filters.status === "deactivated" ? { deactivatedAt: { not: null } } : {}),
    ...(filters.q
      ? {
          user: {
            OR: [
              { name: { contains: escapeLike(filters.q), mode: "insensitive" as const } },
              { email: { contains: escapeLike(filters.q), mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.membership.count({ where }),
    prisma.membership.findMany({
      where,
      select: MEMBER_SELECT,
      orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }, { id: "asc" }], // a stable order, so pages never overlap or skip
      skip: page.skip,
      take: page.take,
    }),
  ]);
  return { members: rows.map(toPublic), total };
}

export type MemberFailure =
  /// No such member: unknown id — one answer.
  | "NOT_FOUND"
  /// Nobody changes or deactivates themselves here ("ask another administrator"): an accidental self-lockout is worse than an extra step.
  | "SELF"
  /// The school's last active administrator cannot be demoted or deactivated: it would leave the school with nobody who can manage it.
  | "LAST_ADMIN"
  | "INVALID_BRANCH"
  /// The person already has a membership in the branch it would move to (one membership per person per branch).
  | "BRANCH_TAKEN"
  /// A deactivated member must be reactivated before anything else about them changes.
  | "DEACTIVATED";

/// `signedOut` (deactivation only): true when this was the person's last active membership, so their sessions were deleted.
export type MemberResult = { ok: true; member: PublicMember; changed: boolean; signedOut?: boolean } | { ok: false; reason: MemberFailure };

const find = (tx: Tx, membershipId: string) => tx.membership.findUnique({ where: { id: membershipId }, select: MEMBER_SELECT });

/// True when ANOTHER PERSON than `exceptUserId` holds an active ADMIN membership — and holds a row lock on all of them for the rest of
/// the transaction. Counted by person, not by row (one person with two admin memberships is still one administrator). Two administrators
/// demoting each other at the same instant would each see "the other is still an admin" without the lock; with it the second waits for
/// the first to commit, re-reads, and finds itself the last.
async function hasAnotherActiveAdmin(tx: Tx, exceptUserId: string): Promise<boolean> {
  const admins = await tx.$queryRaw<{ id: string; userId: string }[]>`
    SELECT id, "userId" FROM "Membership" WHERE role = 'ADMIN' AND "deactivatedAt" IS NULL FOR UPDATE`;
  return admins.some((admin) => admin.userId !== exceptUserId);
}

export async function changeMember(
  actorUserId: string,
  membershipId: string,
  change: { role?: Role; branchId?: string },
): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    if (current.userId === actorUserId) return { ok: false, reason: "SELF" };
    if (current.deactivatedAt) return { ok: false, reason: "DEACTIVATED" };

    if (change.branchId) {
      const branch = await tx.branch.findUnique({ where: { id: change.branchId }, select: { id: true } });
      if (!branch) return { ok: false, reason: "INVALID_BRANCH" };
    }
    if (change.branchId && change.branchId !== current.branchId) {
      const taken = await tx.membership.findUnique({
        where: { userId_branchId: { userId: current.userId, branchId: change.branchId } },
        select: { id: true },
      });
      if (taken) return { ok: false, reason: "BRANCH_TAKEN" };
    }
    const roleChanged = change.role !== undefined && change.role !== current.role;
    const branchChanged = change.branchId !== undefined && change.branchId !== current.branchId;
    if (!roleChanged && !branchChanged) return { ok: true, member: toPublic(current), changed: false }; // a no-op writes nothing

    if (roleChanged && current.role === "ADMIN" && change.role !== "ADMIN" && !(await hasAnotherActiveAdmin(tx, current.userId))) {
      return { ok: false, reason: "LAST_ADMIN" };
    }

    let updated: MemberRow;
    try {
      updated = await tx.membership.update({
        where: { id: current.id },
        data: { ...(roleChanged ? { role: change.role } : {}), ...(branchChanged ? { branchId: change.branchId } : {}) },
        select: MEMBER_SELECT,
      });
    } catch (error) {
      // (userId, branchId) is unique: a concurrent move onto a branch where this person already has one would collide.
      if (typeof error === "object" && error && (error as { code?: string }).code === "P2002") return { ok: false, reason: "BRANCH_TAKEN" };
      throw error;
    }
    if (roleChanged) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "MEMBER_ROLE_CHANGED",
          targetType: "Membership",
          targetId: current.id,
          beforeValue: { role: current.role },
          afterValue: { role: change.role },
        },
      });
    }
    if (branchChanged) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "MEMBER_BRANCH_CHANGED",
          targetType: "Membership",
          targetId: current.id,
          beforeValue: { branchId: current.branchId },
          afterValue: { branchId: change.branchId },
        },
      });
    }
    return { ok: true, member: toPublic(updated), changed: true };
  });
}

/// Deactivates the membership: the row stays (history, and a way back) but it stops being a membership — their access ends on their next
/// request (the role is read from the membership every time). **If it was the person's last active membership, their sessions are deleted
/// in the same transaction** (the deliberate divergence from Octalve Edu: "deactivated" means signed out here); with another active
/// membership the sessions are left alone.
export async function deactivateMember(actorUserId: string, membershipId: string): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    if (current.userId === actorUserId) return { ok: false, reason: "SELF" };
    if (current.deactivatedAt) return { ok: true, member: toPublic(current), changed: false, signedOut: false };
    if (current.role === "ADMIN" && !(await hasAnotherActiveAdmin(tx, current.userId))) return { ok: false, reason: "LAST_ADMIN" };

    const updated = await tx.membership.update({ where: { id: current.id }, data: { deactivatedAt: new Date() }, select: MEMBER_SELECT });
    const stillActive = await tx.membership.count({ where: { userId: current.userId, deactivatedAt: null } });
    const sessions = stillActive === 0 ? await tx.session.deleteMany({ where: { userId: current.userId } }) : { count: 0 };
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "MEMBER_DEACTIVATED",
        targetType: "Membership",
        targetId: current.id,
        beforeValue: { role: current.role, branchId: current.branchId },
        afterValue: { sessionsRevoked: sessions.count },
      },
    });
    return { ok: true, member: toPublic(updated), changed: true, signedOut: stillActive === 0 };
  });
}

export async function reactivateMember(actorUserId: string, membershipId: string): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    if (current.userId === actorUserId) return { ok: false, reason: "SELF" };
    if (!current.deactivatedAt) return { ok: true, member: toPublic(current), changed: false };

    const updated = await tx.membership.update({ where: { id: current.id }, data: { deactivatedAt: null }, select: MEMBER_SELECT });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "MEMBER_REACTIVATED",
        targetType: "Membership",
        targetId: current.id,
        afterValue: { role: current.role, branchId: current.branchId },
      },
    });
    return { ok: true, member: toPublic(updated), changed: true };
  });
}
