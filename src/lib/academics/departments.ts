import { Prisma, StandingState } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAdminister, resolveBranchRole } from "@/lib/auth/branch-access";
import { ConflictError } from "@/lib/academics/structure";
import {
  DEPARTMENTS_OFF,
  DEPARTMENT_ARCHIVED,
  DEPARTMENT_TAKEN,
  HEAD_CHANGED,
  departmentDescription,
  departmentName,
  descriptionOrNull,
  headChange,
  mayDoToDepartment,
} from "@/lib/academics/department-rules";
import { usesDepartments } from "@/lib/academics/departments-setting";
import { LIVE_STAFF } from "@/lib/drafts/live";

// Departments and their heads (task 0101 D7): the database side. Every function takes the department (or the branch) and the caller's authority has ALREADY been checked by `withBranch` in the
// route (ADR 0015); what a HEAD of department may do beyond that is decided by `canManageDepartment`, once, here. Nothing is deleted: a department is archived. While the branch's switch
// (`academics.useDepartments`) is off every write is refused with a 409.

export const departmentInput = z.strictObject({
  branchId: z.string().min(1),
  name: departmentName,
  description: departmentDescription.nullable().optional(),
});
export const departmentPatch = z
  .strictObject({
    name: departmentName.optional(),
    description: departmentDescription.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const membersInput = z.strictObject({ staffIds: z.array(z.string().min(1)).min(1, "Choose at least one person.").max(200) });
export const subjectsInput = z.strictObject({ subjectIds: z.array(z.string().min(1)).min(1, "Choose at least one subject.").max(100) });
/// `replacing`: the head the caller was looking at (null: none). If it is no longer the head, nothing is changed (409): the caller confirms a replacement they have seen.
export const headInput = z.strictObject({ staffRecordId: z.string().min(1).nullable(), replacing: z.string().min(1).nullable() });

/// The branch of a department, or null for an unknown id: what `withBranch({ of })` looks up for a department route.
export const departmentBranchId = async (id: string) =>
  (await prisma.department.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;

type Tx = Prisma.TransactionClient;
const duplicate = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(message);
  throw error;
};

type AuditRow = { action: string; targetId: string; afterValue: Prisma.InputJsonValue; beforeValue?: Prisma.InputJsonValue };
async function auditRows(tx: Tx, actorUserId: string, rows: AuditRow[]) {
  if (rows.length === 0) return;
  await tx.auditLog.createMany({
    data: rows.map((r) => ({
      actorUserId,
      action: r.action,
      targetType: "Department",
      targetId: r.targetId,
      afterValue: r.afterValue,
      ...(r.beforeValue ? { beforeValue: r.beforeValue } : {}),
    })),
  });
}

const personText = (p: { title: string | null; firstName: string; lastName: string }) =>
  [p.title, p.firstName, p.lastName].filter(Boolean).join(" ");

/// A live department of an enabled branch, or the refusal: null for an unknown id (a 404), a ConflictError for a branch that does not use departments or a department that is archived.
async function writable(id: string, opts: { allowArchived?: boolean } = {}) {
  const department = await prisma.department.findUnique({ where: { id } });
  if (!department) return null;
  if (!(await usesDepartments(department.branchId))) throw new ConflictError(DEPARTMENTS_OFF);
  if (department.archivedAt && !opts.allowArchived) throw new ConflictError(DEPARTMENT_ARCHIVED);
  return department;
}

// ---- who is a head ----

/// Is this person the head of THIS department? Through a live record of the branch (not archived, active standing) that is linked to their account.
export async function isHeadOf(userId: string, departmentId: string): Promise<boolean> {
  const row = await prisma.departmentMember.findFirst({
    where: {
      departmentId,
      isHead: true,
      staffRecord: { userId, archivedAt: null, standing: StandingState.ACTIVE },
    },
    select: { id: true },
  });
  return row !== null;
}

/// May this caller change the MEMBERS and the SUBJECTS of this department: an administrator of its branch or a superadmin, or its head (a staff member of the branch who is the head of THIS
/// department, and of no other). Everything else about a department is for administrators only (`mayDoToDepartment`).
export async function canManageDepartment(auth: { userId: string }, departmentId: string): Promise<boolean> {
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { branchId: true } });
  if (!department) return false;
  const [administers, role] = await Promise.all([
    canAdminister(auth.userId, department.branchId),
    resolveBranchRole(auth.userId, department.branchId),
  ]);
  const headOfThis = administers ? false : await isHeadOf(auth.userId, departmentId);
  return mayDoToDepartment({ administers, staff: role !== null, headOfThis }, "members");
}

