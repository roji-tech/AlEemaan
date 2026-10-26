import { Permission, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cleanSectionName, normaliseScopeSet, scopeKey, type ScopeEntry } from "./section-rules";

// Sections and approver scopes: the superadmin's side of task 0039. What a scope MEANS (which results a person sees and may approve) lives in approver-scope.ts; this file is
// how a branch's approval is set up: create, rename, reorder and archive sections, place class groups in them, and say where each approver approves.
//
// Every write runs in ONE transaction and writes its `AuditLog` row in the SAME transaction (before and after). Nothing is deleted except a person's scope rows, which are
// replaced as a set. The caller (the route) has already checked that this is a superadmin and has verified the fresh proof. Every id is looked up WITH its branch: a section or
// class group of another branch is, to this branch, one that does not exist.

export type ApproverSettingsFailure = "NOT_FOUND" | "INVALID_NAME" | "NAME_TAKEN" | "ARCHIVED" | "NOT_AN_APPROVER" | "GENERAL_WITH_OTHERS";
type What = "branch" | "section" | "class group" | "person";
export type ApproverSettingsResult<T> = ({ ok: true } & T) | { ok: false; reason: ApproverSettingsFailure; what?: What };

const refuse = (reason: ApproverSettingsFailure, what?: What): { ok: false; reason: ApproverSettingsFailure; what?: What } => ({
  ok: false,
  reason,
  ...(what ? { what } : {}),
});

type Tx = Prisma.TransactionClient;

export type ClassGroupView = { id: string; name: string; sectionId: string | null };
export type SectionView = { id: string; name: string; sortOrder: number; archived: boolean; classGroups: ClassGroupView[] };
export type ScopeView = {
  kind: "GENERAL" | "SECTION" | "CLASS";
  sectionId: string | null;
  sectionName: string | null;
  classGroupId: string | null;
  classGroupName: string | null;
};
export type ApproverView = { userId: string; name: string | null; email: string | null; role: Role; scopes: ScopeView[] };

const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

const audit = (
  tx: Tx,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  beforeValue: Prisma.InputJsonValue | undefined,
  afterValue: Prisma.InputJsonValue | undefined,
) =>
  tx.auditLog.create({
    data: {
      actorUserId,
      action,
      targetType,
      targetId,
      ...(beforeValue !== undefined ? { beforeValue } : {}),
      ...(afterValue !== undefined ? { afterValue } : {}),
    },
  });

/// The database holds one LIVE section name per branch, compared without regard to case (a partial unique index). A violation of it is "that name is taken", whatever won the race.
const isNameTaken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// --- Reading ------------------------------------------------------------------------------------------------------------------------------------------------

/// Every section of the branch (live ones first, archived last), the live class groups in each, and the live class groups that are in none.
export async function listSections(branchId: string): Promise<{ sections: SectionView[]; unplacedClassGroups: ClassGroupView[] }> {
  const [sections, unplaced] = await Promise.all([
    prisma.section.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      include: {
        classGroups: { where: { branchId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sectionId: true } },
      },
    }),
    prisma.classGroup.findMany({
      where: { branchId, sectionId: null, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sectionId: true },
    }),
  ]);
  const views: SectionView[] = sections.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
    classGroups: row.classGroups,
  }));
  views.sort((a, b) => Number(a.archived) - Number(b.archived)); // stable: each group keeps the superadmin's order
  return { sections: views, unplacedClassGroups: unplaced };
}

/// Every active staff member of the branch who holds CAN_APPROVE_RESULTS, with where they approve. A person with the permission and no scope is listed with an empty list:
/// they approve nothing (fail closed), and the screen can say so.
export async function listApprovers(branchId: string): Promise<{ approvers: ApproverView[] }> {
  const members = await prisma.membership.findMany({
    where: { branchId, deactivatedAt: null, role: { in: [...STAFF_ROLES] }, permissions: { has: Permission.CAN_APPROVE_RESULTS } },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }, { userId: "asc" }],
  });
  const rows = await prisma.resultApprovalScope.findMany({
    where: { branchId, userId: { in: members.map((member) => member.userId) } },
    include: { section: { select: { name: true } }, classGroup: { select: { name: true } } },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const byUser = new Map<string, ScopeView[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({
      kind: row.kind,
      sectionId: row.sectionId,
      sectionName: row.section?.name ?? null,
      classGroupId: row.classGroupId,
      classGroupName: row.classGroup?.name ?? null,
    });
    byUser.set(row.userId, list);
  }
  return {
    approvers: members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      scopes: byUser.get(member.userId) ?? [],
    })),
  };
}

// --- Sections -----------------------------------------------------------------------------------------------------------------------------------------------

