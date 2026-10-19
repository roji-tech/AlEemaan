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
import { ResultStatus, AttendanceStatus, InvoiceStatus, AssignmentStatus, QuizStatus } from "@prisma/client";
import { submitAssignment, attemptQuiz } from "@/lib/lms/service";
import { reportCardVisibleTo } from "@/lib/academics/report-card";

export interface PortalAuthResult {
  success: boolean;
  error?: string;
  sessionToken?: string;
  student?: Record<string, unknown>;
  siblingStudents?: Record<string, unknown>[];
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
  const siblingIds = await findSiblingStudentIds(primaryStudent);

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

  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    primaryStudentId: primaryStudent.id,
    allowedStudentIds: siblingStudents.map((s) => s.id),
    guardianPhone: primaryStudent.guardianPhone,
    guardianEmail: primaryStudent.guardianEmail,
    issuedAt: now,
    expiresAt: now + PORTAL_SESSION_MAX_AGE_SECONDS,
  };

  const sessionToken = signPortalSession(payload);

  return {
    success: true,
    sessionToken,
    student: primaryStudent,
    siblingStudents,
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

  const siblingIds = await findSiblingStudentIds(student);

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

  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    primaryStudentId: student.id,
    allowedStudentIds: siblingStudents.map((s) => s.id),
    guardianPhone: student.guardianPhone,
    guardianEmail: student.guardianEmail,
    issuedAt: now,
    expiresAt: now + PORTAL_SESSION_MAX_AGE_SECONDS,
  };

  const sessionToken = signPortalSession(payload);

  return {
    success: true,
    sessionToken,
    student,
    siblingStudents,
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
export async function getStudentPortalOverview(studentId: string, allowedStudentIds: string[]) {
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
    finance: {
      totalInvoiced,
      totalPaid,
      outstandingBalance,
      hasOutstanding: outstandingBalance > 0,
    },
    announcements,
  };
}

/**
 * Retrieves published academic results and report cards for a student.
 */
export async function getStudentPortalResults(studentId: string, allowedStudentIds: string[]) {
  if (!allowedStudentIds.includes(studentId)) {
    throw new Error("UNAUTHORIZED_STUDENT_ACCESS");
  }

  const canView = await reportCardVisibleTo(studentId, { kind: "portal" });
  if (!canView) {
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
      status: AssignmentStatus.PUBLISHED,
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
      // Past the deadline with late work not allowed: the pupil sees it, but the form is closed (the server refuses it too).
      closed: Boolean(a.dueDate && a.dueDate.getTime() < now && !a.allowLate),
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
      status: AssignmentStatus.PUBLISHED,
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
