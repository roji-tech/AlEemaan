import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/academics/sessions";
import { ConflictError } from "@/lib/academics/structure";
import { lockScale, lockScheme } from "@/lib/academics/assessment";
import { gradeFor, toHundredths } from "@/lib/academics/scoring";

// Results, Slice P2a: ENTERING them. One row per student x subject x period; the arm, scheme and scale are snapshotted onto it, the first result locks the scheme
// and the scale, and every entry, edit and removal writes a ResultAudit row in the same transaction. The status machine beyond DRAFT is Slice P2b. The caller's
// authority over the BRANCH was checked by `withBranch` in the route (ADR 0015); what this module adds is the finer rule of the design: a teacher may enter results
// only for a subject and arm they are assigned to (results only - who may take attendance is unchanged), an administrator for any.
// All arithmetic is in hundredths (`toHundredths`), so no float ever reaches the database.

const id = z.string().min(1);
const score = z.number({ error: "Give a number." });
export const sheetQuery = z.object({ periodId: id, classArmId: id, subjectId: id });
export const sheetInput = z.strictObject({
  periodId: id,
  classArmId: id,
  subjectId: id,
  entries: z
    .array(z.strictObject({ studentId: id, parts: z.record(z.string(), score), exam: score }))
    .max(300, "Save at most 300 students at a time."),
  /// Students whose DRAFT result for this subject and period is to be removed (a real delete; the history keeps the trail).
  removeStudentIds: z.array(id).max(300).optional(),
});
export type SheetInput = z.infer<typeof sheetInput>;

export const armBranchOf = async (classArmId: string) =>
  (await prisma.classArm.findUnique({ where: { id: classArmId }, select: { branchId: true } }))?.branchId ?? null;

const num = (v: { toString(): string }) => Number(v.toString());
const hundredths = (n: number) => Math.round(n * 100);
const dec = (h: number) => new Prisma.Decimal(h).div(100);

/// Whether this person may enter results for this subject and arm: an administrator of the branch always; anyone else needs a live staff record in the branch,
/// linked to their account, with an assignment for exactly this subject and arm.
export async function mayEnterResults(
  userId: string,
  role: Role,
  branchId: string,
  subjectId: string,
  classArmId: string,
): Promise<boolean> {
  if (role === Role.ADMIN) return true;
  if (role !== Role.TEACHING_STAFF) return false;
  const assigned = await prisma.staffSubjectAssignment.findFirst({
    where: { branchId, subjectId, classArmId, staffRecord: { userId, branchId, archivedAt: null } },
    select: { id: true },
  });
  return assigned !== null;
}

type Context = Awaited<ReturnType<typeof loadContext>>;
/// Everything a sheet needs, checked to be one branch's live, consistent set; refuses (409) with the reason in the person's words otherwise.
async function loadContext(branchId: string, periodId: string, classArmId: string, subjectId: string) {
  const [period, arm, subject] = await Promise.all([
    prisma.academicPeriod.findFirst({
      where: { id: periodId, branchId },
      include: { session: { select: { id: true, status: true, label: true } } },
    }),
    prisma.classArm.findFirst({
      where: { id: classArmId, branchId },
      include: { classGroup: { select: { id: true, name: true, archivedAt: true } } },
    }),
    prisma.subject.findFirst({ where: { id: subjectId, branchId } }),
  ]);
  if (!period || !arm || !subject) throw new ConflictError("That term, class arm or subject does not exist in this branch.");
  if (period.archivedAt || period.session.status !== "ACTIVE")
    throw new ConflictError("Results can be entered only in a term of the active session.");
  if (arm.archivedAt || arm.classGroup.archivedAt) throw new ConflictError("That class arm is archived.");
  if (subject.archivedAt) throw new ConflictError("That subject is archived.");
  const offered = await prisma.subjectOffering.findFirst({ where: { classGroupId: arm.classGroupId, subjectId }, select: { id: true } });
  if (!offered) throw new ConflictError("That class does not study this subject.");
  // A scheme for this class wins over the branch's default; both must be live. Same for the grade scale: the branch's live default.
  const scheme =
    (await prisma.assessmentScheme.findFirst({
      where: { branchId, classGroupId: arm.classGroupId, archivedAt: null },
      include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    })) ??
    (await prisma.assessmentScheme.findFirst({
      where: { branchId, classGroupId: null, archivedAt: null },
      include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    }));
  if (!scheme) throw new ConflictError("Set up an assessment scheme for this branch first (Academics, Assessment and grading).");
  const scale = await prisma.gradeScale.findFirst({
    where: { branchId, isDefault: true, archivedAt: null },
    include: { bands: { orderBy: { minScore: "asc" } } },
  });
  if (!scale) throw new ConflictError("Set up a default grade scale for this branch first (Academics, Assessment and grading).");
  return { period, arm, subject, scheme, scale };
}

