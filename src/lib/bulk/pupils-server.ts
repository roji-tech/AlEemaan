import { EnrollmentStatus, SessionStatus } from "@prisma/client";
import { generateAdmissionNo, lockStudents } from "@/lib/students/service";
import { pupilEntity, type PupilRow } from "./pupils";
import type { CheckedRow, ServerKind, Tx } from "./server";
import type { Problem } from "./types";

// The server half of the pupil kind (task 0084): what only the database knows (a class and arm of this branch, an active session to place the pupil in, an admission number already
// taken, a namesake) and the save. It replaces the old partial-save import: every row is saved, or none.

export type PupilBulkCtx = { branchId: string; allowDuplicates: boolean };

type ArmRef = { id: string; name: string; viaMain: boolean };
type Placement = { ok: true; arm: ArmRef } | { ok: false; problem: Problem };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function loadStructure(db: Tx, branchId: string) {
  const [groups, arms, session] = await Promise.all([
    db.classGroup.findMany({ where: { branchId, archivedAt: null }, select: { name: true } }),
    db.classArm.findMany({
      where: { branchId, archivedAt: null, classGroup: { archivedAt: null } },
      select: { id: true, name: true, classGroup: { select: { name: true } } },
    }),
    db.academicSession.findFirst({ where: { branchId, status: SessionStatus.ACTIVE, archivedAt: null }, select: { id: true } }),
  ]);
  return { groups: groups.map((g) => g.name), arms, sessionId: session?.id ?? null };
}
type Structure = Awaited<ReturnType<typeof loadStructure>>;

/// Where a row's class and arm lead, or why they do not: an unknown class or arm is a problem on the row (the old import enrolled the pupil in nothing and said nothing).
function place(s: Structure, className: string, arm: string | undefined): Placement {
  if (s.sessionId === null)
    return {
      ok: false,
      problem: {
        column: "className",
        message: "This branch has no active academic session to place a pupil in. Leave the class empty, or start a session first.",
      },
    };
  const group = s.groups.find((g) => same(g, className));
  if (!group) return { ok: false, problem: { column: "className", message: `There is no class called "${className}" in this branch.` } };
  const arms = s.arms.filter((a) => same(a.classGroup.name, group));
  if (arm) {
    const hit = arms.find((a) => same(a.name, arm));
    return hit
      ? { ok: true, arm: { id: hit.id, name: hit.name, viaMain: false } }
      : { ok: false, problem: { column: "arm", message: `${group} has no arm called "${arm}".` } };
  }
  const main = arms.find((a) => same(a.name, "Main"));
  if (main) return { ok: true, arm: { id: main.id, name: main.name, viaMain: true } };
  if (arms.length === 1) return { ok: true, arm: { id: arms[0].id, name: arms[0].name, viaMain: false } };
  if (arms.length === 0)
    return {
      ok: false,
      problem: {
        column: "className",
        message: `${group} has no arms yet, so a pupil can't be placed in it. Add an arm on the Academics page.`,
      },
    };
  return { ok: false, problem: { column: "arm", message: `Say which arm of ${group}: ${arms.map((a) => a.name).join(", ")}.` } };
}

/// Pupils already in the branch with the same name and date of birth, by row.
async function namesakes(db: Tx, branchId: string, rows: CheckedRow<PupilRow>[]) {
  const found = new Map<number, string>();
  const dates = [...new Set(rows.map((r) => r.row.dateOfBirth))].map((d) => new Date(d));
  if (dates.length === 0) return found;
  const existing = await db.studentRecord.findMany({
    where: { branchId, archivedAt: null, dateOfBirth: { in: dates } },
    select: { firstName: true, lastName: true, dateOfBirth: true, admissionNo: true },
  });
  for (const r of rows) {
    const hit = existing.find(
      (e) =>
        e.dateOfBirth && iso(e.dateOfBirth) === r.row.dateOfBirth && same(e.firstName, r.row.firstName) && same(e.lastName, r.row.lastName),
    );
    if (hit) found.set(r.line, hit.admissionNo);
  }
  return found;
}

