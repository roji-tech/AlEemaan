import { Permission, type Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mayAdminister, type AdminScope } from "@/lib/auth/branch-access";

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
  /// School-wide authority (`User.isSuperAdmin`), independent of the role held in this branch.
  isSuperAdmin: boolean;
  /// Holds CAN_APPROVE_RESULTS in this branch (task 0039): may approve the results in their scope. Set only by a superadmin.
  canApproveResults: boolean;
  /// Holds CAN_VIEW_FORM_RESULTS in this branch: reads the results, answers and turn-ins of the branch's forms (never the answer key, never writes). Given by an administrator of the branch.
  canViewFormResults: boolean;
  status: MemberStatus;
  joinedAt: Date;
};

const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  branchId: true,
  permissions: true,
  deactivatedAt: true,
  createdAt: true,
  user: { select: { name: true, email: true, isSuperAdmin: true } },
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
  isSuperAdmin: row.user.isSuperAdmin,
  canApproveResults: row.permissions.includes(Permission.CAN_APPROVE_RESULTS),
  canViewFormResults: row.permissions.includes(Permission.CAN_VIEW_FORM_RESULTS),
  status: row.deactivatedAt ? "deactivated" : "active",
  joinedAt: row.createdAt,
});

/// Prisma's `contains` hands the value to `ILIKE` as it is, so `%` and `_` in what someone typed would act as patterns (a search for
/// "%" listing everyone). Backslash is Postgres' default LIKE escape: escape the three special characters and the search is text.
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/// `scope`: a superadmin sees everyone; a branch administrator only the people of the branches they administer (plan S3).
export async function listMembers(
  filters: MemberFilters,
  page: { skip: number; take: number },
  scope: AdminScope,
): Promise<{ members: PublicMember[]; total: number }> {
  const where: Prisma.MembershipWhereInput = {
    ...(scope.superAdmin ? {} : { branchId: { in: [...scope.branchIds] } }),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.branchId ? { AND: { branchId: filters.branchId } } : {}),
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
  /// The school's last active superadmin cannot lose that authority or their last active membership: it would leave the school with nobody
  /// who can manage it as a whole (ADR 0005, counted by person under a lock).
  | "LAST_SUPERADMIN"
  /// Only a superadmin may make, change, deactivate or reactivate an administrator or a superadmin (plan S3).
  | "ADMIN_ONLY"
  /// The branch it would move to is not one the caller administers.
  | "OUT_OF_SCOPE"
  | "INVALID_BRANCH"
  /// The person already has a membership in the branch it would move to (one membership per person per branch).
  | "BRANCH_TAKEN"
  /// A deactivated member must be reactivated before anything else about them changes.
  | "DEACTIVATED"
  /// Only a superadmin says who may approve results (task 0039, decision 2).
  | "SUPERADMIN_ONLY"
  /// Only teaching and non-teaching staff are given the right to approve results; an administrator already can, and a pupil or a parent never.
  | "NOT_APPROVER_ROLE"
  | "NOT_STAFF_ROLE";

/// `signedOut` (deactivation only): true when this was the person's last active membership, so their sessions were deleted.
export type MemberResult = { ok: true; member: PublicMember; changed: boolean; signedOut?: boolean } | { ok: false; reason: MemberFailure };

const find = (tx: Tx, membershipId: string) => tx.membership.findUnique({ where: { id: membershipId }, select: MEMBER_SELECT });

/// True when ANOTHER PERSON than `exceptUserId` is a superadmin who still has an active membership — and holds a row lock on every
/// superadmin's `User` row for the rest of the transaction. Counted by person, not by row. Two superadmins removing each other at the same
/// instant would each see "the other is still one" without the lock; with it the second waits for the first to commit, then COUNTS AGAIN in
/// a new statement (READ COMMITTED: the new statement sees what the first committed) and finds itself the last.
async function hasAnotherActiveSuperAdmin(tx: Tx, exceptUserId: string): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE "isSuperAdmin" = true FOR UPDATE`;
  const others = await tx.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT m."userId" FROM "Membership" m JOIN "User" u ON u.id = m."userId"
    WHERE u."isSuperAdmin" = true AND m."deactivatedAt" IS NULL AND m."userId" <> ${exceptUserId}`;
  return others.length > 0;
}

