import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError } from "@/lib/academics/structure";
import { LIVE_STAFF } from "@/lib/drafts/live";
import { templateForClass } from "@/lib/results/templates";
import {
  ATTENDANCE_MESSAGES,
  MAX_DAYS,
  MAX_RATINGS_PER_SAVE,
  RATING_MESSAGES,
  checkAttendance,
  checkRatings,
  fromRegister,
  mergeAttendance,
  type AttendanceNumbers,
} from "@/lib/results/report-traits-rules";

// Trait ratings and attendance for a pupil's report card (task 0116): what the template's trait groups ask (Psychomotor skill, Affective domain, Character development, Practical skills),
// the 1 to 5 rating of each, and the term's attendance numbers. Who may enter them: an administrator of the branch, or the class teacher of the arm the pupil is in for that term's session
// (a teacher of another class is refused). They are editable until the pupil's results for the term are published, exactly as the remarks are, and every save is audited.
// Everything is checked against the pupil's own template and branch: a trait of another template or branch is "not on this pupil's card", never a write.

const PUBLISHED = ["PUBLISHED", "LOCKED"] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export type Actor = { userId: string; role: Role };

const id = z.string().trim().min(1).max(64);
export const traitsQuery = z.object({ periodId: id });
export const ratingsInput = z.strictObject({
  periodId: id,
  ratings: z
    .array(z.strictObject({ traitId: id, rating: z.number().int().min(1).max(5).nullable() }))
    .min(1)
    .max(MAX_RATINGS_PER_SAVE),
});
const day = z.number().int().min(0).max(MAX_DAYS).nullable().optional();
export const attendanceInput = z.strictObject({ periodId: id, timesOpen: day, timesPresent: day, timesAbsent: day });

/// The branch a student belongs to, for `withBranch` (null for an unknown id).
export const traitsStudentBranch = async (studentId: string) =>
  (await prisma.studentRecord.findUnique({ where: { id: studentId }, select: { branchId: true } }))?.branchId ?? null;

/// The pupil's place for the term's session: the class and arm they are enrolled in and that arm's class teacher.
async function placement(branchId: string, studentId: string, sessionId: string) {
  return prisma.studentEnrollment
    .findUnique({
      where: { studentId_sessionId: { studentId, sessionId } },
      select: {
        branchId: true,
        classArm: { select: { id: true, name: true, classTeacherId: true, classGroup: { select: { id: true, name: true } } } },
      },
    })
    .then((e) => (e && e.branchId === branchId ? e.classArm : null));
}

/// The class and arm the pupil is enrolled in for the term's session (names and ids), or null: what the card falls back on before any result exists.
export const enrolledPlace = (branchId: string, studentId: string, sessionId: string) => placement(branchId, studentId, sessionId);

/// May this person enter trait ratings and attendance for this pupil: an administrator of the branch (checked by the route), or a teacher who is the class teacher of the pupil's arm.
async function mayEnter(actor: Actor, branchId: string, classTeacherId: string | null): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  if (actor.role !== Role.TEACHING_STAFF || !classTeacherId) return false;
  const mine = await prisma.staffRecord.findFirst({ where: { branchId, userId: actor.userId, ...LIVE_STAFF }, select: { id: true } });
  return mine?.id === classTeacherId;
}

const published = async (branchId: string, studentId: string, periodId: string) =>
  (await prisma.result.count({ where: { branchId, studentId, periodId, status: { in: [...PUBLISHED] } } })) > 0;

/// Dates for the card: this term starts on, school closed on (its last day), next term starts on (the first term that begins after this one, in this or the next session).
async function termDates(branchId: string, period: { id: string; startDate: Date; endDate: Date | null }) {
  const next = await prisma.academicPeriod.findFirst({
    where: { branchId, archivedAt: null, startDate: { gt: period.startDate }, id: { not: period.id } },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  return {
    termStarts: iso(period.startDate),
    schoolClosed: period.endDate ? iso(period.endDate) : null,
    nextTermStarts: next ? iso(next.startDate) : null,
  };
}

/// The register's numbers for the term (see `fromRegister`): days the branch took a register within the term (less breaks), this pupil's present and absent days. Only up to today for a
/// term still running; nothing is invented when no register exists.
async function registerNumbers(
  branchId: string,
  studentId: string,
  period: { id: string; startDate: Date; endDate: Date | null },
): Promise<AttendanceNumbers> {
  const to = period.endDate ?? new Date();
  const [rows, breaks] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { branchId, date: { gte: period.startDate, lte: to } },
      select: { date: true, status: true, studentId: true },
    }),
    prisma.academicBreak.findMany({
      where: { branchId, periodId: period.id, archivedAt: null },
      select: { startDate: true, endDate: true },
    }),
  ]);
  return fromRegister(
    rows.map((r) => ({ date: iso(r.date), status: r.status, mine: r.studentId === studentId })),
    breaks.map((b) => ({ start: iso(b.startDate), end: iso(b.endDate) })),
  );
}

