import { EnrollmentStatus, SessionStatus } from "@prisma/client";
import { generateAdmissionNo, lockStudents } from "@/lib/students/service";
import { adminScope } from "@/lib/auth/branch-access";
import { applyMainGuardianFields } from "@/lib/guardians/service";
import { grantTx } from "@/lib/scholarships/service";
import { pupilEntity, type PupilRow } from "./pupils";
import type { CheckedRow, ServerKind, Tx } from "./server";
import type { Problem } from "./types";

// The server half of the pupil kind (task 0084): what only the database knows (a class and arm of this branch, an active session to place the pupil in, an admission number already
// taken, a namesake) and the save. It replaces the old partial-save import: every row is saved, or none.

/// `asDraft` (task 0101 D1): save every row as a draft; the rows' own rules still apply, the completeness rules do not.
export type PupilBulkCtx = { branchId: string; allowDuplicates: boolean; asDraft?: boolean };

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

/// Two pupils with the same name are the same pupil unless both have a date of birth and the dates differ: a missing date of birth cannot tell two people apart (a file loaded twice must
/// not register everyone twice).
const sameDay = (a: string | undefined | null, b: string | undefined | null) => !a || !b || a === b;
/// A middle name tells two pupils apart only when both have one.
const sameMiddle = (a: string | null | undefined, b: string | null | undefined) => !a?.trim() || !b?.trim() || same(a, b);
const nameKey = (first: string, last: string) => `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;
const reason = (hasDob: boolean) => (hasDob ? "name and date of birth" : "name (no date of birth to tell them apart)");

/// Pupils already in the branch with the same name (and the same date of birth, when both have one), by row.
async function namesakes(db: Tx, branchId: string, rows: CheckedRow<PupilRow>[]) {
  const found = new Map<number, { admissionNo: string; withDob: boolean }>();
  if (rows.length === 0) return found;
  const wanted = new Set(rows.map((r) => nameKey(r.row.firstName, r.row.lastName)));
  const existing = await db.studentRecord.findMany({
    where: { branchId, archivedAt: null },
    select: { firstName: true, middleName: true, lastName: true, dateOfBirth: true, admissionNo: true },
  });
  const byName = new Map<string, typeof existing>();
  for (const e of existing) {
    const key = nameKey(e.firstName, e.lastName);
    if (wanted.has(key)) byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  for (const r of rows) {
    const hit = (byName.get(nameKey(r.row.firstName, r.row.lastName)) ?? []).find(
      (e) => sameMiddle(e.middleName, r.row.middleName) && sameDay(e.dateOfBirth ? iso(e.dateOfBirth) : null, r.row.dateOfBirth),
    );
    if (hit) found.set(r.line, { admissionNo: hit.admissionNo, withDob: !!hit.dateOfBirth && !!r.row.dateOfBirth });
  }
  return found;
}

export const pupilKind: ServerKind<PupilRow, PupilBulkCtx> = {
  entity: pupilEntity,
  auditAction: "STUDENTS_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId, duplicatesAllowed: ctx.allowDuplicates, asDraft: ctx.asDraft === true }),
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

    // Scholarships (task 0113 S1): a share without a type has nothing to be a share of.
    for (const r of rows)
      if (r.row.scholarshipPercent !== undefined && !r.row.scholarship)
        add(r.line, { column: "scholarshipPercent", message: "Name the scholarship type too, or leave the share empty." });
    // A type must be one of this branch's current ones, by name.
    if (rows.some((r) => r.row.scholarship)) {
      const types = await db.scholarshipType.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { name: true } });
      const known = new Set(types.map((t) => t.name.trim().toLowerCase()));
      for (const r of rows)
        if (r.row.scholarship && !known.has(r.row.scholarship.trim().toLowerCase()))
          add(r.line, {
            column: "scholarship",
            message: `There is no scholarship type called "${r.row.scholarship}" in this branch. Add it under Finance > Scholarships first.`,
          });
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
      const earlierRows = new Map<string, { line: number; dob: string | undefined; middle: string | undefined }[]>();
      for (const r of rows) {
        const key = nameKey(r.row.firstName, r.row.lastName);
        const existing = inBranch.get(r.line);
        const earlier = (earlierRows.get(key) ?? []).find(
          (e) => sameMiddle(e.middle, r.row.middleName) && sameDay(e.dob, r.row.dateOfBirth),
        );
        const tick = 'Tick "Add even if a pupil with the same name is already here" to add';
        if (existing)
          add(r.line, {
            message: `A pupil with this ${reason(existing.withDob)} is already in this branch (admission number ${existing.admissionNo}). ${tick} anyway (it is recorded against your name).`,
          });
        else if (earlier)
          add(r.line, {
            message: `Same ${reason(!!earlier.dob && !!r.row.dateOfBirth)} as row ${earlier.line}. ${tick} both.`,
          });
        earlierRows.set(key, [...(earlierRows.get(key) ?? []), { line: r.line, dob: r.row.dateOfBirth, middle: r.row.middleName }]);
      }
    }
    return found;
  },
  async notes(db, rows, ctx) {
    const out = new Map<number, string>();
    if (!ctx.allowDuplicates) return out;
    const inBranch = await namesakes(db, ctx.branchId, rows);
    for (const [line, hit] of inBranch)
      out.set(line, `Same ${reason(hit.withDob)} as admission number ${hit.admissionNo}: added as a namesake, recorded against your name.`);
    return out;
  },
  async save(tx, rows, ctx, actorUserId) {
    const structure = rows.some((r) => r.row.className) ? await loadStructure(tx, ctx.branchId) : null;
    const inBranch = ctx.allowDuplicates
      ? await namesakes(tx, ctx.branchId, rows)
      : new Map<number, { admissionNo: string; withDob: boolean }>();
    const year = new Date().getFullYear();
    const scope = rows.some((r) => r.row.guardianName || r.row.guardianPhone || r.row.guardianEmail) ? await adminScope(actorUserId) : null;
    const scholarshipTypes = rows.some((r) => r.row.scholarship)
      ? new Map(
          (
            await tx.scholarshipType.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { id: true, name: true } })
          ).map((t) => [t.name.trim().toLowerCase(), t.id]),
        )
      : null;
    for (const { line, row } of rows) {
      const admissionNo = row.admissionNo ?? (await generateAdmissionNo(tx, year));
      const student = await tx.studentRecord.create({
        data: {
          branchId: ctx.branchId,
          firstName: row.firstName,
          middleName: row.middleName ?? null,
          lastName: row.lastName,
          gender: row.gender,
          dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
          admissionNo,
          isDraft: ctx.asDraft === true,
          residence: row.residence ?? null,
        },
        select: { id: true, branchId: true, firstName: true, lastName: true },
      });
      // The row's guardian (task 0113 D9): the one with that whole phone and name in the administrator's reach, or a new one, linked as the main contact; the pupil's guardian columns
      // follow (the mirror). Brothers and sisters in one file with the same guardian share one record.
      if (scope && (row.guardianName || row.guardianPhone || row.guardianEmail))
        await applyMainGuardianFields(tx, scope, {
          student,
          name: row.guardianName ?? null,
          phone: row.guardianPhone ?? null,
          email: row.guardianEmail ?? null,
          actorUserId,
        });
      // The row's scholarship (task 0113 S1): the share from the type unless the row gives one; granted in this transaction, audited like any grant.
      const typeId = row.scholarship ? scholarshipTypes?.get(row.scholarship.trim().toLowerCase()) : undefined;
      if (typeId)
        await grantTx(tx, actorUserId, { branchId: ctx.branchId, studentId: student.id, typeId, percent: row.scholarshipPercent });
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
            ...(ctx.asDraft ? { isDraft: true } : {}),
            ...(overridden ? { duplicateOverridden: true, existingAdmissionNo: overridden.admissionNo } : {}),
          },
        },
      });
    }
  },
};
