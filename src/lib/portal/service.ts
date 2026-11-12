import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  findSiblingStudentIds,
  matchesDateOfBirth,
  matchesPhone,
  PORTAL_SESSION_MAX_AGE_SECONDS,
  PortalSessionPayload,
  signPortalSession,
  verifyPortalSession,
} from "./auth";
import { ResultStatus, AttendanceStatus, InvoiceStatus, MaterialStatus, QuizStatus } from "@prisma/client";
import { submitAssignment, attemptQuiz, PUPIL_VISIBLE_ASSIGNMENT_STATUSES } from "@/lib/lms/service";
import { reportCardVisibleTo } from "@/lib/academics/report-card";
import { accessFor, allowedTabs, type Access, type Actor } from "./access";
import { capForStanding, dayOf, studentStandingNow } from "@/lib/standing/rules";
import { getPortalAccess, getPortalAccessByBranch } from "./access-service";

export interface PortalAuthResult {
  success: boolean;
  error?: string;
  sessionToken?: string;
  student?: Record<string, unknown>;
  siblingStudents?: Record<string, unknown>[];
  /// Who signed in, and what each linked pupil's branch lets them do (task 0040).
  actor?: Actor;
  access?: Record<string, Access>;
}

/// Nothing at all: what a pupil gets when their standing leaves nothing to open (an expelled pupil, or an expelled child whose guardian has no invoices section).
export const NO_ACCESS: Access = {
  overview: false,
  results: false,
  invoices: false,
  materials: false,
  submitWork: false,
  takeQuizzes: false,
  siblings: false,
  practice: "NONE",
};

export const hasAnyAccess = (access: Access): boolean => allowedTabs(access).length > 0;

/// A pupil's record as the portal shows it: the standing that applies TODAY and the last day of a suspension (a day, "YYYY-MM-DD"), never the stored value or the reason (task 0045).
export function withStandingShown<S extends { standing?: string; standingUntil?: Date | null }>(student: S): Omit<S, "standing" | "standingUntil"> & { standing: string; standingUntil: string | null } {
  const now = studentStandingNow({ standing: student.standing ?? "ACTIVE", standingUntil: student.standingUntil ?? null }, dayOf(new Date()));
  return { ...student, standing: now, standingUntil: now === "SUSPENDED" && student.standingUntil ? dayOf(student.standingUntil) : null };
}

type Standing = { standing?: string; standingUntil?: Date | null };

/// What `actor` may do for each of these pupils: the settings of the pupil's own branch, narrowed by the pupil's standing today (task 0045: a suspended pupil cannot hand in work,
/// take quizzes or practise; an expelled pupil's guardian keeps the invoices; an expelled pupil keeps nothing). A standing only ever narrows.
export async function portalAccessFor(
  students: readonly ({ id: string; branchId: string } & Standing)[],
  actor: Actor,
): Promise<Record<string, Access>> {
  const byBranch = await getPortalAccessByBranch(students.map((student) => student.branchId));
  const todayDay = dayOf(new Date());
  return Object.fromEntries(
    students.map((student) => {
      const base = accessFor(byBranch.get(student.branchId)!, actor);
      const capped = capForStanding(base, actor, studentStandingNow({ standing: student.standing ?? "ACTIVE", standingUntil: student.standingUntil ?? null }, todayDay));
      return [student.id, capped ?? NO_ACCESS];
    }),
  );
}

/// The pupils of a family that this sign-in can open anything for, today (task 0045): those whose standing leaves something to open for this actor.
async function reachableStudents<S extends { id: string; branchId: string } & Standing>(students: readonly S[], actor: Actor): Promise<S[]> {
  const access = await portalAccessFor(students, actor);
  return students.filter((student) => hasAnyAccess(access[student.id]!));
}

