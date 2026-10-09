import { test, expect } from "@playwright/test";
import { isFutureDate, daysAgo, canEditAttendance, calculateAttendanceSummary, AttendanceStatus } from "../../src/lib/attendance/rules";

test.describe("Attendance Pure Rules in AlEemaan", () => {
  test("isFutureDate accurately distinguishes past, today, and future dates", () => {
    const today = "2026-10-09";
    expect(isFutureDate("2026-10-08", today)).toBe(false);
    expect(isFutureDate("2026-10-09", today)).toBe(false);
    expect(isFutureDate("2026-10-10", today)).toBe(true);
    expect(isFutureDate("2027-01-01", today)).toBe(true);
  });

  test("daysAgo computes elapsed whole days", () => {
    const today = "2026-10-09";
    expect(daysAgo("2026-10-09", today)).toBe(0);
    expect(daysAgo("2026-10-08", today)).toBe(1);
    expect(daysAgo("2026-10-02", today)).toBe(7);
    expect(daysAgo("2026-10-01", today)).toBe(8);
  });

  test("canEditAttendance enforces role boundaries and edit windows", () => {
    const today = "2026-10-09";

    // Future dates are rejected for ALL roles
    expect(canEditAttendance("ADMIN", "2026-10-10", today)).toBe(false);
    expect(canEditAttendance("TEACHING_STAFF", "2026-10-10", today)).toBe(false);

    // ADMIN can edit any past historical date
    expect(canEditAttendance("ADMIN", "2026-10-09", today)).toBe(true);
    expect(canEditAttendance("ADMIN", "2026-10-02", today)).toBe(true);
    expect(canEditAttendance("ADMIN", "2026-01-01", today)).toBe(true);

    // TEACHING_STAFF can edit today and up to 7 days into the past
    expect(canEditAttendance("TEACHING_STAFF", "2026-10-09", today)).toBe(true);
    expect(canEditAttendance("TEACHING_STAFF", "2026-10-02", today)).toBe(true); // exactly 7 days
    expect(canEditAttendance("TEACHING_STAFF", "2026-10-01", today)).toBe(false); // 8 days (expired)
    expect(canEditAttendance("TEACHING_STAFF", "2026-09-01", today)).toBe(false);

    // PARENT and STUDENT cannot edit
    expect(canEditAttendance("PARENT", "2026-10-09", today)).toBe(false);
    expect(canEditAttendance("STUDENT", "2026-10-09", today)).toBe(false);
  });

  test("calculateAttendanceSummary computes accurate counts and rates", () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.EXCUSED },
    ];

    const summary = calculateAttendanceSummary(records);
    expect(summary.total).toBe(5);
    expect(summary.present).toBe(2);
    expect(summary.late).toBe(1);
    expect(summary.absent).toBe(1);
    expect(summary.excused).toBe(1);
    // (2 present + 1 late) / 5 = 60%
    expect(summary.attendanceRate).toBe(60);
  });

  test("calculateAttendanceSummary handles zero records gracefully", () => {
    const summary = calculateAttendanceSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.present).toBe(0);
    expect(summary.late).toBe(0);
    expect(summary.absent).toBe(0);
    expect(summary.excused).toBe(0);
    expect(summary.attendanceRate).toBe(0);
  });
});
