import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { isIsoDate, AttendanceStatus, AttendanceSource } from "./rules";

export const READ_ROLES = ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const;
export const WRITE_ROLES = ["ADMIN", "TEACHING_STAFF"] as const;

export const isoDateField = z.string({ error: "Give a date as YYYY-MM-DD." }).refine(isIsoDate, "Use a real date, written YYYY-MM-DD.");

export const attendanceRecordItemSchema = z.strictObject({
  studentId: z.string().min(1, "Student ID is required"),
  status: z.nativeEnum(AttendanceStatus, {
    error: "Status must be PRESENT, ABSENT, LATE, or EXCUSED",
  }),
  remarks: z.string().max(500, "Remarks cannot exceed 500 characters").optional().nullable(),
});

export const bulkMarkAttendanceSchema = z.strictObject({
  branchId: z.string().min(1, "Branch ID is required"),
  date: isoDateField,
  records: z
    .array(attendanceRecordItemSchema, {
      error: "Provide attendance records as a list",
    })
    .min(1, "Provide at least one student attendance record"),
  source: z.nativeEnum(AttendanceSource).optional().default(AttendanceSource.ONLINE),
});

export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>;

export type AttendanceFailure = "NOT_FOUND" | "FUTURE_DATE_NOT_ALLOWED" | "EDIT_WINDOW_EXPIRED" | "UNAUTHORIZED" | "SESSION_NOT_ACTIVE";

export function attendanceFailure(reason: AttendanceFailure): Response {
  switch (reason) {
    case "NOT_FOUND":
      return fail("No such branch, student or class.", 404, "NOT_FOUND");
    case "FUTURE_DATE_NOT_ALLOWED":
      return fail("Attendance cannot be recorded for future dates.", 400, "FUTURE_DATE_NOT_ALLOWED");
    case "EDIT_WINDOW_EXPIRED":
      return fail(
        "The edit window for this attendance record has expired. Only an administrator can edit historical records older than 7 days.",
        403,
        "EDIT_WINDOW_EXPIRED",
      );
    case "SESSION_NOT_ACTIVE":
      return fail("There is no active academic session for this date.", 409, "SESSION_NOT_ACTIVE");
    case "UNAUTHORIZED":
      return fail("You do not have permission to mark attendance.", 403, "FORBIDDEN");
    default:
      return fail("Could not process attendance request.", 500, "INTERNAL_ERROR");
  }
}
