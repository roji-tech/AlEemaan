import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSchoolSettings } from "@/lib/settings/school-settings";
import { ConflictError, audit } from "@/lib/academics/structure";
import { contentHash } from "@/lib/academics/results-workflow";
import { averageHundredths, percentHundredths, publicName, rankAverages } from "@/lib/academics/report-card-rules";

// Results, Slice P2c: the REPORT CARD (computed, never stored), the teacher's and principal's remarks, and the public verification of one published result.
// The caller's authority over the BRANCH was checked by `withBranch` in the route (ADR 0015). Outside staff only ever see PUBLISHED / LOCKED results; an
// administrator may preview a card with the unpublished ones too.

const num = (v: { toString(): string }) => Number(v.toString());
const PUBLISHED = ["PUBLISHED", "LOCKED"] as const;

export const cardQuery = z.object({ periodId: z.string().min(1), preview: z.enum(["true", "false"]).optional() });
const remark = z
  .string()
  .trim()
  .max(500, "Use at most 500 characters.")
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));
export const remarksInput = z.strictObject({ periodId: z.string().min(1), teacherRemark: remark, principalRemark: remark });

/// The place the payment gate will plug into (plan decision 8): may this viewer see this student's report card? Today everyone who reaches it may - the superadmin
/// setting that blocks unpaid fees is added with finance slice F3, here, in one place. `staff` viewers (a teacher or administrator of the branch) always may.
export async function reportCardVisibleTo(studentId: string, viewer: { kind: "staff" }): Promise<boolean> {
  void studentId;
  return viewer.kind === "staff";
}

/// The branch a student belongs to (null for an unknown id) - what `withBranch({ of })` looks up for a student route.
export const studentBranch = async (studentId: string) =>
  (await prisma.studentRecord.findUnique({ where: { id: studentId }, select: { branchId: true } }))?.branchId ?? null;

export async function getReportCard(branchId: string, studentId: string, periodId: string, includeUnpublished: boolean) {
  const [student, period, branch] = await Promise.all([
    prisma.studentRecord.findFirst({ where: { id: studentId, branchId } }),
    prisma.academicPeriod.findFirst({ where: { id: periodId, branchId }, include: { session: { select: { label: true } } } }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } }),
  ]);
  if (!student || !period || !branch) return null;
  const statuses = includeUnpublished ? undefined : { in: [...PUBLISHED] };
  const rows = await prisma.result.findMany({
    where: { branchId, studentId, periodId, ...(statuses ? { status: statuses } : {}) },
    include: {
      subject: { select: { name: true } },
      classArm: { select: { name: true, classGroup: { select: { name: true } } } },
      scale: { include: { bands: { orderBy: { minScore: "asc" } } } },
    },
    orderBy: [{ subject: { name: "asc" } }, { id: "asc" }],
  });
  const first = rows[0];
  const subjects = rows.map((r) => ({
    subjectId: r.subjectId,
    name: r.subject.name,
    parts: (r.componentScores as { name: string; max: number; score: number }[]).map((p) => ({ name: p.name, max: p.max, score: p.score })),
    caTotal: num(r.caTotal),
    exam: num(r.examScore),
    examMax: num(r.examMax),
    total: num(r.total),
    max: num(r.maxScore),
    percent: (percentHundredths(num(r.total), num(r.maxScore)) ?? 0) / 100,
    gradeLetter: r.gradeLetter,
    gradeRemark: r.gradeRemark,
    status: r.status,
    /// Only a published result has one; shown to staff so the printed card can carry the verification link.
    verificationToken: r.verificationToken,
  }));

  // Position among the arm's students for this term, counting the same kind of results as this card (published ones, or all in a preview).
  let summary: {
    subjectCount: number;
    totalScore: number;
    totalMax: number;
    average: number | null;
    position: number | null;
    classSize: number | null;
  } = {
    subjectCount: subjects.length,
    totalScore: Math.round(subjects.reduce((t, s) => t + s.total, 0) * 100) / 100,
    totalMax: Math.round(subjects.reduce((t, s) => t + s.max, 0) * 100) / 100,
    average: null,
    position: null,
    classSize: null,
  };
  const avg = averageHundredths(subjects.map((s) => ({ total: s.total, max: s.max })));
  if (first && avg !== null) {
    const pool = await prisma.result.findMany({
      where: { branchId, periodId, classArmId: first.classArmId, ...(statuses ? { status: statuses } : {}) },
      select: { studentId: true, total: true, maxScore: true },
    });
    const byStudent = new Map<string, { total: number; max: number }[]>();
    for (const r of pool)
      byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), { total: num(r.total), max: num(r.maxScore) }]);
    const ranked = [...byStudent].flatMap(([id, list]) => {
      const a = averageHundredths(list);
      return a === null ? [] : [{ id, average: a }];
    });
    const mine = rankAverages(ranked).get(studentId);
    summary = { ...summary, average: avg / 100, position: mine?.position ?? null, classSize: mine?.size ?? null };
  }

  const [school, remarks] = await Promise.all([
    getSchoolSettings(),
    prisma.reportRemark.findUnique({ where: { studentId_periodId: { studentId, periodId } } }),
  ]);
  return {
    school: { name: school.name, principal: school.principal, motto: school.motto, address: school.address, phone: school.phone },
    branch,
    student: {
      id: student.id,
      name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
      admissionNo: student.admissionNo,
      gender: student.gender,
    },
    class: first ? { group: first.classArm.classGroup.name, arm: first.classArm.name } : null,
    period: { id: period.id, label: period.label, session: period.session.label },
    subjects,
    summary,
    remarks: { teacher: remarks?.teacherRemark ?? null, principal: remarks?.principalRemark ?? null },
    legend: first ? first.scale.bands.map((b) => ({ min: num(b.minScore), max: num(b.maxScore), letter: b.letter, remark: b.remark })) : [],
    allPublished: subjects.length > 0 && subjects.every((s) => (PUBLISHED as readonly string[]).includes(s.status)),
    preview: includeUnpublished,
  };
}