// ---- reading ----

const MEMBER_SELECT = {
  isHead: true,
  staffRecord: {
    select: { id: true, title: true, firstName: true, lastName: true, category: true, archivedAt: true, standing: true, userId: true },
  },
} satisfies Prisma.DepartmentMemberSelect;

/// The branch's departments with their head, members and subjects, for a caller whose authority is `viewer`: `canManage` says whether THEY may change the members and the subjects
/// (an administrator, or the head). `viewer.administers` comes from the route's `withBranch`. At most a few dozen departments of a few dozen people: one query with its relations.
export async function listDepartments(
  branchId: string,
  opts: { includeArchived?: boolean; viewer: { userId: string; administers: boolean } },
) {
  const rows = await prisma.department.findMany({
    where: { branchId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: {
      members: { select: MEMBER_SELECT },
      subjects: { where: { archivedAt: null }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, code: true } },
    },
  });
  return rows.map((row) => {
    const members = row.members
      .map((m) => ({
        staffRecordId: m.staffRecord.id,
        name: personText(m.staffRecord),
        isHead: m.isHead,
        category: m.staffRecord.category,
        archived: m.staffRecord.archivedAt !== null,
        live: m.staffRecord.archivedAt === null && m.staffRecord.standing === StandingState.ACTIVE,
        userId: m.staffRecord.userId,
      }))
      .sort(
        (a, b) => Number(b.isHead) - Number(a.isHead) || a.name.localeCompare(b.name) || a.staffRecordId.localeCompare(b.staffRecordId),
      );
    const head = members.find((m) => m.isHead) ?? null;
    const viewerIsHead = head !== null && head.live && head.userId === opts.viewer.userId;
    return {
      id: row.id,
      branchId: row.branchId,
      name: row.name,
      description: row.description,
      archived: row.archivedAt !== null,
      head: head ? { staffRecordId: head.staffRecordId, name: head.name } : null,
      members: members.map(({ staffRecordId, name, isHead, category, archived }) => ({ staffRecordId, name, isHead, category, archived })),
      subjects: row.subjects,
      /// May the caller change the members and the subjects of this department.
      canManage: opts.viewer.administers || viewerIsHead,
    };
  });
}
export type DepartmentView = Awaited<ReturnType<typeof listDepartments>>[number];

// ---- the department ----

export async function createDepartment(actorUserId: string, input: z.infer<typeof departmentInput>) {
  if (!(await usesDepartments(input.branchId))) throw new ConflictError(DEPARTMENTS_OFF);
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.department.create({
        data: { branchId: input.branchId, name: input.name, description: descriptionOrNull(input.description) },
      });
      await auditRows(tx, actorUserId, [
        { action: "DEPARTMENT_CREATED", targetId: created.id, afterValue: { name: created.name, branchId: created.branchId } },
      ]);
      return created;
    });
  } catch (error) {
    return duplicate(error, DEPARTMENT_TAKEN);
  }
}

