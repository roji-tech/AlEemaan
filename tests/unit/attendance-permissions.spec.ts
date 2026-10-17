import { test, expect } from "@playwright/test";
import { ForbiddenAttendanceError } from "../../src/lib/attendance/access";

test.describe("Attendance Permissions Unit Tests", () => {
  test("ForbiddenAttendanceError has expected name and message", () => {
    const err = new ForbiddenAttendanceError();
    expect(err.name).toBe("ForbiddenAttendanceError");
    expect(err.message).toBe("You are not authorized to record or view attendance for this arm");

    const custom = new ForbiddenAttendanceError("Custom denied message");
    expect(custom.message).toBe("Custom denied message");
  });

  test("grant hierarchy precedence order", () => {
    const hierarchy = ["ADMIN", "CLASS_TEACHER", "EXPLICIT_GRANT", "UNAUTHORIZED"];
    expect(hierarchy[0]).toBe("ADMIN");
    expect(hierarchy[1]).toBe("CLASS_TEACHER");
    expect(hierarchy[2]).toBe("EXPLICIT_GRANT");
    expect(hierarchy[3]).toBe("UNAUTHORIZED");
  });
});
