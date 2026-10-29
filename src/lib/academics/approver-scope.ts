import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUnsectionedClassApproval } from "./unsectioned-approval";

// Where one member approves results in one branch (task 0039; the design Octalve Edu built as its ADR 0018). The transitions that need approval authority (return, approve,
// revert, publish, lock), the review queue, a result's history and the sheet read by the review screen all ask the functions here, so what a person sees and what they
// may do cannot drift apart. An administrator of the branch is not asked: they are held to no scope.
//
// An approver is an ACTIVE member of the branch with a staff role who holds CAN_APPROVE_RESULTS. Their scope is only ever read from `ResultApprovalScope`: no row, no results
// (fail closed). The permission is checked again on every call, so taking it away ends the authority even while rows remain.
//
// The branch setting `results.unsectionedClassApproval` (slice 2a) decides one more thing: under ANY_SECTION_APPROVER a person who holds a live Section scope also reaches the
// classes of the branch that are in no section. Under the default it adds nothing.

/// `approver`: holds the permission as an active staff member of the branch. `general`: every class of the branch. Otherwise the arms of the sections and classes assigned.
export type ApproverScope = { approver: boolean; general: boolean; armIds: ReadonlySet<string> };

/// Not an approver at all: the permission is missing, the membership is deactivated or not a staff one.
export const NOT_AN_APPROVER: ApproverScope = { approver: false, general: false, armIds: new Set() };

const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

/// The scope of `userId` in `branchId`. A GENERAL row wins; otherwise the arms of every class in an assigned LIVE section, plus every arm of an assigned class. An archived
/// section covers nothing: archiving a section ends what it granted.
export async function approverScope(branchId: string, userId: string): Promise<ApproverScope> {
  const membership = await prisma.membership.findUnique({
    where: { userId_branchId: { userId, branchId } },
    select: { role: true, permissions: true, deactivatedAt: true },
  });
  if (!membership || membership.deactivatedAt || !STAFF_ROLES.includes(membership.role)) return NOT_AN_APPROVER;
  if (!membership.permissions.includes(Permission.CAN_APPROVE_RESULTS)) return NOT_AN_APPROVER;

  const rows = await prisma.resultApprovalScope.findMany({
    where: { branchId, userId },
    select: { kind: true, sectionId: true, classGroupId: true },
  });
  if (rows.some((row) => row.kind === "GENERAL")) return { approver: true, general: true, armIds: new Set() };

  const sectionIds = rows.flatMap((row) => (row.kind === "SECTION" && row.sectionId ? [row.sectionId] : []));
  const classGroupIds = rows.flatMap((row) => (row.kind === "CLASS" && row.classGroupId ? [row.classGroupId] : []));
  if (sectionIds.length === 0 && classGroupIds.length === 0) return { approver: true, general: false, armIds: new Set() };

  const arms = await prisma.classArm.findMany({
    where: {
      branchId,
      classGroup: {
        OR: [
          ...(sectionIds.length > 0 ? [{ sectionId: { in: sectionIds }, section: { is: { archivedAt: null } } }] : []),
          ...(classGroupIds.length > 0 ? [{ id: { in: classGroupIds } }] : []),
          ...((await reachesUnsectioned(branchId, sectionIds)) ? [{ sectionId: null }] : []),
        ],
      },
    },
    select: { id: true },
  });
  return { approver: true, general: false, armIds: new Set(arms.map((arm) => arm.id)) };
}

/// Whether a person with these Section scopes also reaches the classes that are in no section: the branch allows it, and at least one of the sections is live (an archived
/// section grants nothing, so it widens nothing either).
async function reachesUnsectioned(branchId: string, sectionIds: readonly string[]): Promise<boolean> {
  if (sectionIds.length === 0) return false;
  if ((await getUnsectionedClassApproval(branchId)) !== "ANY_SECTION_APPROVER") return false;
  return (await prisma.section.count({ where: { branchId, id: { in: [...sectionIds] }, archivedAt: null } })) > 0;
}

/// Whether the scope reaches a result of this arm (the arm a result was entered in is stored on it, so a later move of the pupil does not change who reviews it).
export const covers = (scope: ApproverScope, classArmId: string): boolean =>
  scope.approver && (scope.general || scope.armIds.has(classArmId));

/// True when the scope reaches anything at all: an approver with nowhere to approve has nothing to act on.
export const hasAnyScope = (scope: ApproverScope): boolean => scope.approver && (scope.general || scope.armIds.size > 0);

/// The branches where `userId` is an approver (holds the permission as an active staff member), whether or not they have been given anywhere to approve yet. The results
/// page offers the Review tab to such a person; the APIs behind it decide what they see.
export async function approverBranchIds(userId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null, role: { in: [...STAFF_ROLES] }, permissions: { has: Permission.CAN_APPROVE_RESULTS } },
    select: { branchId: true },
  });
  return rows.map((row) => row.branchId);
}
