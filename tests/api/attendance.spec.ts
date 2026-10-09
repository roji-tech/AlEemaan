import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

const ATTENDANCE_ROUTE = "/api/v1/attendance";

let branch: { id: string; name: string };
let session: { id: string };
let student1: { id: string; admissionNo: string };
let student2: { id: string; admissionNo: string };

test.beforeAll(async () => {
  await seedInstance();

  branch = await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } });

  // Active session
  session = await db.academicSession.upsert({
    where: { branchId_label: { branchId: branch.id, label: "2026/2027" } },
    update: { status: "ACTIVE" },
    create: {
      branchId: branch.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });

  // Two students enrolled in "Primary 1"
  student1 = await db.studentRecord.upsert({
    where: { admissionNo: "2026/0101" },
    update: { archivedAt: null },
    create: {
      branchId: branch.id,
      firstName: "Zainab",
      lastName: "Aliyu",
      gender: "FEMALE",
      dateOfBirth: new Date("2018-02-14"),
      admissionNo: "2026/0101",
    },
  });

  student2 = await db.studentRecord.upsert({
    where: { admissionNo: "2026/0102" },
    update: { archivedAt: null },
    create: {
      branchId: branch.id,
      firstName: "Ibrahim",
      lastName: "Umar",
      gender: "MALE",
      dateOfBirth: new Date("2018-05-20"),
      admissionNo: "2026/0102",
    },
  });

  await db.studentEnrollment.upsert({
    where: { studentId_sessionId: { studentId: student1.id, sessionId: session.id } },
    update: { status: "ACTIVE", className: "Primary 1", arm: "Gold" },
    create: {
      studentId: student1.id,
      branchId: branch.id,
      sessionId: session.id,
      className: "Primary 1",
      arm: "Gold",
      status: "ACTIVE",
    },
  });

  await db.studentEnrollment.upsert({
    where: { studentId_sessionId: { studentId: student2.id, sessionId: session.id } },
    update: { status: "ACTIVE", className: "Primary 1", arm: "Gold" },
    create: {
      studentId: student2.id,
      branchId: branch.id,
      sessionId: session.id,
      className: "Primary 1",
      arm: "Gold",
      status: "ACTIVE",
    },
  });
});

const asRole = async (role?: Role) => {
  const user = await createUser({ role });
  const { token } = await loginAs(user);
  return { user, cookie: cookieHeader(token!) };
};

test.describe("AlEemaan Attendance API", () => {
  test("GET /api/v1/attendance requires authentication", async () => {
    const res = await api(`${ATTENDANCE_ROUTE}?branchId=${branch.id}&className=Primary 1`);
    expect(res.status).toBe(401);
  });

  test("GET /api/v1/attendance returns roll-call roster with enrolled students", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);

    const res = await api(`${ATTENDANCE_ROUTE}?branchId=${branch.id}&className=Primary 1&arm=Gold&date=2026-10-09`, { cookie });

    expect(res.status).toBe(200);
    const data = res.json.data;
    expect(data.branchId).toBe(branch.id);
    expect(data.className).toBe("Primary 1");
    expect(data.arm).toBe("Gold");
    expect(data.students).toHaveLength(2);
    expect(data.students[0].admissionNo).toBe("2026/0101");
    expect(data.students[0].status).toBeNull();
    expect(data.summary.total).toBe(2);
    expect(data.canEdit).toBe(true);
  });

  test("POST /api/v1/attendance refuses future dates", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);

    const res = await api(ATTENDANCE_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        date: "2029-01-01",
        records: [{ studentId: student1.id, status: "PRESENT" }],
      },
    });

    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
  });

  test("POST /api/v1/attendance bulk-marks and updates attendance idempotently", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);

    // Initial mark: student1 PRESENT, student2 LATE
    const res1 = await api(ATTENDANCE_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        date: "2026-10-09",
        records: [
          { studentId: student1.id, status: "PRESENT" },
          { studentId: student2.id, status: "LATE", remarks: "Traffic on Ring Road" },
        ],
      },
    });

    expect(res1.status).toBe(200);
    expect(res1.json.data.count).toBe(2);
    expect(res1.json.data.summary.present).toBe(1);
    expect(res1.json.data.summary.late).toBe(1);
    expect(res1.json.data.summary.attendanceRate).toBe(100);

    // Re-mark with update: student1 changed to ABSENT
    const res2 = await api(ATTENDANCE_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        date: "2026-10-09",
        records: [
          { studentId: student1.id, status: "ABSENT", remarks: "Fever" },
          { studentId: student2.id, status: "PRESENT" },
        ],
      },
    });

    expect(res2.status).toBe(200);
    expect(res2.json.data.summary.present).toBe(1);
    expect(res2.json.data.summary.absent).toBe(1);
    expect(res2.json.data.summary.attendanceRate).toBe(50);

    // Verify GET reflects updated attendance status
    const getRes = await api(`${ATTENDANCE_ROUTE}?branchId=${branch.id}&className=Primary 1&date=2026-10-09`, { cookie });
    expect(getRes.status).toBe(200);
    const studs = getRes.json.data.students as Array<{ studentId: string; status: string; remarks: string | null }>;
    const s1 = studs.find((s) => s.studentId === student1.id);
    expect(s1?.status).toBe("ABSENT");
    expect(s1?.remarks).toBe("Fever");
  });

  test("enforces 7-day edit window for teachers, while admin can override", async () => {
    const { cookie: teacherCookie } = await asRole(Role.TEACHING_STAFF);
    const { cookie: adminCookie } = await asRole(Role.ADMIN);

    const oldDate = "2026-09-01"; // > 7 days in the past

    // Teacher tries to mark old date -> 403 EDIT_WINDOW_EXPIRED
    const teacherRes = await api(ATTENDANCE_ROUTE, {
      method: "POST",
      cookie: teacherCookie,
      body: {
        branchId: branch.id,
        date: oldDate,
        records: [{ studentId: student1.id, status: "PRESENT" }],
      },
    });

    expect(teacherRes.status).toBe(403);
    expect(teacherRes.json.error.code).toBe("EDIT_WINDOW_EXPIRED");

    // Admin marks old date -> 200 OK
    const adminRes = await api(ATTENDANCE_ROUTE, {
      method: "POST",
      cookie: adminCookie,
      body: {
        branchId: branch.id,
        date: oldDate,
        records: [{ studentId: student1.id, status: "PRESENT" }],
      },
    });

    expect(adminRes.status).toBe(200);
  });

  test("GET /api/v1/students/[id]/attendance returns student history", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);

    const res = await api(`/api/v1/students/${student1.id}/attendance`, { cookie });
    expect(res.status).toBe(200);
    const data = res.json.data;
    expect(data.student.id).toBe(student1.id);
    expect(data.student.admissionNo).toBe("2026/0101");
    expect(Array.isArray(data.records)).toBe(true);
    expect(data.records.length).toBeGreaterThanOrEqual(1);
    expect(data.summary).toBeDefined();
  });
});