/// Saves the remarks for one student and term. Refused (409) once any of the student's results for that term is published - the card is then a record.
export async function saveRemarks(actorUserId: string, branchId: string, studentId: string, input: z.infer<typeof remarksInput>) {
  const [student, period] = await Promise.all([
    prisma.studentRecord.findFirst({ where: { id: studentId, branchId }, select: { id: true } }),
    prisma.academicPeriod.findFirst({ where: { id: input.periodId, branchId }, select: { id: true } }),
  ]);
  if (!student || !period) throw new ConflictError("That student or term does not exist in this branch.");
  const published = await prisma.result.count({ where: { branchId, studentId, periodId: input.periodId, status: { in: [...PUBLISHED] } } });
  if (published > 0) throw new ConflictError("This student's results for the term are already published, so the remarks can't change.");
  const data = { teacherRemark: input.teacherRemark ?? null, principalRemark: input.principalRemark ?? null, updatedByUserId: actorUserId };
  const saved = await prisma.reportRemark.upsert({
    where: { studentId_periodId: { studentId, periodId: input.periodId } },
    create: { branchId, studentId, periodId: input.periodId, ...data },
    update: data,
  });
  await audit(actorUserId, "REPORT_REMARKS_SAVED", "ReportRemark", saved.id, {
    studentId,
    periodId: input.periodId,
    teacher: data.teacherRemark !== null,
    principal: data.principalRemark !== null,
  });
  return { teacher: saved.teacherRemark, principal: saved.principalRemark };
}

/// What the public may learn from a verification token: that one published result is genuine, and nothing about the scores. `null` for a token that does not exist,
/// was never issued, or has been withdrawn (an unlock clears it) - the same answer for all three.
export async function verifyToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const r = await prisma.result.findUnique({
    where: { verificationToken: token },
    include: {
      student: { select: { firstName: true, lastName: true } },
      subject: { select: { name: true } },
      branch: { select: { name: true } },
      classArm: { select: { name: true, classGroup: { select: { name: true } } } },
      period: { select: { label: true, session: { select: { label: true } } } },
    },
  });
  if (!r || !r.publishedAt || !(PUBLISHED as readonly string[]).includes(r.status)) return null;
  // Tamper evidence: the stored hash must still match the content. A mismatch is reported as "does not match", not as genuine.
  const intact = r.verificationHash === contentHash(r, r.publishedAt);
  const school = await getSchoolSettings();
  return {
    genuine: intact,
    school: school.name,
    branch: r.branch.name,
    className: `${r.classArm.classGroup.name} ${r.classArm.name}`,
    period: `${r.period.label}, ${r.period.session.label}`,
    subject: r.subject.name,
    publishedAt: r.publishedAt.toISOString(),
    pupil: publicName(r.student.firstName, r.student.lastName),
  };
}