async function attendanceView(branchId: string, studentId: string, period: { id: string; startDate: Date; endDate: Date | null }) {
  const [entered, register] = await Promise.all([
    prisma.reportAttendance.findUnique({ where: { studentId_periodId: { studentId, periodId: period.id } } }),
    registerNumbers(branchId, studentId, period),
  ]);
  const enteredNumbers: AttendanceNumbers = {
    timesOpen: entered?.timesOpen ?? null,
    timesPresent: entered?.timesPresent ?? null,
    timesAbsent: entered?.timesAbsent ?? null,
  };
  return { entered: enteredNumbers, register, effective: mergeAttendance(enteredNumbers, register) };
}

/// The pupil's template, its live trait groups and their ratings for the term: what the card prints and what the entry screen asks.
async function traitView(branchId: string, studentId: string, periodId: string, classGroupId: string | null) {
  const template = await templateForClass(branchId, classGroupId);
  const groups = await prisma.resultTemplateTraitGroup.findMany({
    where: { branchId, templateId: template.id },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      showSign: true,
      traits: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } },
    },
  });
  const ratings = await prisma.traitRating.findMany({ where: { branchId, studentId, periodId }, select: { traitId: true, rating: true } });
  const byTrait = new Map(ratings.map((r) => [r.traitId, r.rating]));
  return {
    template: { id: template.id, name: template.name, layoutCode: template.layoutCode },
    groups: groups
      .filter((g) => g.traits.length > 0)
      .map((g) => ({
        id: g.id,
        title: g.title,
        showSign: g.showSign,
        traits: g.traits.map((t) => ({ id: t.id, name: t.name, rating: byTrait.get(t.id) ?? null })),
      })),
  };
}

/// The extras a printed card needs beyond the marks: the pupil's date of birth, the trait groups with ratings, the attendance block and the dates. Used by `getReportCard`.
export async function cardExtras(
  branchId: string,
  studentId: string,
  period: { id: string; sessionId: string; startDate: Date; endDate: Date | null },
) {
  // The pupil's template comes from the class they are ENROLLED in for the term's session (not from which results exist), so a card with no marks yet still has its trait sections.
  const arm = await placement(branchId, studentId, period.sessionId);
  const [traits, attendance, dates] = await Promise.all([
    traitView(branchId, studentId, period.id, arm?.classGroup.id ?? null),
    attendanceView(branchId, studentId, period),
    termDates(branchId, period),
  ]);
  return { traits: traits.groups, attendance: attendance.effective, dates };
}

