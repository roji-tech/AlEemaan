import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/academics/sessions";
import { DEFAULT_ARM_NAME, armLabel } from "@/lib/academics/class-label";
import { CLASS_TAKEN, SUBJECT_TAKEN, armName, structureName, subjectCode } from "@/lib/academics/structure-rules";
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
  /// Make the class used without arms (task 0135): it gets its hidden default arm in the same step.
  withoutArms: z.boolean().optional(),
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
  name: armName,
  capacity: z.number().int().min(1).max(500).nullable().optional(),
});
export const armPatch = z
  .strictObject({
    name: armName.optional(),
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
    return await prisma.$transaction(async (tx) => {
      const created = await tx.classGroup.create({
        data: { branchId: input.branchId, name: input.name, sortOrder: input.sortOrder ?? 0, gradeLabel: input.gradeLabel ?? null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "CLASS_GROUP_CREATED",
          targetType: "ClassGroup",
          targetId: created.id,
          afterValue: {
            name: created.name,
            branchId: created.branchId,
            gradeLabel: created.gradeLabel,
            withoutArms: input.withoutArms === true,
          },
        },
      });
      if (input.withoutArms) await createDefaultArm(tx, actorUserId, created);
      return created;
    });
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

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/// The hidden default arm of a class (task 0132), made inside the caller's transaction, audited CLASS_ARM_DEFAULT_CREATED.
async function createDefaultArm(tx: Tx, actorUserId: string, group: { id: string; branchId: string }) {
  const created = await tx.classArm.create({
    data: { branchId: group.branchId, classGroupId: group.id, name: DEFAULT_ARM_NAME, isDefault: true },
  });
  await tx.auditLog.create({
    data: {
      actorUserId,
      action: "CLASS_ARM_DEFAULT_CREATED",
      targetType: "ClassArm",
      targetId: created.id,
      afterValue: { classGroupId: group.id, branchId: group.branchId, name: created.name },
    },
  });
  return created;
}

/// Lets a class work with no arms of its own (task 0132): pupils, marks, attendance and the timetable are all kept per arm, so the class gets ONE flagged default arm (named "_", task 0133)
/// that no screen shows. A class that has exactly ONE live arm (task 0135) is converted instead: that arm becomes the default arm, so its pupils, marks, register, timetable and class teacher
/// stay exactly where they are; only its name stops being shown (the arm text kept on its enrolments is cleared, its capacity dropped, audited CLASS_ARM_MADE_DEFAULT). Refused (409) for an
/// archived class and for a class with two or more live arms (the pupils of the others would have nowhere to go: move them into one arm first). Safe to repeat: a class that already has only
/// its default arm gets that one back, unchanged. Audited CLASS_ARM_DEFAULT_CREATED. Returns null for an unknown class.
export async function classWithoutArms(actorUserId: string, classGroupId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await tx.classGroup.findUnique({ where: { id: classGroupId } });
      if (!group) return null;
      if (group.archivedAt) throw new ConflictError("That class is archived. Restore it first.");
      const live = await tx.classArm.findMany({
        where: { classGroupId, archivedAt: null },
        select: { id: true, name: true, isDefault: true, capacity: true },
      });
      if (live.length === 1 && live[0].isDefault) return tx.classArm.findUniqueOrThrow({ where: { id: live[0].id } });
      if (live.length === 0) return createDefaultArm(tx, actorUserId, group);
      if (live.length > 1)
        throw new ConflictError(
          `This class has ${live.length} arms. To use it without arms, first move the pupils of all but one arm into that arm, archive the others, then try again.`,
        );
      const [only] = live; // one live arm that is an ordinary arm: it becomes the class's own group
      const converted = await tx.classArm.update({
        where: { id: only.id },
        data: { isDefault: true, name: DEFAULT_ARM_NAME, capacity: null },
      });
      const cleared = await tx.studentEnrollment.updateMany({ where: { classArmId: only.id, arm: { not: null } }, data: { arm: null } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "CLASS_ARM_MADE_DEFAULT",
          targetType: "ClassArm",
          targetId: only.id,
          beforeValue: { name: only.name, capacity: only.capacity },
          afterValue: { classGroupId, branchId: group.branchId, name: converted.name, enrolmentsCleared: cleared.count },
        },
      });
      return converted;
    });
  } catch (error) {
    return duplicate(error, "This class already has an arm with that name. Archive it first.");
  }
}