/// The refusals every action shares (plan S3). A member outside the caller's branches is "no such member" (404), never "not allowed";
/// within them, only a superadmin may touch an administrator or a superadmin.
function refuse(current: MemberRow, scope: AdminScope): MemberFailure | null {
  if (!mayAdminister(scope, current.branchId)) return "NOT_FOUND";
  if (!scope.superAdmin && (current.role === "ADMIN" || current.user.isSuperAdmin)) return "ADMIN_ONLY";
  return null;
}

export async function changeMember(
  actorUserId: string,
  membershipId: string,
  change: { role?: Role; branchId?: string; canApproveResults?: boolean; canViewFormResults?: boolean },
  scope: AdminScope,
): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    const refused = refuse(current, scope);
    if (refused) return { ok: false, reason: refused };
    if (current.userId === actorUserId) return { ok: false, reason: "SELF" };
    if (current.deactivatedAt) return { ok: false, reason: "DEACTIVATED" };
    if (!scope.superAdmin && change.role === "ADMIN") return { ok: false, reason: "ADMIN_ONLY" }; // only a superadmin makes an administrator
    if (change.canApproveResults !== undefined && !scope.superAdmin) return { ok: false, reason: "SUPERADMIN_ONLY" }; // only a superadmin says who approves results
    const newRole = change.role ?? current.role;
    const mayApprove = newRole === "TEACHING_STAFF" || newRole === "NON_TEACHING_STAFF";
    if (change.canApproveResults === true && !mayApprove) return { ok: false, reason: "NOT_APPROVER_ROLE" };
    if (change.canViewFormResults === true && !mayApprove) return { ok: false, reason: "NOT_STAFF_ROLE" }; // the same two staff roles

    if (change.branchId) {
      const branch = await tx.branch.findUnique({ where: { id: change.branchId }, select: { id: true } });
      if (!branch) return { ok: false, reason: "INVALID_BRANCH" };
      if (!mayAdminister(scope, change.branchId)) return { ok: false, reason: "OUT_OF_SCOPE" };
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
    const holdsNow = current.permissions.includes(Permission.CAN_APPROVE_RESULTS);
    // Where this person approves (task 0039) follows the permission: granting it gives a GENERAL scope (the whole branch) for the superadmin to narrow; taking it away, or
    // a role that cannot hold it, removes every scope. A move to another branch removes them too: a scope names the sections and classes of ONE branch.
    const wantsNow = change.canApproveResults ?? holdsNow;
    const willHold = wantsNow && mayApprove;
    const permissionChanged = willHold !== holdsNow;
    // The form-results grant belongs to ONE staff membership of ONE branch: a role that cannot hold it, or a move to another branch, takes it away unless the same request gives it again.
    const holdsViewNow = current.permissions.includes(Permission.CAN_VIEW_FORM_RESULTS);
    const willHoldView = mayApprove && (change.canViewFormResults ?? (holdsViewNow && !branchChanged));
    const viewChanged = willHoldView !== holdsViewNow;
    if (!roleChanged && !branchChanged && !permissionChanged && !viewChanged)
      return { ok: true, member: toPublic(current), changed: false }; // a no-op writes nothing

    const scopesBefore =
      holdsNow || branchChanged
        ? await tx.resultApprovalScope.findMany({
            where: { branchId: current.branchId, userId: current.userId },
            select: { kind: true, sectionId: true, classGroupId: true },
          })
        : [];
    const clearScopes = scopesBefore.length > 0 && (branchChanged || (permissionChanged && !willHold));
    if (clearScopes) await tx.resultApprovalScope.deleteMany({ where: { branchId: current.branchId, userId: current.userId } });

    // (Changing a role never removes school-wide authority: that is the person's superadmin flag, revoked on its own — `setSuperAdmin`.)

    let updated: MemberRow;
    try {
      updated = await tx.membership.update({
        where: { id: current.id },
        data: {
          ...(roleChanged ? { role: change.role } : {}),
          ...(branchChanged ? { branchId: change.branchId } : {}),
          ...(permissionChanged || viewChanged
            ? {
                permissions: [
                  ...current.permissions.filter((p) => p !== Permission.CAN_APPROVE_RESULTS && p !== Permission.CAN_VIEW_FORM_RESULTS),
                  ...(willHold ? [Permission.CAN_APPROVE_RESULTS] : []),
                  ...(willHoldView ? [Permission.CAN_VIEW_FORM_RESULTS] : []),
                ],
              }
            : {}),
        },
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
    if (permissionChanged) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "MEMBER_PERMISSIONS_CHANGED",
          targetType: "Membership",
          targetId: current.id,
          beforeValue: { canApproveResults: holdsNow },
          afterValue: { canApproveResults: willHold },
        },
      });
      if (willHold) {
        await tx.resultApprovalScope.create({
          data: { branchId: updated.branchId, userId: current.userId, kind: "GENERAL", createdById: actorUserId },
        });
      }
    }
    if (viewChanged) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "MEMBER_PERMISSIONS_CHANGED",
          targetType: "Membership",
          targetId: current.id,
          beforeValue: { canViewFormResults: holdsViewNow },
          afterValue: {
            canViewFormResults: willHoldView,
            ...(!willHoldView && change.canViewFormResults === undefined
              ? { removedWith: branchChanged ? "branch change" : "role change" }
              : {}),
          },
        },
      });
    }
    const grantsGeneral = permissionChanged && willHold;
    if (clearScopes || grantsGeneral) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "RESULT_APPROVAL_SCOPE_CHANGED",
          targetType: "Membership",
          targetId: current.id,
          beforeValue: {
            scopes: scopesBefore.map((row) => ({ kind: row.kind, sectionId: row.sectionId, classGroupId: row.classGroupId })),
          },
          afterValue: grantsGeneral
            ? { scopes: [{ kind: "GENERAL" }], grantedWith: "CAN_APPROVE_RESULTS" }
            : { scopes: [], removedWith: branchChanged ? "branch change" : "CAN_APPROVE_RESULTS" },
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
export async function deactivateMember(actorUserId: string, membershipId: string, scope: AdminScope): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    const refused = refuse(current, scope);
    if (refused) return { ok: false, reason: refused };
    if (current.userId === actorUserId) return { ok: false, reason: "SELF" };
    if (current.deactivatedAt) return { ok: true, member: toPublic(current), changed: false, signedOut: false };
    // A superadmin stops being one when they have no active membership left, so the LAST membership of the LAST superadmin stays. (The lock
    // is taken BEFORE the count, so the count below sees what a racing transaction just committed.)
    if (current.user.isSuperAdmin) {
      const others = await hasAnotherActiveSuperAdmin(tx, current.userId);
      const active = await tx.membership.count({ where: { userId: current.userId, deactivatedAt: null } });
      if (active <= 1 && !others) return { ok: false, reason: "LAST_SUPERADMIN" };
    }

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