export const rosterOf = (branchId: string, sessionId: string, classArmId: string) =>
  prisma.studentEnrollment.findMany({
    where: { branchId, sessionId, classArmId, status: "ACTIVE", student: { archivedAt: null } },
    select: { student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNo: true } } },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { student: { id: "asc" } }],
  });

type StoredPart = { name: string; max: number; score: number };
/// Compares parts by value: the database returns JSON with its keys in its own order, so comparing the text would call an unchanged sheet changed.
const sameParts = (a: StoredPart[], b: StoredPart[]) =>
  a.length === b.length &&
  a.every((p, i) => p.name === b[i].name && hundredths(p.score) === hundredths(b[i].score) && hundredths(p.max) === hundredths(b[i].max));

/// The sheet: the arm's students for the term, the scheme's parts, and what has been entered so far.
export async function getSheet(branchId: string, q: z.infer<typeof sheetQuery>) {
  const ctx = await loadContext(branchId, q.periodId, q.classArmId, q.subjectId);
  const roster = await rosterOf(branchId, ctx.period.sessionId, q.classArmId);
  const results = await prisma.result.findMany({
    where: { branchId, periodId: q.periodId, subjectId: q.subjectId, classArmId: q.classArmId },
  });
  const byStudent = new Map(results.map((r) => [r.studentId, r]));
  return {
    period: { id: ctx.period.id, label: ctx.period.label, session: ctx.period.session.label },
    classArm: { id: ctx.arm.id, name: ctx.arm.name, classGroupName: ctx.arm.classGroup.name },
    subject: { id: ctx.subject.id, name: ctx.subject.name },
    scheme: {
      id: ctx.scheme.id,
      name: ctx.scheme.name,
      totalMax: num(ctx.scheme.totalMax),
      examMax: num(ctx.scheme.examMax),
      components: ctx.scheme.components.map((c) => ({ name: c.name, max: num(c.maxScore) })),
    },
    scale: {
      id: ctx.scale.id,
      bands: ctx.scale.bands.map((b) => ({ min: num(b.minScore), max: num(b.maxScore), letter: b.letter, remark: b.remark })),
    },
    students: roster.map(({ student }) => {
      const r = byStudent.get(student.id);
      return {
        id: student.id,
        name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
        admissionNo: student.admissionNo,
        result: r
          ? {
              id: r.id,
              status: r.status,
              parts: (r.componentScores as StoredPart[]).map((p) => ({ name: p.name, score: p.score })),
              exam: num(r.examScore),
              total: num(r.total),
              gradeLetter: r.gradeLetter,
              gradeRemark: r.gradeRemark,
            }
          : null,
      };
    }),
  };
}