/// Deletes a class nothing is connected to (task 0135), such as one just made. Refused (409, with what it is connected to) when it has pupils (now or in an earlier session, by arm or by the class
/// name written on the enrolment), marks, staff subject assignments, register permissions, timetable slots, announcements to its arms, promotion batches, fee lines, result approval scopes, a
/// scheme of its own, a frozen result-template use, or learning material, assignments or quizzes. What belongs to the class itself goes with it: its arms (the hidden default arm included, and any
/// arm's class teacher), its subject list, its result-template choice and its grade-scale choice. Hard delete, audited CLASS_GROUP_DELETED; archive instead to keep a class. Returns null for an
/// unknown class.
export async function deleteClassGroup(actorUserId: string, id: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await tx.classGroup.findUnique({
        where: { id },
        include: { arms: { select: { id: true, name: true } }, offerings: { select: { subjectId: true } } },
      });
      if (!group) return null;
      const branchId = group.branchId;
      const armIds = group.arms.map((a) => a.id);
      const inArms = { branchId, classArmId: { in: armIds } };
      const inClass = { branchId, classGroupId: id };
      const connected: [string, number][] = await Promise.all([
        tx.studentEnrollment
          .count({ where: { branchId, OR: [{ classArmId: { in: armIds } }, { className: { equals: group.name, mode: "insensitive" } }] } })
          .then((n): [string, number] => ["pupils", n]),
        tx.result.count({ where: inArms }).then((n): [string, number] => ["marks", n]),
        tx.staffSubjectAssignment.count({ where: inArms }).then((n): [string, number] => ["teachers' subject assignments", n]),
        tx.attendanceGrant.count({ where: inArms }).then((n): [string, number] => ["register permissions", n]),
        tx.timetableSlot.count({ where: inArms }).then((n): [string, number] => ["timetable slots", n]),
        tx.announcement.count({ where: { classArmId: { in: armIds } } }).then((n): [string, number] => ["announcements", n]),
        tx.promotionBatch
          .count({ where: { branchId, OR: [{ sourceClassGroupId: id }, { targetClassGroupId: id }] } })
          .then((n): [string, number] => ["promotion records", n]),
        tx.feeStructure.count({ where: inClass }).then((n): [string, number] => ["fee lines", n]),
        tx.resultApprovalScope.count({ where: inClass }).then((n): [string, number] => ["result approval scopes", n]),
        tx.assessmentScheme.count({ where: inClass }).then((n): [string, number] => ["a scheme of its own", n]),
        tx.assessmentSchemeScope.count({ where: { classGroupId: id } }).then((n): [string, number] => ["a scheme of its own", n]),
        tx.resultTemplateUse.count({ where: inClass }).then((n): [string, number] => ["report cards", n]),
        tx.assignment
          .count({ where: { branchId, OR: [{ classGroupId: id }, { classArmId: { in: armIds } }] } })
          .then((n): [string, number] => ["assignments", n]),
        tx.learningMaterial.count({ where: inClass }).then((n): [string, number] => ["learning materials", n]),
        tx.quiz.count({ where: inClass }).then((n): [string, number] => ["quizzes", n]),
      ]);
      const used = [...new Set(connected.filter(([, n]) => n > 0).map(([what]) => what))];
      if (used.length > 0)
        throw new ConflictError(
          `${group.name} is connected to ${used.join(", ")}, so it cannot be deleted. Archive it to take it out of use.`,
        );
      await tx.subjectOffering.deleteMany({ where: inClass });
      await tx.classArm.deleteMany({ where: { classGroupId: id } });
      await tx.classGroup.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "CLASS_GROUP_DELETED",
          targetType: "ClassGroup",
          targetId: id,
          beforeValue: {
            name: group.name,
            branchId,
            gradeLabel: group.gradeLabel,
            arms: group.arms.map((a) => a.name),
            subjects: group.offerings.length,
          },
        },
      });
      return { id, name: group.name };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      throw new ConflictError("This class is still used by other records, so it cannot be deleted. Archive it to take it out of use.");
    throw error;
  }
}

