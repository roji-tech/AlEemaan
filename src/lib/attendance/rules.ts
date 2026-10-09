import { AttendanceStatus, AttendanceSource } from "@prisma/client";

export { AttendanceStatus, AttendanceSource };

export const TEACHER_EDIT_WINDOW_DAYS = 7;

/**
 * Checks if a string conforms to strict ISO date format YYYY-MM-DD.
 */
export function isIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [year, month, day] = str.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Accurately calculates elapsed whole days between an ISO date string and today.
 */
export function daysAgo(dateStr: string, todayIso?: string): number {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const targetTime = new Date(`${dateStr}T00:00:00Z`).getTime();
  const todayTime = new Date(`${today}T00:00:00Z`).getTime();
  const diffMs = todayTime - targetTime;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Checks if a date falls strictly in the future compared to today.
 */
export function isFutureDate(dateStr: string, todayIso?: string): boolean {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  return dateStr > today;
}

/**
 * Determines whether the user can record or update attendance for the given date.
 * - Future dates: Strictly forbidden for everyone.
 * - ADMIN: Full historical edit rights.
 * - Staff (TEACHING_STAFF, NON_TEACHING_STAFF): Editable within 7 calendar days.
 * - Others: Read-only.
 */
export function canEditAttendance(actorRole: string, dateStr: string, todayIso?: string): boolean {
  if (isFutureDate(dateStr, todayIso)) {
    return false;
  }

  if (actorRole === "ADMIN") {
    return true;
  }

  if (actorRole === "TEACHING_STAFF" || actorRole === "NON_TEACHING_STAFF") {
    const elapsedDays = daysAgo(dateStr, todayIso);
    return elapsedDays >= 0 && elapsedDays <= TEACHER_EDIT_WINDOW_DAYS;
  }

  return false;
}

export type AttendanceCountSummary = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRate: number; // integer percentage (0-100)
};

/**
 * Pure calculator for attendance totals and rates.
 */
export function calculateAttendanceSummary(records: Array<{ status: AttendanceStatus | null }>): AttendanceCountSummary {
  const total = records.length;
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;

  for (const record of records) {
    if (record.status === AttendanceStatus.PRESENT) {
      present++;
    } else if (record.status === AttendanceStatus.LATE) {
      late++;
    } else if (record.status === AttendanceStatus.ABSENT) {
      absent++;
    } else if (record.status === AttendanceStatus.EXCUSED) {
      excused++;
    }
  }

  const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return {
    total,
    present,
    late,
    absent,
    excused,
    attendanceRate,
  };
}