/// Works out one student's numbers from the scheme and scale, or says what is wrong in words for the teacher.
function compute(ctx: Context, studentName: string, parts: Record<string, number>, exam: number) {
  const { scheme, scale } = ctx;
  const names = scheme.components.map((c) => c.name);
  const given = Object.keys(parts);
  const extra = given.filter((k) => !names.includes(k));
  if (extra.length) throw new DomainError(`${studentName}: "${extra[0]}" is not a part of this assessment scheme.`);
  const stored: StoredPart[] = [];
  let caH = 0;
  for (const c of scheme.components) {
    if (!(c.name in parts)) throw new DomainError(`${studentName}: enter a mark for ${c.name}.`);
    const maxH = toHundredths(num(c.maxScore))!;
    const h = toHundredths(parts[c.name]);
    if (h === null) throw new DomainError(`${studentName}: ${c.name} must be a number with at most two decimal places.`);
    if (h < 0 || h > maxH) throw new DomainError(`${studentName}: ${c.name} must be between 0 and ${maxH / 100}.`);
    caH += h;
    stored.push({ name: c.name, max: maxH / 100, score: h / 100 });
  }
  const examMaxH = toHundredths(num(scheme.examMax))!;
  const examH = toHundredths(exam);
  if (examH === null) throw new DomainError(`${studentName}: the exam mark must be a number with at most two decimal places.`);
  if (examH < 0 || examH > examMaxH) throw new DomainError(`${studentName}: the exam mark must be between 0 and ${examMaxH / 100}.`);
  const totalH = caH + examH;
  const maxH = toHundredths(num(scheme.totalMax))!;
  // The grade is looked up on the percentage, so a scheme out of something other than 100 still grades on the scale's 0-100.
  const percent = Math.round((totalH * 10000) / maxH) / 100;
  const band = gradeFor(
    scale.bands.map((b) => ({ min: num(b.minScore), max: num(b.maxScore), letter: b.letter, remark: b.remark })),
    percent,
  );
  if (!band) throw new DomainError(`${studentName}: no grade band covers ${percent}%. Check the grade scale.`);
  return { stored, caH, examH, examMaxH, totalH, maxH, letter: band.letter, remark: band.remark };
}

/// Saves a sheet: enters or edits DRAFT results and removes drafts, all or nothing. A student who already has a result past DRAFT is refused (409) - to correct
/// it, an administrator sends it back (Slice P2b). The first result locks the scheme and the scale it used.
export async function saveSheet(actorUserId: string, branchId: string, input: SheetInput) {
  const ctx = await loadContext(branchId, input.periodId, input.classArmId, input.subjectId);
  const roster = await rosterOf(branchId, ctx.period.sessionId, input.classArmId);
  const names = new Map(roster.map(({ student }) => [student.id, [student.firstName, student.lastName].join(" ")]));
  const seen = new Set<string>();
  for (const e of input.entries) {
    if (!names.has(e.studentId)) throw new ConflictError("A student on this sheet is not enrolled in this arm for this term.");
    if (seen.has(e.studentId)) throw new DomainError(`${names.get(e.studentId)} appears twice on this sheet.`);
    seen.add(e.studentId);
  }
  const removals = [...new Set(input.removeStudentIds ?? [])];
  if (removals.some((s) => seen.has(s))) throw new DomainError("A student cannot be both saved and removed in one go.");
  // Validate everything BEFORE writing anything, so a bad row refuses the whole sheet with its own sentence.
  const computed = input.entries.map((e) => ({ e, c: compute(ctx, names.get(e.studentId)!, e.parts, e.exam) }));

  return prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let removed = 0;
    const existing = new Map(
      (
        await tx.result.findMany({
          where: { branchId, periodId: input.periodId, subjectId: input.subjectId, studentId: { in: [...seen, ...removals] } },
        })
      ).map((r) => [r.studentId, r]),
    );
    for (const studentId of removals) {
      const row = existing.get(studentId);
      if (!row) continue;
      if (row.status !== "DRAFT")
        throw new ConflictError(`${names.get(studentId) ?? "A student"}'s result has been submitted and cannot be removed.`);
      await tx.resultAudit.create({
        data: { branchId, resultId: row.id, actorUserId, action: "REMOVED", fromStatus: row.status, fromTotal: row.total, reason: null },
      });
      await tx.result.delete({ where: { id: row.id } });
      removed++;
    }
    for (const { e, c } of computed) {
      const row = existing.get(e.studentId);
      const content = {
        classArmId: input.classArmId,
        schemeId: ctx.scheme.id,
        scaleId: ctx.scale.id,
        componentScores: c.stored as unknown as Prisma.InputJsonValue,
        examScore: dec(c.examH),
        examMax: dec(c.examMaxH),
        caTotal: dec(c.caH),
        total: dec(c.totalH),
        maxScore: dec(c.maxH),
        gradeLetter: c.letter,
        gradeRemark: c.remark,
      };
      if (row) {
        if (row.status !== "DRAFT")
          throw new ConflictError(
            `${names.get(e.studentId)}'s result has been submitted; ask an administrator to send it back before changing it.`,
          );
        if (
          hundredths(num(row.total)) === c.totalH &&
          sameParts(row.componentScores as StoredPart[], c.stored) &&
          hundredths(num(row.examScore)) === c.examH
        )
          continue;
        await tx.result.update({ where: { id: row.id }, data: content });
        await tx.resultAudit.create({
          data: {
            branchId,
            resultId: row.id,
            actorUserId,
            action: "EDITED",
            fromStatus: "DRAFT",
            toStatus: "DRAFT",
            fromTotal: row.total,
            toTotal: content.total,
          },
        });
        updated++;
      } else {
        const made = await tx.result.create({
          data: {
            branchId,
            studentId: e.studentId,
            subjectId: input.subjectId,
            periodId: input.periodId,
            enteredByUserId: actorUserId,
            ...content,
          },
        });
        await tx.resultAudit.create({
          data: { branchId, resultId: made.id, actorUserId, action: "ENTERED", toStatus: "DRAFT", toTotal: content.total },
        });
        created++;
      }
    }
    if (created + updated > 0) {
      await lockScheme(tx, ctx.scheme.id);
      await lockScale(tx, ctx.scale.id);
    }
    return { created, updated, removed };
  });
}