export async function updateArm(actorUserId: string, id: string, patch: z.infer<typeof armPatch>) {
  const before = await prisma.classArm.findUnique({ where: { id } });
  if (!before) return null;
  if (before.isDefault && patch.name !== undefined && patch.name !== before.name)
    throw new ConflictError("This is the class's own group, not an arm you named, so it cannot be renamed. Add an arm instead.");
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

/// Deletes an arm nothing is connected to (task 0136), such as one added by mistake. Refused (409, naming what) when it has pupils (placed in it, or carrying its name on an enrolment of its class,
/// in any session), marks, staff subject assignments, register permissions, timetable slots, announcements to it, or assignments. Its class teacher goes with it (the person's record stays).
/// Hard delete, audited CLASS_ARM_DELETED; archive an arm to keep one that has history. Deleting a class's last arm leaves the class with no arms. Returns null for an unknown arm.
export async function deleteArm(actorUserId: string, id: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const arm = await tx.classArm.findUnique({ where: { id }, include: { classGroup: { select: { name: true } } } });
      if (!arm) return null;
      const branchId = arm.branchId;
      const inArm = { branchId, classArmId: id };
      const connected: [string, number][] = await Promise.all([
        tx.studentEnrollment
          .count({
            where: {
              branchId,
              OR: [
                { classArmId: id },
                { className: { equals: arm.classGroup.name, mode: "insensitive" }, arm: { equals: arm.name, mode: "insensitive" } },
              ],
            },
          })
          .then((n): [string, number] => ["pupils", n]),
        tx.result.count({ where: inArm }).then((n): [string, number] => ["marks", n]),
        tx.staffSubjectAssignment.count({ where: inArm }).then((n): [string, number] => ["teachers' subject assignments", n]),
        tx.attendanceGrant.count({ where: inArm }).then((n): [string, number] => ["register permissions", n]),
        tx.timetableSlot.count({ where: inArm }).then((n): [string, number] => ["timetable slots", n]),
        tx.announcement.count({ where: { classArmId: id } }).then((n): [string, number] => ["announcements", n]),
        tx.assignment.count({ where: inArm }).then((n): [string, number] => ["assignments", n]),
      ]);
      const used = connected.filter(([, n]) => n > 0).map(([what]) => what);
      if (used.length > 0)
        throw new ConflictError(
          `${armLabel(arm) || arm.classGroup.name} is connected to ${used.join(", ")}, so it cannot be deleted. Archive it to take it out of use.`,
        );
      await tx.classArm.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "CLASS_ARM_DELETED",
          targetType: "ClassArm",
          targetId: id,
          beforeValue: {
            name: arm.name,
            classGroupId: arm.classGroupId,
            class: arm.classGroup.name,
            isDefault: arm.isDefault,
            hadClassTeacher: arm.classTeacherId !== null,
          },
        },
      });
      return { id, name: arm.name, classGroupId: arm.classGroupId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      throw new ConflictError("This arm is still used by other records, so it cannot be deleted. Archive it to take it out of use.");
    throw error;
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
  const wanted = (arm ?? "").trim();
  const inClass = { branchId, archivedAt: null, classGroup: { name: { equals: group, mode: "insensitive" as const }, archivedAt: null } };
  // No arm named: the class's hidden default arm (task 0133) if it has one, else the legacy arm called "Main".
  if (!wanted) {
    const dflt = await db.classArm.findFirst({ where: { ...inClass, isDefault: true }, select: { id: true } });
    if (dflt) return dflt.id;
  }
  const found = await db.classArm.findFirst({
    where: { ...inClass, name: { equals: wanted || "Main", mode: "insensitive" } },
    select: { id: true },
  });
  return found?.id ?? null;
}