/// The pupils this sign-in reaches: the pupil alone, or every pupil sharing the guardian's contact when the branch's setting for this actor allows siblings. (A later
/// change of the setting is also applied on every request: lib/portal/guard.ts.)
async function linkedStudentIds(student: { id: string; branchId: string; guardianPhone: string | null; guardianEmail: string | null }, actor: Actor): Promise<string[]> {
  const access = accessFor(await getPortalAccess(student.branchId), actor);
  return access.siblings ? findSiblingStudentIds(student) : [student.id];
}

/**
 * Authenticates a portal user using a one-time or persistent GuardianLinkToken.
 */
export async function authenticatePortalViaToken(token: string): Promise<PortalAuthResult> {
  const clean = token.trim();
  if (!clean) {
    return { success: false, error: "Token is required" };
  }

  const tokenHash = crypto.createHash("sha256").update(clean).digest("hex");
  const linkToken = await prisma.guardianLinkToken.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() },
    },
    include: {
      student: {
        include: {
          branch: true,
          enrollments: {
            where: { status: "ACTIVE" },
            include: { session: true, classArm: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!linkToken || !linkToken.student) {
    return { success: false, error: "Invalid or expired access token" };
  }

  // Stamp usedAt if not set
  if (!linkToken.usedAt) {
    await prisma.guardianLinkToken.update({
      where: { id: linkToken.id },
      data: { usedAt: new Date() },
    });
  }

  const primaryStudent = linkToken.student;
  const actor: Actor = "GUARDIAN"; // the link is sent to the guardian
  const siblingIds = await linkedStudentIds(primaryStudent, actor);

  const siblingStudents = await prisma.studentRecord.findMany({
    where: {
      id: { in: siblingIds },
      archivedAt: null,
    },
    include: {
      branch: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { session: true, classArm: true },
        take: 1,
      },
    },
  });

  const reachable = await reachableStudents(siblingStudents, actor);
  if (!reachable.some((candidate) => candidate.id === primaryStudent.id)) return { success: false, error: "Invalid or expired access token" };

  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    actor,
    primaryStudentId: primaryStudent.id,
    allowedStudentIds: reachable.map((s) => s.id),
    guardianPhone: primaryStudent.guardianPhone,
    guardianEmail: primaryStudent.guardianEmail,
    issuedAt: now,
    expiresAt: now + PORTAL_SESSION_MAX_AGE_SECONDS,
  };

  const sessionToken = signPortalSession(payload);

  return {
    success: true,
    sessionToken,
    student: withStandingShown(primaryStudent),
    siblingStudents: reachable.map(withStandingShown),
    actor,
    access: await portalAccessFor(reachable, actor),
  };
}

/**
 * Authenticates a portal user using Admission Number + Verification Secret (Date of Birth or Guardian Phone).
 */
/// The one answer to every failed admission-number sign-in: an unknown number, an archived pupil and a wrong secret all say this, so the wording (and, as far as one
/// extra lookup allows, the timing) never reveals which admission numbers exist. Found by the bug hunt of 2026-10-19: "No active student found with this admission
/// number" versus "Verification failed" confirmed every number to anyone who tried.
export const PORTAL_SIGNIN_FAILED = "Verification failed. Please check the admission number and the date of birth or guardian phone number.";

/// Admission numbers compare case-insensitively and EXACTLY. Not Prisma's `{ equals, mode: "insensitive" }`: that is an ILIKE, so `%` and `_` were wildcards: the
/// admission number "%" with one pupil's real guardian phone signed in as that pupil, without knowing any number, and "2026/00__" probed the numbering. A raw
/// `lower() = lower()` has no pattern syntax. A case-sensitive unique index lets "abc/1" and "ABC/1" coexist, so every match is tried (at most 5), not an arbitrary first.
async function activeStudentIdsByAdmissionNo(admissionNo: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "StudentRecord" WHERE lower("admissionNo") = lower(${admissionNo}) AND "archivedAt" IS NULL LIMIT 5`;
  return rows.map((row) => row.id);
}

export async function authenticatePortalViaAdmission(admissionNo: string, secret: string): Promise<PortalAuthResult> {
  const cleanAdmission = admissionNo.trim();
  const cleanSecret = secret.trim();

  if (!cleanAdmission || !cleanSecret) {
    return { success: false, error: PORTAL_SIGNIN_FAILED };
  }

  const students = await prisma.studentRecord.findMany({
    where: { id: { in: await activeStudentIdsByAdmissionNo(cleanAdmission) } },
    include: {
      branch: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { session: true, classArm: true },
        take: 1,
      },
    },
  });

  const student = students.find(
    (candidate) =>
      matchesDateOfBirth(cleanSecret, candidate.dateOfBirth) ||
      matchesPhone(cleanSecret, candidate.guardianPhone) ||
      (!!candidate.guardianEmail && candidate.guardianEmail.trim().toLowerCase() === cleanSecret.toLowerCase()),
  );

  if (!student) {
    return { success: false, error: PORTAL_SIGNIN_FAILED };
  }

  // The date of birth is the pupil's own; a phone number or an e-mail address is the guardian's.
  const actor: Actor = matchesDateOfBirth(cleanSecret, student.dateOfBirth) ? "PUPIL" : "GUARDIAN";
  const siblingIds = await linkedStudentIds(student, actor);

  const siblingStudents = await prisma.studentRecord.findMany({
    where: {
      id: { in: siblingIds },
      archivedAt: null,
    },
    include: {
      branch: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { session: true, classArm: true },
        take: 1,
      },
    },
  });

  // Task 0045: a pupil whose standing leaves nothing to open (an expelled pupil, signing in as the pupil) is refused with the one generic sentence, and a family's other children
  // who have nothing to open are not part of the sign-in. An expelled pupil's guardian still gets in, to the invoices only.
  const reachable = await reachableStudents(siblingStudents, actor);
  if (!reachable.some((candidate) => candidate.id === student.id)) return { success: false, error: PORTAL_SIGNIN_FAILED };

  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    actor,
    primaryStudentId: student.id,
    allowedStudentIds: reachable.map((s) => s.id),
    guardianPhone: student.guardianPhone,
    guardianEmail: student.guardianEmail,
    issuedAt: now,
    expiresAt: now + PORTAL_SESSION_MAX_AGE_SECONDS,
  };

  const sessionToken = signPortalSession(payload);

  return {
    success: true,
    sessionToken,
    student: withStandingShown(student),
    siblingStudents: reachable.map(withStandingShown),
    actor,
    access: await portalAccessFor(reachable, actor),
  };
}

/**
 * Resolves current portal session data and list of authorized students from cookie.
 */
export async function resolvePortalSessionData(cookieToken: string | undefined | null) {
  const payload = verifyPortalSession(cookieToken);
  if (!payload) return null;

  const students = await prisma.studentRecord.findMany({
    where: {
      id: { in: payload.allowedStudentIds },
      archivedAt: null,
    },
    include: {
      branch: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { session: true, classArm: true },
        take: 1,
      },
    },
  });

  if (students.length === 0) return null;

  // Ensure primary student is at index 0
  students.sort((a, b) => (a.id === payload.primaryStudentId ? -1 : b.id === payload.primaryStudentId ? 1 : 0));

  return {
    session: payload,
    students,
  };
}

/**
 * Retrieves the comprehensive overview for a verified student.
 */
/// `showFees`: whether this actor may see money (the branch's `invoices` setting for them). When not, the answer carries no fee total at all, not a hidden one (task 0040).
export async function getStudentPortalOverview(studentId: string, allowedStudentIds: string[], showFees: boolean) {
  if (!allowedStudentIds.includes(studentId)) {
    throw new Error("UNAUTHORIZED_STUDENT_ACCESS");
  }

  const student = await prisma.studentRecord.findUnique({
    where: { id: studentId },
    include: {
      branch: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: {
          session: true,
          classArm: {
            include: {
              classGroup: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!student || student.archivedAt) {
    throw new Error("STUDENT_NOT_FOUND");
  }

  // Attendance Statistics
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: { studentId },
    select: { status: true, date: true },
    orderBy: { date: "desc" },
  });

  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length;
  const lateDays = attendanceRecords.filter((r) => r.status === AttendanceStatus.LATE).length;
  const absentDays = attendanceRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length;
  const attendancePercentage = totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 100;

  // Invoices Summary
  const invoices = await prisma.invoice.findMany({
    where: {
      studentId,
      status: { not: InvoiceStatus.CANCELLED },
    },
    select: {
      totalAmount: true,
      amountPaid: true,
      status: true,
    },
  });

  let totalInvoiced = 0;
  let totalPaid = 0;
  for (const inv of invoices) {
    totalInvoiced += Number(inv.totalAmount);
    totalPaid += Number(inv.amountPaid);
  }
  const outstandingBalance = Math.max(0, totalInvoiced - totalPaid);

  // Recent Branch Announcements
  const announcements = await prisma.announcement.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ branchId: student.branchId }, { branchId: null }],
    },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
    },
  });

  return {
    student,
    attendance: {
      totalDays,
      presentDays,
      lateDays,
      absentDays,
      percentage: attendancePercentage,
      recent: attendanceRecords.slice(0, 10),
    },
    ...(showFees
      ? {
          finance: {
            totalInvoiced,
            totalPaid,
            outstandingBalance,
            hasOutstanding: outstandingBalance > 0,
          },
        }
      : {}),
    announcements,
  };
}

/**
 * Retrieves published academic results and report cards for a student.
 */
/// `showFees` as for the overview: an actor who may not see money is told the report card is not available yet, in words that name no amount, and the answer carries none.
export async function getStudentPortalResults(studentId: string, allowedStudentIds: string[], showFees: boolean) {
  if (!allowedStudentIds.includes(studentId)) {
    throw new Error("UNAUTHORIZED_STUDENT_ACCESS");
  }

  const canView = await reportCardVisibleTo(studentId, { kind: "portal" });
  if (!canView) {
    if (!showFees) {
      return {
        reportCards: [],
        blockedByUnpaidFees: true,
        message: "Your report card is not available yet. Please ask your guardian or the school office.",
      };
    }
    const invoices = await prisma.invoice.findMany({
      where: { studentId, status: { not: InvoiceStatus.CANCELLED } },
      select: { totalAmount: true, amountPaid: true },
    });
    const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
    const outstandingBalance = Math.max(0, totalInvoiced - totalPaid);

    return {
      reportCards: [],
      blockedByUnpaidFees: true,
      outstandingBalance,
      message: `Report card access is blocked due to an outstanding fee balance of ₦${outstandingBalance.toLocaleString()}. Please clear pending invoices under the Invoices tab to view academic report cards.`,
    };
  }

  const results = await prisma.result.findMany({
    where: {
      studentId,
      status: { in: [ResultStatus.PUBLISHED, ResultStatus.LOCKED] },
    },
    include: {
      subject: true,
      period: {
        include: {
          session: true,
        },
      },
      classArm: true,
    },
    orderBy: [{ period: { startDate: "desc" } }, { subject: { name: "asc" } }],
  });

  const remarks = await prisma.reportRemark.findMany({
    where: { studentId },
  });

  const remarkMap = new Map<string, { teacherRemark: string | null; principalRemark: string | null }>();
  for (const r of remarks) {
    remarkMap.set(r.periodId, {
      teacherRemark: r.teacherRemark,
      principalRemark: r.principalRemark,
    });
  }

  interface PeriodReportCard {
    period: (typeof results)[number]["period"];
    classArm: (typeof results)[number]["classArm"];
    results: Array<{
      id: string;
      subjectName: string;
      caTotal: number;
      examScore: number;
      total: number;
      maxScore: number;
      gradeLetter: string;
      gradeRemark: string;
      verificationToken: string | null;
    }>;
    remarks: { teacherRemark: string | null; principalRemark: string | null };
  }

  // Group by Period
  const periodMap = new Map<string, PeriodReportCard>();
  for (const res of results) {
    if (!periodMap.has(res.periodId)) {
      periodMap.set(res.periodId, {
        period: res.period,
        classArm: res.classArm,
        results: [],
        remarks: remarkMap.get(res.periodId) || { teacherRemark: null, principalRemark: null },
      });
    }
    periodMap.get(res.periodId)!.results.push({
      id: res.id,
      subjectName: res.subject.name,
      caTotal: Number(res.caTotal),
      examScore: Number(res.examScore),
      total: Number(res.total),
      maxScore: Number(res.maxScore),
      gradeLetter: res.gradeLetter,
      gradeRemark: res.gradeRemark,
      verificationToken: res.verificationToken,
    });
  }

  const reportCards = Array.from(periodMap.values()).map((p) => {
    const totalScore = p.results.reduce((acc: number, r) => acc + r.total, 0);
    const average = p.results.length > 0 ? Number((totalScore / p.results.length).toFixed(2)) : 0;
    return {
      period: p.period,
      classArm: p.classArm,
      results: p.results,
      remarks: p.remarks,
      totalScore,
      average,
      subjectCount: p.results.length,
    };
  });

  return { reportCards };
}

/**
 * Retrieves student invoices and payments with direct Paystack initialization details.
 */
export async function getStudentPortalInvoices(studentId: string, allowedStudentIds: string[]) {
  if (!allowedStudentIds.includes(studentId)) {
    throw new Error("UNAUTHORIZED_STUDENT_ACCESS");
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      studentId,
      status: { not: InvoiceStatus.CANCELLED },
    },
    include: {
      period: {
        include: { session: true },
      },
      payments: {
        orderBy: { createdAt: "desc" },
      },
      discounts: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { invoices };
}

/**
 * Retrieves student LMS coursework: published assignments and course materials.
 */
export async function getStudentPortalLms(studentId: string, allowedStudentIds: string[]) {
  if (!allowedStudentIds.includes(studentId)) {
    throw new Error("UNAUTHORIZED_STUDENT_ACCESS");
  }

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE" },
    include: {
      classArm: {
        include: { classGroup: true },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  if (!enrollment || !enrollment.classArmId) {
    return { assignments: [], materials: [], quizzes: [] };
  }

  const branchId = enrollment.branchId;
  const classArmId = enrollment.classArmId;
  const classGroupId = enrollment.classArm?.classGroupId || null;

  // Assignments
  const assignments = await prisma.assignment.findMany({
    where: {
      branchId,
      status: { in: PUPIL_VISIBLE_ASSIGNMENT_STATUSES },
      archivedAt: null,
      OR: [{ classArmId }, { classArmId: null, classGroupId: classGroupId }, { classArmId: null, classGroupId: null }],
    },
    include: {
      subject: true,
      submissions: {
        where: { studentId },
        take: 1,
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // Course Materials
  const materials = await prisma.learningMaterial.findMany({
    where: {
      branchId,
      status: MaterialStatus.PUBLISHED,
      archivedAt: null,
      OR: [...(classGroupId ? [{ classGroupId }] : []), { classGroupId: null }],
    },
    include: {
      subject: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Quizzes: published, for the whole branch or this class group. The answer key never leaves the server; the last attempt's result does.
  const quizzes = await prisma.quiz.findMany({
    where: {
      branchId,
      status: QuizStatus.PUBLISHED,
      archivedAt: null,
      OR: [...(classGroupId ? [{ classGroupId }] : []), { classGroupId: null }],
    },
    include: {
      subject: true,
      questions: { orderBy: { sortOrder: "asc" } },
      attempts: { where: { studentId }, orderBy: { completedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  return {
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      instructions: a.instructions,
      subjectName: a.subject.name,
      dueDate: a.dueDate,
      totalPoints: a.totalPoints,
      // Closed by the teacher, or past the deadline with late work not allowed: the pupil sees it, but the form is closed (the server refuses it too).
      closed: a.status === "CLOSED" || Boolean(a.dueDate && a.dueDate.getTime() < now && !a.allowLate),
      closedBy: a.status === "CLOSED" ? "TEACHER" : a.dueDate && a.dueDate.getTime() < now && !a.allowLate ? "DEADLINE" : null,
      submission: a.submissions[0] || null,
    })),
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      instructions: q.instructions,
      subjectName: q.subject.name,
      timeLimitMinutes: q.timeLimitMinutes,
      passingScore: q.passingScore,
      questions: q.questions.map((x) => ({ id: x.id, prompt: x.prompt, questionType: x.questionType, options: x.options, points: x.points })),
      lastAttempt: q.attempts[0] ? { score: q.attempts[0].score, isPassed: q.attempts[0].isPassed, completedAt: q.attempts[0].completedAt } : null,
    })),
    materials: materials.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      subjectName: m.subject.name,
      content: m.content,
      attachments: m.attachments,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * What a verified pupil may hand in: their active enrolment fixes the branch and the class, so a pupil can only reach coursework meant for them.
 */
async function pupilScope(studentId: string, allowedStudentIds: string[]) {
  if (!allowedStudentIds.includes(studentId)) throw new PortalLmsError("You are not authorized to act for this student", 403);
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE" },
    include: { classArm: true },
    orderBy: { enrolledAt: "desc" },
  });
  if (!enrollment || !enrollment.classArmId) throw new PortalLmsError("This pupil is not in a class yet", 400);
  return { branchId: enrollment.branchId, classArmId: enrollment.classArmId, classGroupId: enrollment.classArm?.classGroupId ?? null };
}

export class PortalLmsError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404,
  ) {
    super(message);
  }
}

export async function submitPortalAssignment(
  studentId: string,
  allowedStudentIds: string[],
  assignmentId: string,
  params: { content?: string | null; attachments: { title: string; url: string }[] },
) {
  const scope = await pupilScope(studentId, allowedStudentIds);
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      branchId: scope.branchId,
      status: { in: PUPIL_VISIBLE_ASSIGNMENT_STATUSES },
      archivedAt: null,
      OR: [{ classArmId: scope.classArmId }, { classArmId: null, classGroupId: scope.classGroupId }, { classArmId: null, classGroupId: null }],
    },
    select: { id: true },
  });
  if (!assignment) throw new PortalLmsError("That assignment is not available to this pupil", 404);

  const earlier = await prisma.assignmentSubmission.findFirst({ where: { branchId: scope.branchId, assignmentId, studentId }, select: { status: true } });
  if (earlier?.status === "GRADED") throw new PortalLmsError("This work has already been marked, so it can no longer be changed", 400);

  return submitAssignment(scope.branchId, assignmentId, studentId, params);
}

export async function attemptPortalQuiz(studentId: string, allowedStudentIds: string[], quizId: string, answers: { questionId: string; answer: string }[]) {
  const scope = await pupilScope(studentId, allowedStudentIds);
  const quiz = await prisma.quiz.findFirst({
    where: {
      id: quizId,
      branchId: scope.branchId,
      status: QuizStatus.PUBLISHED,
      archivedAt: null,
      OR: [...(scope.classGroupId ? [{ classGroupId: scope.classGroupId }] : []), { classGroupId: null }],
    },
    select: { id: true },
  });
  if (!quiz) throw new PortalLmsError("That quiz is not available to this pupil", 404);

  const attempt = await attemptQuiz(scope.branchId, quizId, studentId, answers);
  const totalPoints = (await prisma.quizQuestion.aggregate({ where: { branchId: scope.branchId, quizId }, _sum: { points: true } }))._sum.points ?? 0;
  return { score: attempt.score, isPassed: attempt.isPassed, totalPoints };
}