export async function createSection(
  actorUserId: string,
  input: { branchId: string; name: unknown; sortOrder?: number },
): Promise<ApproverSettingsResult<{ section: { id: string; name: string; sortOrder: number } }>> {
  const name = cleanSectionName(input.name);
  if (!name) return refuse("INVALID_NAME");
  const sortOrder = input.sortOrder ?? 0;
  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true } }))) return refuse("NOT_FOUND", "branch");
      const created = await tx.section.create({ data: { branchId: input.branchId, name, sortOrder }, select: { id: true, name: true, sortOrder: true } });
      await audit(tx, actorUserId, "SECTION_CREATED", "Section", created.id, undefined, { branchId: input.branchId, name, sortOrder });
      return { ok: true as const, section: created };
    });
  } catch (error) {
    if (isNameTaken(error)) return refuse("NAME_TAKEN");
    throw error;
  }
}

/// Rename, reorder, archive or restore. An archived section can only be restored (its name and order stay as they were): archiving ends what the section granted, and the
/// scopes that name it stay on record but cover nothing until it is restored. Restoring into a name another live section now holds is "name taken".
export async function updateSection(
  actorUserId: string,
  id: string,
  patch: { name?: unknown; sortOrder?: number; archived?: boolean },
): Promise<ApproverSettingsResult<{ changed: boolean; section: { id: string; name: string; sortOrder: number; archived: boolean } }>> {
  const newName = patch.name === undefined ? undefined : cleanSectionName(patch.name);
  if (newName === null) return refuse("INVALID_NAME");
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.section.findUnique({ where: { id } });
      if (!current) return refuse("NOT_FOUND", "section");
      const archivedNow = current.archivedAt !== null;
      if (archivedNow && patch.archived !== false) return refuse("ARCHIVED", "section");

      const data: Prisma.SectionUpdateInput = {};
      const trail: Array<[string, Prisma.InputJsonValue, Prisma.InputJsonValue]> = [];
      if (newName !== undefined && newName !== current.name) {
        data.name = newName;
        trail.push(["SECTION_RENAMED", { name: current.name }, { name: newName }]);
      }
      if (patch.sortOrder !== undefined && patch.sortOrder !== current.sortOrder) {
        data.sortOrder = patch.sortOrder;
        trail.push(["SECTION_REORDERED", { sortOrder: current.sortOrder }, { sortOrder: patch.sortOrder }]);
      }
      if (patch.archived === true && !archivedNow) {
        data.archivedAt = new Date();
        trail.push(["SECTION_ARCHIVED", { archived: false }, { archived: true }]);
      } else if (patch.archived === false && archivedNow) {
        data.archivedAt = null;
        trail.push(["SECTION_RESTORED", { archived: true }, { archived: false }]);
      }
      if (trail.length === 0) {
        return { ok: true as const, changed: false, section: { id, name: current.name, sortOrder: current.sortOrder, archived: archivedNow } };
      }
      const updated = await tx.section.update({ where: { id }, data });
      for (const [action, before, after] of trail) await audit(tx, actorUserId, action, "Section", id, before, after);
      return { ok: true as const, changed: true, section: { id, name: updated.name, sortOrder: updated.sortOrder, archived: updated.archivedAt !== null } };
    });
  } catch (error) {
    if (isNameTaken(error)) return refuse("NAME_TAKEN");
    throw error;
  }
}

/// Puts a class group in a live section of the same branch, or takes it out (`sectionId` null). A class group is in at most one section, so placing it again moves it.
export async function placeClassGroup(
  actorUserId: string,
  classGroupId: string,
  sectionId: string | null,
): Promise<ApproverSettingsResult<{ changed: boolean; classGroup: ClassGroupView }>> {
  return prisma.$transaction(async (tx) => {
    const group = await tx.classGroup.findUnique({ where: { id: classGroupId }, select: { id: true, name: true, branchId: true, sectionId: true, archivedAt: true } });
    if (!group) return refuse("NOT_FOUND", "class group");
    if (group.archivedAt) return refuse("ARCHIVED", "class group");
    if (sectionId !== null) {
      // a section of ANOTHER branch is, to this class group, a section that does not exist (the composite key would refuse it too)
      const section = await tx.section.findFirst({ where: { id: sectionId, branchId: group.branchId }, select: { archivedAt: true } });
      if (!section) return refuse("NOT_FOUND", "section");
      if (section.archivedAt) return refuse("ARCHIVED", "section");
    }
    const view = (now: string | null): ClassGroupView => ({ id: group.id, name: group.name, sectionId: now });
    if (group.sectionId === sectionId) return { ok: true as const, changed: false, classGroup: view(sectionId) };
    await tx.classGroup.update({ where: { id: classGroupId }, data: { sectionId } });
    await audit(tx, actorUserId, "CLASS_GROUP_SECTION_CHANGED", "ClassGroup", classGroupId, { sectionId: group.sectionId }, { sectionId });
    return { ok: true as const, changed: true, classGroup: view(sectionId) };
  });
}

