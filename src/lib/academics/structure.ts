import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/academics/sessions";
import { CLASS_TAKEN, SUBJECT_TAKEN, structureName, subjectCode } from "@/lib/academics/structure-rules";
import { NOT_DRAFT } from "@/lib/drafts/live";
import { catalogIdForName } from "@/lib/academics/subject-catalog-link";

// Academic structure (Slice P1a): the classes, arms, subjects and "this class studies this subject" of ONE branch. Every function here takes the branch (or an
// entity that has one) and the caller's authority has ALREADY been checked by `withBranch` in the route (ADR 0015) - this module never decides who may act.
// Nothing is deleted: a class, arm or subject is archived, which frees its name.

export class ConflictError extends DomainError {}
/// The caller is signed in and in the branch but not allowed to do THIS (a 403), as opposed to a rule of the data (409 / 400).
export class ForbiddenError extends DomainError {}

const name = structureName;
/// The optional grade label of a class (task 0123): "Grade 7", "Year 10". Blank is none.
export const gradeLabel = z
  .string()
  .trim()
  .max(30, "Use at most 30 characters.")
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const classGroupInput = z.strictObject({
  branchId: z.string().min(1),
  name,
  sortOrder: z.number().int().min(0).max(999).optional(),
  gradeLabel: gradeLabel.optional(),
});
export const classGroupPatch = z
  .strictObject({
    name: name.optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    archived: z.boolean().optional(),
    gradeLabel: gradeLabel.optional(),
  })
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
const code = subjectCode;
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
        include: {
          // Draft pupils (task 0101 D1) are not counted in a class: they are kept unfinished until completed.
          _count: { select: { enrollments: { where: { student: NOT_DRAFT } } } },
          // The arm's class teacher (task 0114: shown and chosen on the Classes tab; it was only in Attendance > Manage Permissions).
          classTeacher: { select: { id: true, title: true, firstName: true, lastName: true } },
        },
      },
      // In the class's own order (task 0126): placed by hand first, then the order they were added in.
      offerings: { select: { subjectId: true }, orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    branchId: g.branchId,
    name: g.name,
    sortOrder: g.sortOrder,
    gradeLabel: g.gradeLabel,
    archivedAt: g.archivedAt,
    subjectIds: g.offerings.map((o) => o.subjectId),
    arms: g.arms.map((a) => ({
      id: a.id,
      name: a.name,
      capacity: a.capacity,
      isDefault: a.isDefault,
      archivedAt: a.archivedAt,
      enrolments: a._count.enrollments,
      classTeacher: a.classTeacher
        ? {
            id: a.classTeacher.id,
            name: `${a.classTeacher.title ? `${a.classTeacher.title} ` : ""}${a.classTeacher.firstName} ${a.classTeacher.lastName}`,
          }
        : null,
    })),
  }));
}

/// Enrolments of this branch that carry a class name but match no arm (the "unmatched" count the Classes page shows until the strings are retired).
export async function countUnmatchedEnrolments(branchId: string): Promise<number> {
  return prisma.studentEnrollment.count({ where: { branchId, classArmId: null, NOT: { className: "" } } });
}

