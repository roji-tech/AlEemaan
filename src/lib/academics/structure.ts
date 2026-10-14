import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/academics/sessions";

// Academic structure (Slice P1a): the classes, arms, subjects and "this class studies this subject" of ONE branch. Every function here takes the branch (or an
// entity that has one) and the caller's authority has ALREADY been checked by `withBranch` in the route (ADR 0015) - this module never decides who may act.
// Nothing is deleted: a class, arm or subject is archived, which frees its name.

export class ConflictError extends DomainError {}
/// The caller is signed in and in the branch but not allowed to do THIS (a 403), as opposed to a rule of the data (409 / 400).
export class ForbiddenError extends DomainError {}

const name = z.string().trim().min(1, "Give a name.").max(60, "Use at most 60 characters.");
export const classGroupInput = z.strictObject({
  branchId: z.string().min(1),
  name,
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const classGroupPatch = z
  .strictObject({ name: name.optional(), sortOrder: z.number().int().min(0).max(999).optional(), archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const armInput = z.strictObject({
  classGroupId: z.string().min(1),
  name,
  capacity: z.number().int().min(1).max(500).nullable().optional(),
});
export const armPatch = z
  .strictObject({
    name: name.optional(),
    capacity: z.number().int().min(1).max(500).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
const code = z
  .string()
  .trim()
  .max(12, "Use at most 12 characters.")
  .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only.")
  .transform((v) => v.toUpperCase());
export const subjectInput = z.strictObject({ branchId: z.string().min(1), name, code: code.nullable().optional() });
export const subjectPatch = z
  .strictObject({ name: name.optional(), code: code.nullable().optional(), archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const offeringsInput = z.strictObject({ subjectIds: z.array(z.string().min(1)).max(100) });

/// The branch of an entity, or null for an unknown id: what `withBranch({ of })` looks up for an entity route.
export const classGroupBranchId = async (id: string) =>
  (await prisma.classGroup.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;
export const armBranchId = async (id: string) =>
  (await prisma.classArm.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;
export const subjectBranchId = async (id: string) =>
  (await prisma.subject.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;

const duplicate = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(message);
  throw error;
};

export async function audit(
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  afterValue: Prisma.InputJsonValue,
  beforeValue?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: { actorUserId, action, targetType, targetId, afterValue, ...(beforeValue ? { beforeValue } : {}) },
  });
}

// ---- classes and arms ----
export async function listClassGroups(branchId: string, includeArchived = false) {
  const rows = await prisma.classGroup.findMany({
    where: { branchId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      arms: {
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: { name: "asc" },
        include: { _count: { select: { enrollments: true } } },
      },
      offerings: { select: { subjectId: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    branchId: g.branchId,
    name: g.name,
    sortOrder: g.sortOrder,
    archivedAt: g.archivedAt,
    subjectIds: g.offerings.map((o) => o.subjectId),
    arms: g.arms.map((a) => ({ id: a.id, name: a.name, capacity: a.capacity, archivedAt: a.archivedAt, enrolments: a._count.enrollments })),
  }));
}

/// Enrolments of this branch that carry a class name but match no arm (the "unmatched" count the Classes page shows until the strings are retired).
export async function countUnmatchedEnrolments(branchId: string): Promise<number> {
  return prisma.studentEnrollment.count({ where: { branchId, classArmId: null, NOT: { className: "" } } });
}

export async function createClassGroup(actorUserId: string, input: z.infer<typeof classGroupInput>) {
  try {
    const created = await prisma.classGroup.create({
      data: { branchId: input.branchId, name: input.name, sortOrder: input.sortOrder ?? 0 },
    });
    await audit(actorUserId, "CLASS_GROUP_CREATED", "ClassGroup", created.id, { name: created.name, branchId: created.branchId });
    return created;
  } catch (error) {
    return duplicate(error, "This branch already has a class with that name.");
  }
}

export async function updateClassGroup(actorUserId: string, id: string, patch: z.infer<typeof classGroupPatch>) {
  const before = await prisma.classGroup.findUnique({ where: { id } });
  if (!before) return null;
  try {
    const updated = await prisma.classGroup.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
      },
    });
    await audit(
      actorUserId,
      patch.archived === true ? "CLASS_GROUP_ARCHIVED" : patch.archived === false ? "CLASS_GROUP_RESTORED" : "CLASS_GROUP_UPDATED",
      "ClassGroup",
      id,
      { name: updated.name, sortOrder: updated.sortOrder, archived: updated.archivedAt !== null },
      { name: before.name, sortOrder: before.sortOrder, archived: before.archivedAt !== null },
    );
    return updated;
  } catch (error) {
    return duplicate(error, "This branch already has a class with that name.");
  }
}

export async function createArm(actorUserId: string, input: z.infer<typeof armInput>) {
  const group = await prisma.classGroup.findUnique({ where: { id: input.classGroupId } });
  if (!group) return null;
  if (group.archivedAt) throw new ConflictError("That class is archived. Restore it before adding an arm.");
  try {
    const created = await prisma.classArm.create({
      data: { branchId: group.branchId, classGroupId: group.id, name: input.name, capacity: input.capacity ?? null },
    });
    await audit(actorUserId, "CLASS_ARM_CREATED", "ClassArm", created.id, {
      name: created.name,
      classGroupId: group.id,
      branchId: group.branchId,
    });
    return created;
  } catch (error) {
    return duplicate(error, "This class already has an arm with that name.");
  }
}

export async function updateArm(actorUserId: string, id: string, patch: z.infer<typeof armPatch>) {
  const before = await prisma.classArm.findUnique({ where: { id } });
  if (!before) return null;
  try {
    const updated = await prisma.classArm.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
      },
    });
    await audit(
      actorUserId,
      patch.archived === true ? "CLASS_ARM_ARCHIVED" : patch.archived === false ? "CLASS_ARM_RESTORED" : "CLASS_ARM_UPDATED",
      "ClassArm",
      id,
      { name: updated.name, capacity: updated.capacity, archived: updated.archivedAt !== null },
      { name: before.name, capacity: before.capacity, archived: before.archivedAt !== null },
    );
    return updated;
  } catch (error) {
    return duplicate(error, "This class already has an arm with that name.");
  }
}

// ---- subjects and offerings ----
export async function listSubjects(branchId: string, includeArchived = false) {
  return prisma.subject.findMany({
    where: { branchId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
    select: { id: true, branchId: true, name: true, code: true, archivedAt: true },
  });
}

export async function createSubject(actorUserId: string, input: z.infer<typeof subjectInput>) {
  try {
    const created = await prisma.subject.create({ data: { branchId: input.branchId, name: input.name, code: input.code ?? null } });
    await audit(actorUserId, "SUBJECT_CREATED", "Subject", created.id, {
      name: created.name,
      code: created.code,
      branchId: created.branchId,
    });
    return created;
  } catch (error) {
    return duplicate(error, "This branch already has a subject with that name or code.");
  }
}

export async function updateSubject(actorUserId: string, id: string, patch: z.infer<typeof subjectPatch>) {
  const before = await prisma.subject.findUnique({ where: { id } });
  if (!before) return null;
  try {
    const updated = await prisma.subject.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
      },
    });
    await audit(
      actorUserId,
      patch.archived === true ? "SUBJECT_ARCHIVED" : patch.archived === false ? "SUBJECT_RESTORED" : "SUBJECT_UPDATED",
      "Subject",
      id,
      { name: updated.name, code: updated.code, archived: updated.archivedAt !== null },
      { name: before.name, code: before.code, archived: before.archivedAt !== null },
    );
    return updated;
  } catch (error) {
    return duplicate(error, "This branch already has a subject with that name or code.");
  }
}

/// Replaces the set of subjects a class studies. Only live subjects of the SAME branch may be named; anything else is a refusal naming nothing.
export async function setOfferings(actorUserId: string, classGroupId: string, subjectIds: string[]) {
  const group = await prisma.classGroup.findUnique({ where: { id: classGroupId } });
  if (!group) return null;
  const wanted = [...new Set(subjectIds)];
  const found = await prisma.subject.findMany({
    where: { id: { in: wanted }, branchId: group.branchId, archivedAt: null },
    select: { id: true },
  });
  if (found.length !== wanted.length) throw new ConflictError("Some of those subjects do not exist in this branch (or are archived).");
  const before = await prisma.subjectOffering.findMany({ where: { classGroupId }, select: { subjectId: true } });
  await prisma.$transaction([
    prisma.subjectOffering.deleteMany({ where: { classGroupId, subjectId: { notIn: wanted } } }),
    prisma.subjectOffering.createMany({
      data: wanted.map((subjectId) => ({ branchId: group.branchId, classGroupId, subjectId })),
      skipDuplicates: true,
    }),
  ]);
  await audit(
    actorUserId,
    "SUBJECT_OFFERINGS_SET",
    "ClassGroup",
    classGroupId,
    { subjectIds: wanted },
    { subjectIds: before.map((o) => o.subjectId) },
  );
  return wanted;
}

// ---- linking the legacy strings to a real arm ----
/// The id of the branch's live arm that the className / arm strings name (ignoring case), or null when none matches. Used when an enrolment is written, so
/// the strings and the arm agree wherever they can; a miss leaves `classArmId` null and the Classes page counts it as unmatched.
export async function resolveArmId(
  db: Pick<typeof prisma, "classArm">,
  branchId: string,
  className: string | null | undefined,
  arm: string | null | undefined,
): Promise<string | null> {
  const group = (className ?? "").trim();
  if (!group) return null;
  const found = await db.classArm.findFirst({
    where: {
      branchId,
      archivedAt: null,
      name: { equals: (arm ?? "").trim() || "Main", mode: "insensitive" },
      classGroup: { name: { equals: group, mode: "insensitive" }, archivedAt: null },
    },
    select: { id: true },
  });
  return found?.id ?? null;
}