export const pupilKind: ServerKind<PupilRow, PupilBulkCtx> = {
  entity: pupilEntity,
  auditAction: "STUDENTS_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId, duplicatesAllowed: ctx.allowDuplicates }),
  // two people importing at once take the admission numbers in turn, and the namesake check sees the other's rows
  prepare: (tx) => lockStudents(tx),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    const add = (line: number, p: Problem) => found.set(line, [...(found.get(line) ?? []), p]);
    const structure = rows.some((r) => r.row.className) ? await loadStructure(db, ctx.branchId) : null;
    for (const r of rows) {
      if (!r.row.className || !structure) continue;
      const placed = place(structure, r.row.className, r.row.arm);
      if (!placed.ok) add(r.line, placed.problem);
    }

    const numbers = rows.flatMap((r) => (r.row.admissionNo ? [r.row.admissionNo] : []));
    if (numbers.length > 0) {
      const taken = await db.studentRecord.findMany({ where: { admissionNo: { in: numbers } }, select: { admissionNo: true } });
      const used = new Set(taken.map((t) => t.admissionNo));
      for (const r of rows)
        if (r.row.admissionNo && used.has(r.row.admissionNo))
          add(r.line, { column: "admissionNo", message: `Admission number "${r.row.admissionNo}" is already taken.` });
    }

    if (!ctx.allowDuplicates) {
      const inBranch = await namesakes(db, ctx.branchId, rows);
      const firstInFile = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.row.firstName.trim().toLowerCase()}|${r.row.lastName.trim().toLowerCase()}|${r.row.dateOfBirth}`;
        const existing = inBranch.get(r.line);
        const earlier = firstInFile.get(key);
        if (existing)
          add(r.line, {
            message: `A pupil with this name and date of birth is already in this branch (admission number ${existing}). Tick "Add even if a pupil with the same name and date of birth is already here" to add anyway.`,
          });
        else if (earlier !== undefined)
          add(r.line, {
            message: `Same name and date of birth as row ${earlier}. Tick "Add even if a pupil with the same name and date of birth is already here" to add both.`,
          });
        if (earlier === undefined) firstInFile.set(key, r.line);
      }
    }
    return found;
  },
  async notes(db, rows, ctx) {
    const out = new Map<number, string>();
    if (!ctx.allowDuplicates) return out;
    const inBranch = await namesakes(db, ctx.branchId, rows);
    for (const [line, no] of inBranch)
      out.set(line, `Same name and date of birth as admission number ${no}: added as a namesake, recorded against your name.`);
    return out;
  },
  async save(tx, rows, ctx, actorUserId) {
    const structure = rows.some((r) => r.row.className) ? await loadStructure(tx, ctx.branchId) : null;
    const inBranch = ctx.allowDuplicates ? await namesakes(tx, ctx.branchId, rows) : new Map<number, string>();
    const year = new Date().getFullYear();
    for (const { line, row } of rows) {
      const admissionNo = row.admissionNo ?? (await generateAdmissionNo(tx, year));
      const student = await tx.studentRecord.create({
        data: {
          branchId: ctx.branchId,
          firstName: row.firstName,
          middleName: row.middleName ?? null,
          lastName: row.lastName,
          gender: row.gender,
          dateOfBirth: new Date(row.dateOfBirth),
          admissionNo,
          guardianName: row.guardianName ?? null,
          guardianPhone: row.guardianPhone ?? null,
          guardianEmail: row.guardianEmail ?? null,
        },
        select: { id: true },
      });
      if (row.className && structure) {
        const placed = place(structure, row.className, row.arm);
        // checked a moment ago in this same transaction: if it is not true now, nothing is saved
        if (!placed.ok) throw new Error(placed.problem.message);
        const group = structure.groups.find((g) => same(g, row.className!))!;
        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            branchId: ctx.branchId,
            sessionId: structure.sessionId!,
            className: group,
            arm: placed.arm.viaMain ? null : placed.arm.name,
            classArmId: placed.arm.id,
            status: EnrollmentStatus.ACTIVE,
          },
        });
      }
      const overridden = inBranch.get(line);
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STUDENT_IMPORTED",
          targetType: "StudentRecord",
          targetId: student.id,
          afterValue: {
            id: student.id,
            admissionNo,
            branchId: ctx.branchId,
            ...(overridden ? { duplicateOverridden: true, existingAdmissionNo: overridden } : {}),
          },
        },
      });
    }
  },
};
