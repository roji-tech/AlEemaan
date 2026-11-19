import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  matchesDateOfBirth,
  matchesPhone,
  PORTAL_SESSION_MAX_AGE_SECONDS,
  PortalSessionPayload,
  signPortalSession,
  verifyPortalSession,
} from "./auth";
import { ResultStatus, AttendanceStatus, InvoiceStatus, MaterialStatus, QuizStatus } from "@prisma/client";
import { submitAssignment, attemptQuiz, PUPIL_VISIBLE_ASSIGNMENT_STATUSES } from "@/lib/lms/service";
import { getReportCard, reportCardVisibleTo, studentBranch } from "@/lib/academics/report-card";
import { accessFor, allowedTabs, type Access, type Actor } from "./access";
import { paidByScholarship } from "@/lib/scholarships/rules";
import { capForStanding, dayOf, studentStandingNow } from "@/lib/standing/rules";
import { getPortalAccess, getPortalAccessByBranch } from "./access-service";
import { verifyAccessCode, type Door } from "./door";

export interface PortalAuthResult {
  success: boolean;
  error?: string;
  /// "LOGIN_CLOSED": the secret was right, but sign-in for this family's branch is switched off (task 0113, said plainly only after the secret).
  code?: "LOGIN_CLOSED";
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

/// A pupil's record as the portal shows it: the standing that applies TODAY and the last day of a suspension (a day, "YYYY-MM-DD"), never the stored value or the reason (task 0045), and
/// never the access code's hash (task 0113 D7).
export function withStandingShown<S extends { standing?: string; standingUntil?: Date | null; pupilCodeHash?: string | null }>(
  student: S,
): Omit<S, "standing" | "standingUntil" | "pupilCodeHash"> & { standing: string; standingUntil: string | null } {
  const now = studentStandingNow(
    { standing: student.standing ?? "ACTIVE", standingUntil: student.standingUntil ?? null },
    dayOf(new Date()),
  );
  const { pupilCodeHash, ...rest } = student;
  void pupilCodeHash;
  return {
    ...(rest as Omit<S, "standing" | "standingUntil" | "pupilCodeHash">),
    standing: now,
    standingUntil: now === "SUSPENDED" && student.standingUntil ? dayOf(student.standingUntil) : null,
  };
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
      const capped = capForStanding(
        base,
        actor,
        studentStandingNow({ standing: student.standing ?? "ACTIVE", standingUntil: student.standingUntil ?? null }, todayDay),
      );
      return [student.id, capped ?? NO_ACCESS];
    }),
  );
}

/// The pupils of a family that this sign-in can open anything for, today (task 0045): those whose standing leaves something to open for this actor.
async function reachableStudents<S extends { id: string; branchId: string } & Standing>(
  students: readonly S[],
  actor: Actor,
): Promise<S[]> {
  const access = await portalAccessFor(students, actor);
  return students.filter((student) => hasAnyAccess(access[student.id]!));
}

/// The children a guardian's sign-in reaches (task 0113 D5, D6): their links that are not blocked, to pupils who are not archived. Read on every request, so a link made or blocked later
/// shows at once.
export async function guardianChildIds(guardianId: string): Promise<string[]> {
  const rows = await prisma.studentGuardian.findMany({
    where: { guardianId, blockedAt: null, student: { archivedAt: null } },
    select: { studentId: true },
    orderBy: { createdAt: "asc" },
  });
  return [...new Set(rows.map((r) => r.studentId))];
}

/// The pupils a pupil's sign-in may reach when their branch lets pupils see brothers and sisters: the pupil and every live pupil who shares an ALLOWED guardian with them (both links not
/// blocked). The explicit links replace the old guess by a shared phone or e-mail (ISS-0022).
export async function pupilSiblingIds(studentId: string): Promise<string[]> {
  const mine = await prisma.studentGuardian.findMany({
    where: { studentId, blockedAt: null, guardian: { archivedAt: null } },
    select: { guardianId: true },
  });
  if (mine.length === 0) return [studentId];
  const rows = await prisma.studentGuardian.findMany({
    where: { guardianId: { in: mine.map((m) => m.guardianId) }, blockedAt: null, student: { archivedAt: null } },
    select: { studentId: true },
  });
  return [...new Set([studentId, ...rows.map((r) => r.studentId)])];
}