/// What the entry screen needs for one pupil and term: the template, groups with ratings, the attendance (entered, register and effective), dates, whether it is locked by publication, and
/// whether this person may enter. Null for a pupil or term that is not in the branch.
export async function traitSheet(actor: Actor, branchId: string, studentId: string, periodId: string) {
  const [student, period] = await Promise.all([
    prisma.studentRecord.findFirst({ where: { id: studentId, branchId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.academicPeriod.findFirst({
      where: { id: periodId, branchId },
      select: { id: true, sessionId: true, label: true, startDate: true, endDate: true },
    }),
  ]);
  if (!student || !period) return null;
  const arm = await placement(branchId, studentId, period.sessionId);
  const [traits, attendance, dates, locked, canEdit] = await Promise.all([
    traitView(branchId, studentId, periodId, arm?.classGroup.id ?? null),
    attendanceView(branchId, studentId, period),
    termDates(branchId, period),
    published(branchId, studentId, periodId),
    mayEnter(actor, branchId, arm?.classTeacherId ?? null),
  ]);
  return {
    student: { id: student.id, name: `${student.firstName} ${student.lastName}` },
    period: { id: period.id, label: period.label },
    class: arm ? { group: arm.classGroup.name, arm: arm.name } : null,
    template: traits.template,
    groups: traits.groups,
    attendance,
    dates,
    locked,
    canEdit: canEdit && !locked,
  };
}

async function guard(actor: Actor, branchId: string, studentId: string, periodId: string) {
  const [student, period] = await Promise.all([
    prisma.studentRecord.findFirst({ where: { id: studentId, branchId }, select: { id: true } }),
    prisma.academicPeriod.findFirst({ where: { id: periodId, branchId }, select: { id: true, sessionId: true } }),
  ]);
  if (!student || !period) throw new ConflictError("That student or term does not exist in this branch.");
  const arm = await placement(branchId, studentId, period.sessionId);
  if (!(await mayEnter(actor, branchId, arm?.classTeacherId ?? null)))
    throw new ForbiddenError("Only an administrator or this pupil's class teacher can enter these.");
  if (await published(branchId, studentId, periodId))
    throw new ConflictError("This student's results for the term are already published, so these can't change.");
  return { period, classGroupId: arm?.classGroup.id ?? null };
}

/// Saves ratings: each `{ traitId, rating }` sets it, a null rating clears it. All or nothing. The traits must be live traits of the pupil's own template.
export async function saveRatings(actor: Actor, branchId: string, studentId: string, input: z.infer<typeof ratingsInput>) {
  const { classGroupId } = await guard(actor, branchId, studentId, input.periodId);
  const template = await templateForClass(branchId, classGroupId);
  const traits = await prisma.resultTemplateTrait.findMany({
    where: { branchId, templateId: template.id, archivedAt: null },
    select: { id: true },
  });
  const bad = checkRatings(input.ratings, new Set(traits.map((t) => t.id)));
  if (bad) throw new ConflictError(RATING_MESSAGES[bad.problem]);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.traitRating.findMany({
      where: { branchId, studentId, periodId: input.periodId, traitId: { in: input.ratings.map((r) => r.traitId) } },
      select: { traitId: true, rating: true },
    });
    const before = new Map(existing.map((r) => [r.traitId, r.rating]));
    let set = 0;
    let cleared = 0;
    const changed: { traitId: string; from: number | null; to: number | null }[] = [];
    for (const r of input.ratings) {
      const was = before.get(r.traitId) ?? null;
      if (was === r.rating) continue;
      if (r.rating === null) {
        await tx.traitRating.deleteMany({ where: { studentId, periodId: input.periodId, traitId: r.traitId, branchId } });
        cleared++;
      } else {
        await tx.traitRating.upsert({
          where: { studentId_periodId_traitId: { studentId, periodId: input.periodId, traitId: r.traitId } },
          create: { branchId, studentId, periodId: input.periodId, traitId: r.traitId, rating: r.rating, updatedByUserId: actor.userId },
          update: { rating: r.rating, updatedByUserId: actor.userId },
        });
        set++;
      }
      changed.push({ traitId: r.traitId, from: was, to: r.rating });
    }
    if (changed.length > 0)
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "TRAIT_RATINGS_SAVED",
          targetType: "StudentRecord",
          targetId: studentId,
          afterValue: { branchId, periodId: input.periodId, templateId: template.id, set, cleared, changed } as Prisma.InputJsonValue,
        },
      });
    return { set, cleared };
  });
}

/// Saves the entered attendance numbers for the term: a number sets it, null clears it back to the register's, a field left out is unchanged. The final set is validated as a whole.
export async function saveAttendance(actor: Actor, branchId: string, studentId: string, input: z.infer<typeof attendanceInput>) {
  await guard(actor, branchId, studentId, input.periodId);
  const current = await prisma.reportAttendance.findUnique({ where: { studentId_periodId: { studentId, periodId: input.periodId } } });
  const next: AttendanceNumbers = {
    timesOpen: input.timesOpen !== undefined ? input.timesOpen : (current?.timesOpen ?? null),
    timesPresent: input.timesPresent !== undefined ? input.timesPresent : (current?.timesPresent ?? null),
    timesAbsent: input.timesAbsent !== undefined ? input.timesAbsent : (current?.timesAbsent ?? null),
  };
  const bad = checkAttendance(next);
  if (bad) throw new ConflictError(ATTENDANCE_MESSAGES[bad]);
  const before: AttendanceNumbers = {
    timesOpen: current?.timesOpen ?? null,
    timesPresent: current?.timesPresent ?? null,
    timesAbsent: current?.timesAbsent ?? null,
  };
  if (JSON.stringify(before) === JSON.stringify(next)) return { changed: false, entered: next };
  return prisma.$transaction(async (tx) => {
    if (next.timesOpen === null && next.timesPresent === null && next.timesAbsent === null)
      await tx.reportAttendance.deleteMany({ where: { studentId, periodId: input.periodId, branchId } });
    else
      await tx.reportAttendance.upsert({
        where: { studentId_periodId: { studentId, periodId: input.periodId } },
        create: { branchId, studentId, periodId: input.periodId, ...next, updatedByUserId: actor.userId },
        update: { ...next, updatedByUserId: actor.userId },
      });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "REPORT_ATTENDANCE_SAVED",
        targetType: "StudentRecord",
        targetId: studentId,
        beforeValue: before as Prisma.InputJsonValue,
        afterValue: { branchId, periodId: input.periodId, ...next } as Prisma.InputJsonValue,
      },
    });
    return { changed: true, entered: next };
  });
}