export async function createClassGroup(actorUserId: string, input: z.infer<typeof classGroupInput>) {
  try {
    const created = await prisma.classGroup.create({
      data: { branchId: input.branchId, name: input.name, sortOrder: input.sortOrder ?? 0, gradeLabel: input.gradeLabel ?? null },
    });
    await audit(actorUserId, "CLASS_GROUP_CREATED", "ClassGroup", created.id, {
      name: created.name,
      branchId: created.branchId,
      gradeLabel: created.gradeLabel,
    });
    return created;
  } catch (error) {
    return duplicate(error, CLASS_TAKEN);
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
        ...(patch.gradeLabel !== undefined ? { gradeLabel: patch.gradeLabel } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
      },
    });
    await audit(
      actorUserId,
      patch.archived === true ? "CLASS_GROUP_ARCHIVED" : patch.archived === false ? "CLASS_GROUP_RESTORED" : "CLASS_GROUP_UPDATED",
      "ClassGroup",
      id,
      { name: updated.name, sortOrder: updated.sortOrder, gradeLabel: updated.gradeLabel, archived: updated.archivedAt !== null },
      { name: before.name, sortOrder: before.sortOrder, gradeLabel: before.gradeLabel, archived: before.archivedAt !== null },
    );
    return updated;
  } catch (error) {
    return duplicate(error, CLASS_TAKEN);
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

/// The name of the arm a class gets when it is used without arms (task 0132).
export const DEFAULT_ARM_NAME = "Main";

/// Lets a class work with no arms of its own (task 0132): pupils, marks, attendance and the timetable are all kept per arm, so the class gets ONE flagged default arm ("Main") that the Classes
/// tab does not show as an arm. Refused (409) for an archived class and for a class that already has live arms (add pupils to those, or archive them first). Safe to repeat: a class that already
/// has its default arm gets that one back, unchanged. Audited CLASS_ARM_DEFAULT_CREATED. Returns null for an unknown class.
export async function classWithoutArms(actorUserId: string, classGroupId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await tx.classGroup.findUnique({ where: { id: classGroupId } });
      if (!group) return null;
      if (group.archivedAt) throw new ConflictError("That class is archived. Restore it first.");
      const live = await tx.classArm.findMany({ where: { classGroupId, archivedAt: null }, select: { id: true, isDefault: true } });
      const existing = live.find((a) => a.isDefault);
      if (existing && live.length === 1) return tx.classArm.findUniqueOrThrow({ where: { id: existing.id } });
      if (live.length > 0) throw new ConflictError("This class already has arms. Put its pupils in those, or archive them first.");
      const created = await tx.classArm.create({
        data: { branchId: group.branchId, classGroupId, name: DEFAULT_ARM_NAME, isDefault: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "CLASS_ARM_DEFAULT_CREATED",
          targetType: "ClassArm",
          targetId: created.id,
          afterValue: { classGroupId, branchId: group.branchId, name: created.name },
        },
      });
      return created;
    });
  } catch (error) {
    return duplicate(error, "This class already has an arm called Main. Rename or archive it first.");
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
export async function listSubjects(branchId: string, includeArchived = false, tag?: string) {
  return prisma.subject
    .findMany({
      where: { branchId, ...(includeArchived ? {} : { archivedAt: null }), ...(tag ? { catalog: { tags: { has: tag } } } : {}) },
      orderBy: { name: "asc" },
      // `department`: the department the subject is in (task 0101 D7); null when it is in none or the department is archived. The screen shows it only while the branch uses departments.
      select: {
        id: true,
        branchId: true,
        name: true,
        code: true,
        archivedAt: true,
        department: { select: { id: true, name: true, archivedAt: true } },
        // The catalogue entry it is linked to (task 0119): its tags are shown on the branch's subject (labels only).
        catalog: { select: { tags: true } },
      },
    })
    .then((rows) =>
      rows.map(({ department, catalog, ...row }) => ({
        ...row,
        tags: catalog?.tags ?? [],
        department: department && department.archivedAt === null ? { id: department.id, name: department.name } : null,
      })),
    );
}

export async function createSubject(actorUserId: string, input: z.infer<typeof subjectInput>) {
  try {
    // Linked to the catalogue entry of the same name when there is one (task 0119); never creates an entry.
    const catalogId = await catalogIdForName(prisma, input.branchId, input.name);
    const created = await prisma.subject.create({
      data: { branchId: input.branchId, name: input.name, code: input.code ?? null, catalogId },
    });
    await audit(actorUserId, "SUBJECT_CREATED", "Subject", created.id, {
      name: created.name,
      code: created.code,
      branchId: created.branchId,
      ...(created.catalogId ? { catalogId: created.catalogId } : {}),
    });
    return created;
  } catch (error) {
    return duplicate(error, SUBJECT_TAKEN);
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
    return duplicate(error, SUBJECT_TAKEN);
  }
}

/// Replaces the set of subjects a class studies; the order of `subjectIds` is the order the report card prints them in (task 0126). Only live subjects of the SAME branch may be named; anything else is a refusal naming nothing.
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
      data: wanted.map((subjectId, sortOrder) => ({ branchId: group.branchId, classGroupId, subjectId, sortOrder })),
      skipDuplicates: true,
    }),
    // The order of the list is the class's order on the report card (task 0126), so a subject that was already there takes its new place too.
    ...wanted.map((subjectId, sortOrder) => prisma.subjectOffering.updateMany({ where: { classGroupId, subjectId }, data: { sortOrder } })),
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