/// Who a session reaches NOW (task 0113 D6), or null when it has ended: a guardian session ends when it has no guardian (a cookie from before guardians were records), the guardian is
/// archived, their version moved on (a new code, a block, an unblock) or the child they signed in with is no longer theirs; a pupil session's reach is re-read from the links. The
/// pupil's own version and the branch switches are checked by the callers, with the records they load.
export async function sessionReach(session: PortalSessionPayload): Promise<string[] | null> {
  if (session.actor === "GUARDIAN") {
    if (!session.guardianId) return null;
    const guardian = await prisma.guardian.findUnique({
      where: { id: session.guardianId },
      select: { portalVersion: true, archivedAt: true },
    });
    if (!guardian || guardian.archivedAt || (session.version ?? 0) !== guardian.portalVersion) return null;
    const children = await guardianChildIds(session.guardianId);
    return children.includes(session.primaryStudentId) ? children : null;
  }
  return pupilSiblingIds(session.primaryStudentId);
}

/// The one answer to every failed admission-number sign-in: an unknown number, an archived pupil and a wrong secret all say this, so the wording (and, as far as one
/// extra lookup allows, the timing) never reveals which admission numbers exist. Found by the bug hunt of 2026-10-19: "No active student found with this admission
/// number" versus "Verification failed" confirmed every number to anyone who tried.
export const PORTAL_SIGNIN_FAILED =
  "Verification failed. Please check the admission number and the access code, date of birth or guardian phone number.";