export async function updateDepartment(actorUserId: string, id: string, patch: z.infer<typeof departmentPatch>) {
  // Archiving or restoring is the one change an archived department takes (repeating either is safe).
  const before = await writable(id, { allowArchived: patch.archived !== undefined });
  if (!before) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.department.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: descriptionOrNull(patch.description) } : {}),
          ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
        },
      });
      await auditRows(tx, actorUserId, [
        {
          action: patch.archived === true ? "DEPARTMENT_ARCHIVED" : patch.archived === false ? "DEPARTMENT_RESTORED" : "DEPARTMENT_UPDATED",
          targetId: id,
          afterValue: { name: updated.name, description: updated.description, archived: updated.archivedAt !== null },
          beforeValue: { name: before.name, description: before.description, archived: before.archivedAt !== null },
        },
      ]);
      return updated;
    });
  } catch (error) {
    return duplicate(error, DEPARTMENT_TAKEN);
  }
}

// ---- members and the head ----

/// Adds people to a department. Only live staff records of the SAME branch; anyone else makes the whole request a 409 and nothing is added. People already in it are skipped.
export async function addMembers(actorUserId: string, departmentId: string, staffIds: string[]) {
  const department = await writable(departmentId);
  if (!department) return null;
  const ids = [...new Set(staffIds)];
  const people = await prisma.staffRecord.findMany({
    // Not archived and not a draft (task 0101 D1: a draft is left out of everything that acts on staff, a department included until it is completed).
    where: { id: { in: ids }, branchId: department.branchId, ...LIVE_STAFF },
    select: { id: true, title: true, firstName: true, lastName: true },
  });
  if (people.length !== ids.length)
    throw new ConflictError("Only live members of staff of this branch can be added (not drafts: complete them first).");
  return prisma.$transaction(async (tx) => {
    const already = new Set(
      (await tx.departmentMember.findMany({ where: { departmentId, staffRecordId: { in: ids } }, select: { staffRecordId: true } })).map(
        (m) => m.staffRecordId,
      ),
    );
    const fresh = people.filter((p) => !already.has(p.id));
    await tx.departmentMember.createMany({
      data: fresh.map((p) => ({ branchId: department.branchId, departmentId, staffRecordId: p.id })),
      skipDuplicates: true,
    });
    await auditRows(
      tx,
      actorUserId,
      fresh.map((p) => ({
        action: "DEPARTMENT_MEMBER_ADDED",
        targetId: departmentId,
        afterValue: { staffRecordId: p.id, name: personText(p), department: department.name },
      })),
    );
    return { added: fresh.length, skipped: people.length - fresh.length };
  });
}

/// Removes one person from a department; null when they are not in it. If they were the head, the department has no head now.
export async function removeMember(actorUserId: string, departmentId: string, staffRecordId: string) {
  const department = await writable(departmentId);
  if (!department) return null;
  return prisma.$transaction(async (tx) => {
    const member = await tx.departmentMember.findUnique({
      where: { departmentId_staffRecordId: { departmentId, staffRecordId } },
      select: { id: true, isHead: true, staffRecord: { select: { title: true, firstName: true, lastName: true } } },
    });
    if (!member) return null;
    await tx.departmentMember.delete({ where: { id: member.id } });
    await auditRows(tx, actorUserId, [
      {
        action: "DEPARTMENT_MEMBER_REMOVED",
        targetId: departmentId,
        afterValue: { staffRecordId, name: personText(member.staffRecord), department: department.name, wasHead: member.isHead },
      },
    ]);
    return { wasHead: member.isHead };
  });
}

