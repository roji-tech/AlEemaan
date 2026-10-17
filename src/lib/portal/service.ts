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
import { ResultStatus, AttendanceStatus, InvoiceStatus, AssignmentStatus } from "@prisma/client";

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
export async function authenticatePortalViaAdmission(admissionNo: string, secret: string): Promise<PortalAuthResult> {
  const cleanAdmission = admissionNo.trim();
  const cleanSecret = secret.trim();

  if (!cleanAdmission || !cleanSecret) {
    return { success: false, error: "Admission number and verification secret are required" };
  }

  const student = await prisma.studentRecord.findFirst({
    where: {
      admissionNo: { equals: cleanAdmission, mode: "insensitive" },
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

  if (!student) {
    return { success: false, error: "No active student found with this admission number" };
  }

  const dobMatched = matchesDateOfBirth(cleanSecret, student.dateOfBirth);
  const phoneMatched = matchesPhone(cleanSecret, student.guardianPhone);
  const emailMatched = !!student.guardianEmail && student.guardianEmail.trim().toLowerCase() === cleanSecret.toLowerCase();

  if (!dobMatched && !phoneMatched && !emailMatched) {
    return {
      success: false,
      error: "Verification failed. Please check the date of birth or guardian phone number.",
    };
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
    return { assignments: [], materials: [] };
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
      OR: [{ classArmId }, { classArmId: null }],
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

  return {
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      subjectName: a.subject.name,
      dueDate: a.dueDate,
      totalPoints: a.totalPoints,
      submission: a.submissions[0] || null,
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