/// Admission numbers compare case-insensitively and EXACTLY. Not Prisma's `{ equals, mode: "insensitive" }`: that is an ILIKE, so `%` and `_` were wildcards: the
/// admission number "%" with one pupil's real guardian phone signed in as that pupil, without knowing any number, and "2026/00__" probed the numbering. A raw
/// `lower() = lower()` has no pattern syntax. A case-sensitive unique index lets "abc/1" and "ABC/1" coexist, so every match is tried (at most 5), not an arbitrary first.
async function activeStudentIdsByAdmissionNo(admissionNo: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "StudentRecord" WHERE lower("admissionNo") = lower(${admissionNo}) AND "archivedAt" IS NULL LIMIT 5`;
  return rows.map((row) => row.id);
}

type GuardianOfCandidate = { id: string; phone: string | null; email: string | null; codeHash: string | null; portalVersion: number };
type Candidate = {
  id: string;
  dateOfBirth: Date | null;
  pupilCodeHash: string | null;
  branch: { legacyPortalSecrets: boolean };
  guardians: { guardian: GuardianOfCandidate }[];
};
type Proven = { actor: "PUPIL" } | { actor: "GUARDIAN"; guardian: GuardianOfCandidate };

/// Who the secret proves, for this door (task 0113 D6, task 0094 D2, D3, D7, D9): the pupil, by the pupil's access code (or, while the branch allows it, the date of birth); or one of the
/// child's ALLOWED guardians, by that guardian's access code (or, while the branch allows it, that guardian's FULL phone number or e-mail address). A blocked guardian proves nothing for
/// this child: the same generic failure. A secret meant for the other door proves nothing here. `ANY` (portals off: one address for everyone) tries the pupil first.
function provenActor(door: Door, secret: string, candidate: Candidate): Proven | null {
  const legacy = candidate.branch.legacyPortalSecrets;
  if (door === "PUPIL" || door === "ANY") {
    if (verifyAccessCode(secret, candidate.pupilCodeHash, candidate.id, "pupil")) return { actor: "PUPIL" };
    if (legacy && matchesDateOfBirth(secret, candidate.dateOfBirth)) return { actor: "PUPIL" };
  }
  if (door === "GUARDIAN" || door === "ANY") {
    for (const { guardian } of candidate.guardians)
      if (verifyAccessCode(secret, guardian.codeHash, guardian.id, "guardian")) return { actor: "GUARDIAN", guardian };
    if (legacy) {
      const typed = secret.trim().toLowerCase();
      for (const { guardian } of candidate.guardians) {
        if (matchesPhone(secret, guardian.phone)) return { actor: "GUARDIAN", guardian };
        if (guardian.email && guardian.email === typed) return { actor: "GUARDIAN", guardian };
      }
    }
  }
  return null;
}

/// Is family sign-in open in this branch for this actor (task 0091's per-branch switches, task 0094 D4/D8)?
export const familySignInOpen = (branch: { studentLoginEnabled: boolean; parentLoginEnabled: boolean }, actor: Actor): boolean =>
  actor === "PUPIL" ? branch.studentLoginEnabled : branch.parentLoginEnabled;

export const FAMILY_SIGNIN_CLOSED = "Sign-in for your school is closed at the moment. The school will tell you when it opens.";

/// A failed or refused family sign-in leaves a trail (task 0094 D6): which pupil, which door, why. Never the secret. Best effort: a failure to write never changes the answer.
async function auditFamilyAttempt(studentId: string, door: Door, why: "secret" | "closed", clientKey: string) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: "family-sign-in",
        action: why === "closed" ? "PORTAL_SIGNIN_REFUSED" : "PORTAL_SIGNIN_FAILED",
        targetType: "StudentRecord",
        targetId: studentId,
        afterValue: { door, client: crypto.createHash("sha256").update(clientKey).digest("hex").slice(0, 16) },
      },
    });
  } catch (error) {
    console.error("[portal sign-in audit]", error instanceof Error ? error.message : error);
  }
}

const STUDENT_INCLUDE = {
  branch: true,
  enrollments: {
    where: { status: "ACTIVE" as const },
    include: { session: true, classArm: true },
    take: 1,
  },
};

/**
 * Authenticates a family member with the admission number and one secret, at the door the address decides (task 0113 D6).
 */
export async function authenticatePortalViaAdmission(
  admissionNo: string,
  secret: string,
  door: Door = "ANY",
  clientKey = "",
): Promise<PortalAuthResult> {
  const cleanAdmission = admissionNo.trim();
  const cleanSecret = secret.trim();

  if (!cleanAdmission || !cleanSecret || door === "NONE") {
    return { success: false, error: PORTAL_SIGNIN_FAILED };
  }

  const students = await prisma.studentRecord.findMany({
    where: { id: { in: await activeStudentIdsByAdmissionNo(cleanAdmission) } },
    include: {
      ...STUDENT_INCLUDE,
      guardians: {
        where: { blockedAt: null, guardian: { archivedAt: null } },
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
        select: { guardian: { select: { id: true, phone: true, email: true, codeHash: true, portalVersion: true } } },
      },
    },
  });

  let student: (typeof students)[number] | undefined;
  let proven: Proven | null = null;
  for (const candidate of students) {
    proven = provenActor(door, cleanSecret, candidate);
    if (proven) {
      student = candidate;
      break;
    }
  }

  if (!student || !proven) {
    for (const candidate of students) await auditFamilyAttempt(candidate.id, door, "secret", clientKey);
    return { success: false, error: PORTAL_SIGNIN_FAILED };
  }
  const actor: Actor = proven.actor;
  // The secret was right: a closed branch is said plainly (it tells nothing a holder of the secret does not know).
  if (!familySignInOpen(student.branch, actor)) {
    await auditFamilyAttempt(student.id, door, "closed", clientKey);
    return { success: false, error: FAMILY_SIGNIN_CLOSED, code: "LOGIN_CLOSED" };
  }
  // Who the sign-in reaches: a guardian their allowed children, a pupil themself and (when the branch allows it) those who share an allowed guardian; the branch's `siblings` setting for
  // this actor decides whether anyone but the pupil signed in with is part of it.
  const siblings = accessFor(await getPortalAccess(student.branchId), actor).siblings;
  const reach =
    proven.actor === "GUARDIAN"
      ? siblings
        ? await guardianChildIds(proven.guardian.id)
        : [student.id]
      : siblings
        ? await pupilSiblingIds(student.id)
        : [student.id];

  const siblingStudents = await prisma.studentRecord.findMany({
    where: { id: { in: reach }, archivedAt: null },
    include: STUDENT_INCLUDE,
  });

  // Task 0045: a pupil whose standing leaves nothing to open (an expelled pupil, signing in as the pupil) is refused with the one generic sentence, and a family's other children
  // who have nothing to open are not part of the sign-in. An expelled pupil's guardian still gets in, to the invoices only.
  // Children in a branch whose sign-in for this actor is closed are left out (task 0094 D4).
  const reachable = (await reachableStudents(siblingStudents, actor)).filter((s) => familySignInOpen(s.branch, actor));
  if (!reachable.some((candidate) => candidate.id === student.id)) return { success: false, error: PORTAL_SIGNIN_FAILED };

  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    actor,
    primaryStudentId: student.id,
    allowedStudentIds: reachable.map((s) => s.id),
    ...(proven.actor === "GUARDIAN"
      ? { guardianId: proven.guardian.id, version: proven.guardian.portalVersion }
      : { version: student.portalVersion }),
    issuedAt: now,
    expiresAt: now + PORTAL_SESSION_MAX_AGE_SECONDS,
  };

  const sessionToken = signPortalSession(payload);
  const primary = reachable.find((s) => s.id === student.id)!;

  return {
    success: true,
    sessionToken,
    student: withStandingShown(primary),
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
  const reach = await sessionReach(payload);
  if (!reach) return null;

  const students = await prisma.studentRecord.findMany({
    where: { id: { in: reach }, archivedAt: null },
    include: STUDENT_INCLUDE,
  });

  // Task 0113: a regenerated pupil code ends the pupil's sessions made before it (a guardian's version is checked by `sessionReach`), and a branch whose family sign-in is switched off
  // signs its families out at their next request (task 0094 D5): its pupils drop out of the session, and when that is the pupil signed in as, the session is over.
  const primary = students.find((s) => s.id === payload.primaryStudentId);
  if (!primary || !familySignInOpen(primary.branch, payload.actor)) return null;
  if (payload.actor === "PUPIL" && (payload.version ?? 0) !== primary.portalVersion) return null;
  const open = students.filter((s) => familySignInOpen(s.branch, payload.actor));

  // Ensure primary student is at index 0
  open.sort((a, b) => (a.id === payload.primaryStudentId ? -1 : b.id === payload.primaryStudentId ? 1 : 0));

  return {
    session: { ...payload, allowedStudentIds: open.map((s) => s.id) },
    students: open,
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
    omit: { pupilCodeHash: true },
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

  // The card itself is the one the school's staff read (task 0072): the same builder, published results only, never a preview. The fields beside it are what the portal has always sent.
  const branchId = await studentBranch(studentId);
  const reportCards = await Promise.all(
    Array.from(periodMap.values()).map(async (p) => {
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
        card: branchId ? await getReportCard(branchId, studentId, p.period.id, false) : null,
      };
    }),
  );

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

  // The family sees the invoice as settled and, when scholarships did it, that it was "Paid by scholarship": a yes or no. Which scholarship, its share and its note are the school's
  // (task 0113 S1): a scholarship's own discount line reads "Discount" here, with no link to the scholarship.
  return {
    invoices: invoices.map(({ discounts, ...invoice }) => ({
      ...invoice,
      paidByScholarship: paidByScholarship({ ...invoice, discounts }),
      discounts: discounts.map((d) =>
        d.mode === "SCHOLARSHIP"
          ? { id: d.id, amount: d.amount, reason: "Discount", mode: "MANUAL_OVERRIDE", createdAt: d.createdAt }
          : { id: d.id, amount: d.amount, reason: d.reason, mode: d.mode, createdAt: d.createdAt },
      ),
    })),
  };
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
      questions: q.questions.map((x) => ({
        id: x.id,
        prompt: x.prompt,
        questionType: x.questionType,
        options: x.options,
        points: x.points,
      })),
      lastAttempt: q.attempts[0]
        ? { score: q.attempts[0].score, isPassed: q.attempts[0].isPassed, completedAt: q.attempts[0].completedAt }
        : null,
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
      OR: [
        { classArmId: scope.classArmId },
        { classArmId: null, classGroupId: scope.classGroupId },
        { classArmId: null, classGroupId: null },
      ],
    },
    select: { id: true },
  });
  if (!assignment) throw new PortalLmsError("That assignment is not available to this pupil", 404);

  const earlier = await prisma.assignmentSubmission.findFirst({
    where: { branchId: scope.branchId, assignmentId, studentId },
    select: { status: true },
  });
  if (earlier?.status === "GRADED") throw new PortalLmsError("This work has already been marked, so it can no longer be changed", 400);

  return submitAssignment(scope.branchId, assignmentId, studentId, params);
}

export async function attemptPortalQuiz(
  studentId: string,
  allowedStudentIds: string[],
  quizId: string,
  answers: { questionId: string; answer: string }[],
) {
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
  const totalPoints =
    (await prisma.quizQuestion.aggregate({ where: { branchId: scope.branchId, quizId }, _sum: { points: true } }))._sum.points ?? 0;
  return { score: attempt.score, isPassed: attempt.isPassed, totalPoints };
}