/// Chooses the head (or none). One head: the old one stays a member, the new one becomes the head, and a member too if they were not; all in one transaction. The caller names the head they
/// were looking at (`replacing`); a different one is a 409 and nothing changes.
export async function setHead(actorUserId: string, departmentId: string, staffRecordId: string | null, replacing: string | null) {
  const department = await writable(departmentId);
  if (!department) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      const members = await tx.departmentMember.findMany({ where: { departmentId }, select: { staffRecordId: true, isHead: true } });
      const plan = headChange(members, staffRecordId);
      if (plan.oldHeadId !== replacing) throw new ConflictError(HEAD_CHANGED);
      const named = async (id: string | null) =>
        id === null
          ? null
          : await tx.staffRecord
              .findUnique({ where: { id }, select: { title: true, firstName: true, lastName: true } })
              .then((p) => (p ? personText(p) : null));
      if (!plan.changed) return { changed: false, head: await named(plan.newHeadId), previous: await named(plan.oldHeadId) };
      if (plan.newHeadId !== null) {
        const person = await tx.staffRecord.findFirst({
          where: { id: plan.newHeadId, branchId: department.branchId, archivedAt: null },
          select: { id: true },
        });
        if (!person) throw new ConflictError("Only a live member of staff of this branch can be the head.");
      }
      // The old head first, so the one-head index is never asked to hold two.
      if (plan.oldHeadId !== null) await tx.departmentMember.updateMany({ where: { departmentId, isHead: true }, data: { isHead: false } });
      if (plan.newHeadId !== null) {
        if (plan.addsMember) {
          await tx.departmentMember.create({
            data: { branchId: department.branchId, departmentId, staffRecordId: plan.newHeadId, isHead: true },
          });
        } else {
          await tx.departmentMember.update({
            where: { departmentId_staffRecordId: { departmentId, staffRecordId: plan.newHeadId } },
            data: { isHead: true },
          });
        }
      }
      const [head, previous] = [await named(plan.newHeadId), await named(plan.oldHeadId)];
      await auditRows(tx, actorUserId, [
        {
          action: "DEPARTMENT_HEAD_SET",
          targetId: departmentId,
          afterValue: { staffRecordId: plan.newHeadId, name: head, department: department.name, addedAsMember: plan.addsMember },
          beforeValue: { staffRecordId: plan.oldHeadId, name: previous },
        },
      ]);
      return { changed: true, head, previous };
    });
  } catch (error) {
    // Two people choosing a head at the same moment: the index lets one through.
    return duplicate(error, HEAD_CHANGED);
  }
}

// ---- subjects ----

/// Puts subjects in a department. Only live subjects of the SAME branch (anything else is a 409 and nothing changes). A subject is in at most one department, so one that is in another is
/// MOVED here (counted, and the audit row names where it came from).
export async function addSubjects(actorUserId: string, departmentId: string, subjectIds: string[]) {
  const department = await writable(departmentId);
  if (!department) return null;
  const ids = [...new Set(subjectIds)];
  const subjects = await prisma.subject.findMany({
    where: { id: { in: ids }, branchId: department.branchId, archivedAt: null },
    select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
  });
  if (subjects.length !== ids.length) throw new ConflictError("Only live subjects of this branch can be added.");
  const fresh = subjects.filter((s) => s.departmentId !== departmentId);
  return prisma.$transaction(async (tx) => {
    if (fresh.length > 0) await tx.subject.updateMany({ where: { id: { in: fresh.map((s) => s.id) } }, data: { departmentId } });
    await auditRows(
      tx,
      actorUserId,
      fresh.map((s) => ({
        action: "DEPARTMENT_SUBJECT_ADDED",
        targetId: departmentId,
        afterValue: { subjectId: s.id, name: s.name, department: department.name, from: s.department?.name ?? null },
      })),
    );
    return { added: fresh.length, moved: fresh.filter((s) => s.departmentId !== null).length, skipped: subjects.length - fresh.length };
  });
}

/// Takes one subject out of a department; null when it is not in it.
export async function removeSubject(actorUserId: string, departmentId: string, subjectId: string) {
  const department = await writable(departmentId);
  if (!department) return null;
  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.findFirst({ where: { id: subjectId, departmentId }, select: { id: true, name: true } });
    if (!subject) return null;
    await tx.subject.update({ where: { id: subject.id }, data: { departmentId: null } });
    await auditRows(tx, actorUserId, [
      {
        action: "DEPARTMENT_SUBJECT_REMOVED",
        targetId: departmentId,
        afterValue: { subjectId: subject.id, name: subject.name, department: department.name },
      },
    ]);
    return { name: subject.name };
  });
}