// --- Approver scopes ----------------------------------------------------------------------------------------------------------------------------------------

const scopeJson = (entries: readonly ScopeEntry[]): Prisma.InputJsonValue =>
  entries.map((entry) =>
    entry.kind === "GENERAL"
      ? { kind: "GENERAL" }
      : entry.kind === "SECTION"
        ? { kind: "SECTION", sectionId: entry.sectionId }
        : { kind: "CLASS", classGroupId: entry.classGroupId },
  );

/// Replaces where `targetUserId` approves results in `branchId` with exactly `entries`. The person must be an active staff member of that branch who holds CAN_APPROVE_RESULTS
/// (the permission says WHETHER, the scope says WHERE). Every section and class group named must be this branch's and live. An empty set is allowed and means "approves
/// nothing". A set that is the person's present set changes nothing and writes no audit row.
export async function setApproverScopes(
  actorUserId: string,
  branchId: string,
  targetUserId: string,
  entries: readonly ScopeEntry[],
): Promise<ApproverSettingsResult<{ changed: boolean; scopes: ScopeEntry[] }>> {
  const set = normaliseScopeSet(entries);
  if (!set.ok) return refuse(set.problem);
  const wanted = set.scopes;
  return prisma.$transaction(async (tx) => {
    const member = await tx.membership.findUnique({
      where: { userId_branchId: { userId: targetUserId, branchId } },
      select: { role: true, permissions: true, deactivatedAt: true },
    });
    if (!member || member.deactivatedAt || !STAFF_ROLES.includes(member.role)) return refuse("NOT_FOUND", "person");
    if (!member.permissions.includes(Permission.CAN_APPROVE_RESULTS)) return refuse("NOT_AN_APPROVER");

    const sectionIds = wanted.flatMap((entry) => (entry.kind === "SECTION" ? [entry.sectionId] : []));
    const classGroupIds = wanted.flatMap((entry) => (entry.kind === "CLASS" ? [entry.classGroupId] : []));
    if (sectionIds.length > 0) {
      const sections = await tx.section.findMany({ where: { branchId, id: { in: sectionIds } }, select: { archivedAt: true } });
      if (sections.length !== sectionIds.length) return refuse("NOT_FOUND", "section");
      if (sections.some((section) => section.archivedAt)) return refuse("ARCHIVED", "section");
    }
    if (classGroupIds.length > 0) {
      const groups = await tx.classGroup.findMany({ where: { branchId, id: { in: classGroupIds } }, select: { archivedAt: true } });
      if (groups.length !== classGroupIds.length) return refuse("NOT_FOUND", "class group");
      if (groups.some((group) => group.archivedAt)) return refuse("ARCHIVED", "class group");
    }

    const present = await tx.resultApprovalScope.findMany({ where: { branchId, userId: targetUserId }, select: { kind: true, sectionId: true, classGroupId: true } });
    const presentEntries: ScopeEntry[] = present.map((row) =>
      row.kind === "GENERAL"
        ? { kind: "GENERAL" }
        : row.kind === "SECTION"
          ? { kind: "SECTION", sectionId: row.sectionId as string }
          : { kind: "CLASS", classGroupId: row.classGroupId as string },
    );
    const presentSet = normaliseScopeSet(presentEntries);
    const before = presentSet.ok ? presentSet.scopes : presentEntries;
    if (before.length === wanted.length && before.every((entry, index) => scopeKey(entry) === scopeKey(wanted[index]))) {
      return { ok: true as const, changed: false, scopes: wanted };
    }

    await tx.resultApprovalScope.deleteMany({ where: { branchId, userId: targetUserId } });
    if (wanted.length > 0) {
      await tx.resultApprovalScope.createMany({
        data: wanted.map((entry) => ({
          branchId,
          userId: targetUserId,
          kind: entry.kind,
          sectionId: entry.kind === "SECTION" ? entry.sectionId : null,
          classGroupId: entry.kind === "CLASS" ? entry.classGroupId : null,
          createdById: actorUserId,
        })),
      });
    }
    await audit(tx, actorUserId, "RESULT_APPROVAL_SCOPE_CHANGED", "User", targetUserId, { branchId, scopes: scopeJson(before) }, { branchId, scopes: scopeJson(wanted) });
    return { ok: true as const, changed: true, scopes: wanted };
  });
}
