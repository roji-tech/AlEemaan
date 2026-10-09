import { prisma } from "@/lib/db";
import { SessionStatus } from "@prisma/client";
import { isFutureDate, canEditAttendance, calculateAttendanceSummary, AttendanceStatus, type AttendanceCountSummary } from "./rules";
import type { BulkMarkAttendanceInput, AttendanceFailure } from "./http";

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; failure: AttendanceFailure };

export type StudentRollCallEntry = {
  studentId: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  status: AttendanceStatus | null;
  remarks: string | null;
  markedAt: Date | null;
  markedByUserId: string | null;
};

export type RollCallResult = {
  branchId: string;
  className: string;
  arm: string | null;
  date: string;
  students: StudentRollCallEntry[];
  summary: AttendanceCountSummary;
  canEdit: boolean;
};

/**
 * Retrieves the daily roll call roster for a specific branch, class, and date.
 */
export async function getBranchRollCall({
  branchId,
  className,
  arm,
  dateStr,
  actorRole,
}: {
  branchId: string;
  className: string;
  arm?: string | null;
  dateStr: string;
  actorRole: string;
}): Promise<ServiceResult<RollCallResult>> {
  // 1. Verify branch exists
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true },
  });

  if (!branch) {
    return { ok: false, failure: "NOT_FOUND" };
  }

  // 2. Identify active session for this branch
  const activeSession = await prisma.academicSession.findFirst({
    where: { branchId, status: SessionStatus.ACTIVE, archivedAt: null },
    select: { id: true },
  });

  if (!activeSession) {
    return { ok: false, failure: "SESSION_NOT_ACTIVE" };
  }

  // 3. Fetch active enrollments in this class for the active session
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      branchId,
      sessionId: activeSession.id,
      className,
      ...(arm ? { arm } : {}),
      status: "ACTIVE",
      student: { archivedAt: null },
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          middleName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { student: { admissionNo: "asc" } }],
  });

  const studentIds = enrollments.map((e) => e.student.id);
  const targetDate = new Date(`${dateStr}T00:00:00Z`);

  // 4. Fetch existing attendance records for these students on this date
  const existingRecords = await prisma.attendanceRecord.findMany({
    where: {
      branchId,
      date: targetDate,
      studentId: { in: studentIds },
    },
    select: {
      studentId: true,
      status: true,
      remarks: true,
      markedAt: true,
      markedByUserId: true,
    },
  });

  const recordMap = new Map(existingRecords.map((r) => [r.studentId, r]));

  // 5. Combine into roll call roster
  const students: StudentRollCallEntry[] = enrollments.map((e) => {
    const record = recordMap.get(e.student.id);
    return {
      studentId: e.student.id,
      admissionNo: e.student.admissionNo,
      firstName: e.student.firstName,
      middleName: e.student.middleName,
      lastName: e.student.lastName,
      status: record?.status ?? null,
      remarks: record?.remarks ?? null,
      markedAt: record?.markedAt ?? null,
      markedByUserId: record?.markedByUserId ?? null,
    };
  });

  const summary = calculateAttendanceSummary(students);
  const canEdit = canEditAttendance(actorRole, dateStr);

  return {
    ok: true,
    data: {
      branchId,
      className,
      arm: arm ?? null,
      date: dateStr,
      students,
      summary,
      canEdit,
    },
  };
}

/**
 * Idempotently records or updates bulk attendance records for a class on a date.
 */
export async function markBranchAttendance({
  branchId,
  actorUserId,
  actorRole,
  input,
}: {
  branchId: string;
  actorUserId: string;
  actorRole: string;
  input: BulkMarkAttendanceInput;
}): Promise<ServiceResult<{ count: number; date: string; summary: AttendanceCountSummary }>> {
  const { date: dateStr, records, source } = input;

  // 1. Validate date and edit window
  if (isFutureDate(dateStr)) {
    return { ok: false, failure: "FUTURE_DATE_NOT_ALLOWED" };
  }

  if (!canEditAttendance(actorRole, dateStr)) {
    return { ok: false, failure: "EDIT_WINDOW_EXPIRED" };
  }

  // 2. Verify branch exists
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });

  if (!branch) {
    return { ok: false, failure: "NOT_FOUND" };
  }

  const targetDate = new Date(`${dateStr}T00:00:00Z`);

  // 3. Upsert records inside transaction
  await prisma.$transaction(async (tx) => {
    for (const item of records) {
      await tx.attendanceRecord.upsert({
        where: {
          studentId_date: {
            studentId: item.studentId,
            date: targetDate,
          },
        },
        create: {
          branchId,
          studentId: item.studentId,
          date: targetDate,
          status: item.status,
          remarks: item.remarks ?? null,
          source,
          markedByUserId: actorUserId,
        },
        update: {
          status: item.status,
          remarks: item.remarks ?? null,
          source,
          markedByUserId: actorUserId,
        },
      });
    }

    // 4. Audit Log (Zero PII: IDs and count only)
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "ATTENDANCE_RECORDED",
        targetType: "AttendanceRecord",
        targetId: branchId,
        afterValue: {
          branchId,
          date: dateStr,
          recordCount: records.length,
          source,
        },
      },
    });
  });

  const summary = calculateAttendanceSummary(records);

  return {
    ok: true,
    data: {
      count: records.length,
      date: dateStr,
      summary,
    },
  };
}

/**
 * Retrieves full attendance history for a single student.
 */
export async function getStudentAttendanceHistory(studentId: string): Promise<
  ServiceResult<{
    student: {
      id: string;
      admissionNo: string;
      firstName: string;
      lastName: string;
    };
    records: Array<{
      id: string;
      date: string;
      status: AttendanceStatus;
      remarks: string | null;
      markedAt: Date;
    }>;
    summary: AttendanceCountSummary;
  }>
> {
  const student = await prisma.studentRecord.findFirst({
    where: { id: studentId, archivedAt: null },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!student) {
    return { ok: false, failure: "NOT_FOUND" };
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      status: true,
      remarks: true,
      markedAt: true,
    },
  });

  const mapped = records.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    status: r.status,
    remarks: r.remarks,
    markedAt: r.markedAt,
  }));

  const summary = calculateAttendanceSummary(mapped);

  return {
    ok: true,
    data: {
      student,
      records: mapped,
      summary,
    },
  };
}
