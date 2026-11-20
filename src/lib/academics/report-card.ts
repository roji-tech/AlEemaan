import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSchoolSettings } from "@/lib/settings/school-settings";
import { profileFor } from "@/lib/settings/branch-profile";
import { ConflictError, audit } from "@/lib/academics/structure";
import { contentHash } from "@/lib/academics/results-workflow";
import { averageHundredths, orderBySubjectAdded, percentHundredths, publicName, rankAverages } from "@/lib/academics/report-card-rules";
import { getVerificationPageConfig } from "@/lib/settings/approvals";
import { layoutForClass } from "@/lib/results/templates";
import { cardExtras, enrolledPlace } from "@/lib/results/report-traits";
import { annualFigures } from "@/lib/results/report-traits-rules";
import { NOT_DRAFT } from "@/lib/drafts/live";

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

export type ReportCardViewer = { kind: "staff" } | { kind: "portal" } | { kind: "student_or_guardian"; userId?: string };

/// May this viewer see this student's report card?
/// Staff viewers (teachers or administrators of the branch) always may.
/// Non-staff viewers (portal, students, guardians) are subject to the superadmin setting `block_unpaid_report_cards` (default OFF).
/// When enabled, an outstanding fee balance on non-cancelled invoices blocks report card access.
export async function reportCardVisibleTo(studentId: string, viewer: ReportCardViewer, periodId?: string): Promise<boolean> {
  if (viewer.kind === "staff") return true;

  const setting = await prisma.settingValue.findFirst({
    where: {
      scope: "GLOBAL",
      key: "block_unpaid_report_cards",
      status: "APPROVED",
    },
  });

  const blockUnpaid =
    setting?.value === true ||
    (typeof setting?.value === "object" && setting?.value !== null && (setting.value as { enabled?: boolean }).enabled === true);

  if (!blockUnpaid) return true;

  const whereClause: {
    studentId: string;
    status: { not: "CANCELLED" };
    periodId?: string;
  } = {
    studentId,
    status: { not: "CANCELLED" },
  };
  if (periodId) {
    whereClause.periodId = periodId;
  }

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    select: { totalAmount: true, amountPaid: true },
  });

  if (invoices.length === 0) return true;

  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
  const hasOutstanding = totalInvoiced > totalPaid;

  return !hasOutstanding;
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
      classArm: { select: { name: true, classGroup: { select: { id: true, name: true, gradeLabel: true } } } },
      scale: { include: { bands: { orderBy: { minScore: "asc" } } } },
    },
    orderBy: [{ subject: { name: "asc" } }, { id: "asc" }],
  });
  const first = rows[0];
  // The order the school's subjects were added to the class, not the alphabet (task 0116).
  const offered = first
    ? await prisma.subjectOffering.findMany({
        where: { branchId, classGroupId: first.classArm.classGroup.id },
        select: { subjectId: true, createdAt: true },
      })
    : [];
  const ordered = orderBySubjectAdded(rows, new Map(offered.map((o) => [o.subjectId, o.createdAt.getTime()])));
  const subjects = ordered.map((r) => ({
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
      where: { branchId, periodId, classArmId: first.classArmId, student: NOT_DRAFT, ...(statuses ? { status: statuses } : {}) },
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

  // Task 0116: the printed columns for the earlier terms of the session and the annual figures, the pupil's position in each subject, and the sections the school's cards carry beyond the
  // marks (trait ratings, attendance, the term's dates). The terms counted are this one and the ones before it in the session; the same statuses as the card itself.
  const termPeriods = await prisma.academicPeriod.findMany({
    where: { branchId, sessionId: period.sessionId, archivedAt: null, ordinal: { lte: period.ordinal } },
    orderBy: { ordinal: "desc" },
    select: { id: true, ordinal: true, label: true },
  });
  const [termRows, subjectPool, extras] = await Promise.all([
    prisma.result.findMany({
      where: { branchId, studentId, periodId: { in: termPeriods.map((t) => t.id) }, ...(statuses ? { status: statuses } : {}) },
      select: { subjectId: true, periodId: true, total: true, maxScore: true },
    }),
    first
      ? prisma.result.findMany({
          where: {
            branchId,
            periodId,
            classArmId: first.classArmId,
            subjectId: { in: rows.map((r) => r.subjectId) },
            ...(statuses ? { status: statuses } : {}),
          },
          select: { subjectId: true, studentId: true, total: true },
        })
      : Promise.resolve([]),
    cardExtras(branchId, studentId, period),
  ]);
  const detailed = subjects.map((s) => {
    const mine = termPeriods.map((t) => {
      const r = termRows.find((x) => x.subjectId === s.subjectId && x.periodId === t.id);
      return { ordinal: t.ordinal, label: t.label, total: r ? num(r.total) : null, max: r ? num(r.maxScore) : null };
    });
    const ranked = rankAverages(
      subjectPool.filter((p) => p.subjectId === s.subjectId).map((p) => ({ id: p.studentId, average: num(p.total) })),
    );
    const place = ranked.get(studentId);
    return {
      ...s,
      termScores: mine.map((t) => ({ ordinal: t.ordinal, label: t.label, total: t.total })),
      ...annualFigures(mine),
      position: place?.position ?? null,
      classSize: place?.size ?? null,
    };
  });

  // The details printed in the header are THIS branch's (task 0115): its own principal, motto, address and phone where it has set them, the school's where it has not. The school's name
  // stays school-wide.
  // Before any result exists the card still knows the pupil's class and look from their enrolment for the term's session.
  const enrolled = first ? null : await enrolledPlace(branchId, studentId, period.sessionId);
  const [profile, remarks, layout] = await Promise.all([
    profileFor(branchId),
    prisma.reportRemark.findUnique({ where: { studentId_periodId: { studentId, periodId } } }),
    // The look comes from the class's result template (task 0116), else the branch's standard layout.
    layoutForClass(branchId, first?.classArm.classGroup.id ?? enrolled?.classGroup.id ?? null),
  ]);
  return {
    school: {
      name: profile.schoolName,
      principal: profile.values.principal,
      motto: profile.values.motto,
      address: profile.values.address,
      phone: profile.values.phone,
    },
    branch,
    student: {
      id: student.id,
      name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
      admissionNo: student.admissionNo,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : null,
    },
    class: first
      ? { group: first.classArm.classGroup.name, arm: first.classArm.name, gradeLabel: first.classArm.classGroup.gradeLabel }
      : enrolled
        ? { group: enrolled.classGroup.name, arm: enrolled.name, gradeLabel: enrolled.classGroup.gradeLabel }
        : null,
    period: { id: period.id, label: period.label, session: period.session.label },
    subjects: detailed,
    summary,
    traits: extras.traits,
    attendance: extras.attendance,
    dates: extras.dates,
    remarks: { teacher: remarks?.teacherRemark ?? null, principal: remarks?.principalRemark ?? null },
    legend: first ? first.scale.bands.map((b) => ({ min: num(b.minScore), max: num(b.maxScore), letter: b.letter, remark: b.remark })) : [],
    allPublished: subjects.length > 0 && subjects.every((s) => (PUBLISHED as readonly string[]).includes(s.status)),
    preview: includeUnpublished,
    layout,
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
      branch: { select: { id: true, name: true } },
      classArm: { select: { name: true, classGroup: { select: { name: true } } } },
      period: { select: { label: true, session: { select: { label: true } } } },
    },
  });
  if (!r || !r.publishedAt || !(PUBLISHED as readonly string[]).includes(r.status)) return null;
  // Tamper evidence: the stored hash must still match the content. A mismatch is reported as "does not match", not as genuine.
  const intact = r.verificationHash === contentHash(r, r.publishedAt);
  const [school, config] = await Promise.all([getSchoolSettings(), getVerificationPageConfig(r.branch.id)]);

  // Bare minimum guaranteed fields
  const verification: Record<string, unknown> = {
    genuine: intact,
    school: school.name,
    branch: r.branch.name,
    className: `${r.classArm.classGroup.name} ${r.classArm.name}`,
    period: `${r.period.label}, ${r.period.session.label}`,
    publishedAt: r.publishedAt.toISOString(),
  };

  // Configurable fields
  if (config.showPupilName) {
    if (config.pupilNameFormat === "FULL") {
      verification.pupil = `${r.student.firstName} ${r.student.lastName}`.trim();
    } else if (config.pupilNameFormat === "INITIALS") {
      const fInit = r.student.firstName ? `${r.student.firstName.charAt(0)}.` : "";
      const lInit = r.student.lastName ? `${r.student.lastName.charAt(0)}.` : "";
      verification.pupil = [fInit, lInit].filter(Boolean).join(" ");
    } else {
      // FIRST_LAST_INITIAL (default)
      verification.pupil = publicName(r.student.firstName, r.student.lastName);
    }
  }

  if (config.showSubject) {
    verification.subject = r.subject.name;
  }

  if (config.showMarks) {
    verification.finalScore = num(r.total);
  }

  if (config.showGrade) {
    verification.grade = r.gradeLetter;
  }

  return verification;
}