export async function reactivateMember(actorUserId: string, membershipId: string, scope: AdminScope): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    const refused = refuse(current, scope);
    if (refused) return { ok: false, reason: refused };
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

/// Grants or revokes a person's SUPERADMIN authority (`User.isSuperAdmin`), addressed through one of their memberships. The caller must
/// already be a superadmin (the route says so with `withAuth({ superAdmin: true })`); the password re-type is the route's job. Nobody
/// changes their own. Revoking takes the same lock as a deactivation and refuses to leave the school without a superadmin.
export async function setSuperAdmin(actorUserId: string, membershipId: string, value: boolean): Promise<MemberResult> {
  return prisma.$transaction(async (tx): Promise<MemberResult> => {
    const current = await find(tx, membershipId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    if (current.userId === actorUserId) return { ok: false, reason: "SELF" };
    if (value && current.deactivatedAt) return { ok: false, reason: "DEACTIVATED" }; // authority needs an active membership to mean anything
    if (current.user.isSuperAdmin === value) return { ok: true, member: toPublic(current), changed: false };

    if (!value && !(await hasAnotherActiveSuperAdmin(tx, current.userId))) return { ok: false, reason: "LAST_SUPERADMIN" };
    await tx.user.update({ where: { id: current.userId }, data: { isSuperAdmin: value } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: value ? "SUPERADMIN_GRANTED" : "SUPERADMIN_REVOKED",
        targetType: "User",
        targetId: current.userId,
        beforeValue: { isSuperAdmin: !value },
        afterValue: { isSuperAdmin: value },
      },
    });
    const updated = await find(tx, membershipId);
    return { ok: true, member: toPublic(updated!), changed: true };
  });
}
