import type { Problem } from "./types";
import { CLASS_TAKEN } from "@/lib/academics/structure-rules";
import { classEntity, type ClassRow } from "./classes";
import { BulkChangedError, type ServerKind } from "./server";

// The server half of the class kind (task 0084): what only the database knows (a LIVE class of the branch has the name already, ignoring capitals; a subject written in the file is not a live
// subject of the branch) and the save: the class, its arms, and the subjects it studies, with the audit entries the single forms write. Subjects are looked up, never created: a name that is
// not a subject says so, on that row, and points to the Subjects tab.

export type ClassBulkCtx = { branchId: string };
const unknownSubject = (name: string) => `There is no subject called "${name}" in this branch. Add it on the Subjects tab first.`;

export const classKind: ServerKind<ClassRow, ClassBulkCtx> = {
  entity: classEntity,
  auditAction: "CLASS_GROUP_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId }),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    const [classes, subjects] = await Promise.all([
      db.classGroup.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { name: true } }),
      db.subject.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { name: true } }),
    ]);
    const taken = new Set(classes.map((c) => c.name.toLowerCase()));
    const known = new Set(subjects.map((s) => s.name.toLowerCase()));
    for (const { line, row } of rows) {
      const problems: Problem[] = [];
      if (taken.has(row.name.toLowerCase())) problems.push({ column: "name", message: CLASS_TAKEN });
      const missing = row.subjects.filter((s) => !known.has(s.toLowerCase()));
      if (missing.length > 0) problems.push({ column: "subjects", message: missing.map(unknownSubject).join(" ") });
      if (problems.length > 0) found.set(line, problems);
    }
    return found;
  },
  async save(tx, rows, ctx, actorUserId) {
    const subjects = await tx.subject.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { id: true, name: true } });
    const idOf = new Map(subjects.map((s) => [s.name.toLowerCase(), s.id]));
    for (const { row } of rows) {
      const group = await tx.classGroup.create({
        data: { branchId: ctx.branchId, name: row.name, gradeLabel: row.gradeLabel ?? null },
        select: { id: true, name: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "CLASS_GROUP_CREATED",
          targetType: "ClassGroup",
          targetId: group.id,
          afterValue: { name: group.name, branchId: ctx.branchId, gradeLabel: row.gradeLabel ?? null },
        },
      });
      for (const arm of row.arms) {
        const created = await tx.classArm.create({
          data: { branchId: ctx.branchId, classGroupId: group.id, name: arm },
          select: { id: true, name: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: "CLASS_ARM_CREATED",
            targetType: "ClassArm",
            targetId: created.id,
            afterValue: { name: created.name, classGroupId: group.id, branchId: ctx.branchId },
          },
        });
      }
      if (row.subjects.length > 0) {
        const subjectIds = row.subjects.map((s) => idOf.get(s.toLowerCase()));
        // A subject archived between the check and here: the data changed, so nothing is saved and the person is asked to check again.
        if (subjectIds.some((id) => id === undefined)) throw new BulkChangedError();
        await tx.subjectOffering.createMany({
          data: (subjectIds as string[]).map((subjectId) => ({ branchId: ctx.branchId, classGroupId: group.id, subjectId })),
          skipDuplicates: true,
        });
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: "SUBJECT_OFFERINGS_SET",
            targetType: "ClassGroup",
            targetId: group.id,
            afterValue: { subjectIds: subjectIds as string[] },
          },
        });
      }
    }
  },
};