export const optionsQuery = z.object({ branchId: id });

/// What the entry screen offers this person: the terms of the active session(s) and the (class arm, subject) pairs they may enter - every offered pair for an
/// administrator, only the assigned ones for a teacher. The same rule `mayEnterResults` applies on every request; this only lists it.
export async function entryOptions(userId: string, role: Role, branchId: string) {
  const periods = await prisma.academicPeriod.findMany({
    where: { branchId, archivedAt: null, session: { status: "ACTIVE" } },
    orderBy: [{ ordinal: "asc" }],
    select: { id: true, label: true, isCurrent: true, session: { select: { label: true } } },
  });
  type Pair = { classArmId: string; armName: string; subjectId: string; subjectName: string };
  let pairs: Pair[] = [];
  if (role === Role.ADMIN) {
    const offerings = await prisma.subjectOffering.findMany({
      where: { branchId, subject: { archivedAt: null }, classGroup: { archivedAt: null } },
      select: {
        subject: { select: { id: true, name: true } },
        classGroup: { select: { name: true, sortOrder: true, arms: { where: { archivedAt: null }, select: { id: true, name: true } } } },
      },
    });
    pairs = offerings.flatMap((o) =>
      o.classGroup.arms.map((a) => ({
        classArmId: a.id,
        armName: `${o.classGroup.name} ${a.name}`,
        subjectId: o.subject.id,
        subjectName: o.subject.name,
      })),
    );
  } else if (role === Role.TEACHING_STAFF) {
    const mine = await prisma.staffSubjectAssignment.findMany({
      where: {
        branchId,
        staffRecord: { userId, branchId, archivedAt: null },
        subject: { archivedAt: null },
        classArm: { archivedAt: null, classGroup: { archivedAt: null } },
      },
      select: {
        subject: { select: { id: true, name: true } },
        classArm: { select: { id: true, name: true, classGroup: { select: { name: true } } } },
      },
    });
    pairs = mine.map((m) => ({
      classArmId: m.classArm.id,
      armName: `${m.classArm.classGroup.name} ${m.classArm.name}`,
      subjectId: m.subject.id,
      subjectName: m.subject.name,
    }));
  }
  pairs.sort((a, b) => a.armName.localeCompare(b.armName) || a.subjectName.localeCompare(b.subjectName));
  return { periods: periods.map((p) => ({ id: p.id, label: p.label, session: p.session.label, isCurrent: p.isCurrent })), pairs };
}

/// The students of an arm for a term (the report-card picker): enrolled in the arm in the term's session, active, not archived.
export async function armRoster(branchId: string, classArmId: string, periodId: string) {
  const period = await prisma.academicPeriod.findFirst({ where: { id: periodId, branchId }, select: { sessionId: true } });
  if (!period) throw new ConflictError("That term does not exist in this branch.");
  const rows = await rosterOf(branchId, period.sessionId, classArmId);
  return rows.map(({ student }) => ({
    id: student.id,
    name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
    admissionNo: student.admissionNo,
  }));
}
