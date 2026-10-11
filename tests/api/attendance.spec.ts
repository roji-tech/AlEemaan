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

/// A signed-in user holding `role` in the PRIMARY branch (the one these tests mark attendance in). Attendance is branch-scoped, so the
/// membership must be in that branch; `createUser({ role })` would put it in the first seeded branch, which is a different one.
const asRole = async (role: Role, branchId: string = branch.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
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

// Attendance is scoped to the caller's branch (plan "Fix design — attendance is scoped to the caller's branch", decisions A1-A6).
test.describe("AlEemaan Attendance API — branch scoping", () => {
  let other: { id: string };
  let otherSession: { id: string };
  let otherStudent: { id: string };

  test.beforeAll(async () => {
    other = await db.branch.findFirstOrThrow({ where: { id: { not: branch.id } } });
    otherSession = await db.academicSession.upsert({
      where: { branchId_label: { branchId: other.id, label: "2026/2027" } },
      update: { status: "ACTIVE" },
      create: {
        branchId: other.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
        status: "ACTIVE",
      },
    });
    otherStudent = await db.studentRecord.upsert({
      where: { admissionNo: "2026/0901" },
      update: { archivedAt: null },
      create: {
        branchId: other.id,
        firstName: "Hauwa",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2018-03-03"),
        admissionNo: "2026/0901",
      },
    });
    await db.studentEnrollment.upsert({
      where: { studentId_sessionId: { studentId: otherStudent.id, sessionId: otherSession.id } },
      update: { status: "ACTIVE", className: "Primary 1", arm: "Blue" },
      create: {
        studentId: otherStudent.id,
        branchId: other.id,
        sessionId: otherSession.id,
        className: "Primary 1",
        arm: "Blue",
        status: "ACTIVE",
      },
    });
  });

  const today = () => new Date().toISOString().slice(0, 10);
  const mark = (cookie: string, branchId: string, records: unknown[], date = today()) =>
    api(ATTENDANCE_ROUTE, { method: "POST", cookie, body: { branchId, date, records } });

  test("a teacher with a membership in branch A only gets 404 for branch B (roll call, marking, and a branch-B student's history)", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF); // member of the primary branch only

    const get = await api(`${ATTENDANCE_ROUTE}?branchId=${other.id}&className=Primary 1&date=${today()}`, { cookie });
    expect(get.status).toBe(404);

    const post = await mark(cookie, other.id, [{ studentId: otherStudent.id, status: "PRESENT" }]);
    expect(post.status).toBe(404);
    expect(await db.attendanceRecord.count({ where: { studentId: otherStudent.id } })).toBe(0);

    const history = await api(`/api/v1/students/${otherStudent.id}/attendance`, { cookie });
    expect(history.status).toBe(404);
  });

  test("a branch the caller does not belong to answers exactly like an unknown branch", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const unknown = await api(`${ATTENDANCE_ROUTE}?branchId=nope&className=Primary 1`, { cookie });
    const foreign = await api(`${ATTENDANCE_ROUTE}?branchId=${other.id}&className=Primary 1`, { cookie });
    expect(unknown.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(foreign.json.error.code).toBe(unknown.json.error.code);
    expect(foreign.json.error.message).toBe(unknown.json.error.message);
  });

  test("a branch-B student id inside a branch-A request refuses the WHOLE request and writes nothing", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const before = await db.attendanceRecord.count({
      where: { studentId: { in: [student1.id, otherStudent.id] }, date: new Date(`${today()}T00:00:00Z`) },
    });

    const res = await mark(cookie, branch.id, [
      { studentId: student1.id, status: "PRESENT" },
      { studentId: otherStudent.id, status: "ABSENT" },
    ]);

    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION");
    const after = await db.attendanceRecord.count({
      where: { studentId: { in: [student1.id, otherStudent.id] }, date: new Date(`${today()}T00:00:00Z`) },
    });
    expect(after).toBe(before); // no partial marks
  });

  test("an existing record of another branch is never overwritten", async () => {
    const date = new Date(`${today()}T00:00:00Z`);
    await db.attendanceRecord.upsert({
      where: { studentId_date: { studentId: otherStudent.id, date } },
      update: { status: "PRESENT", branchId: other.id },
      create: { branchId: other.id, studentId: otherStudent.id, date, status: "PRESENT" },
    });
    const { cookie } = await asRole(Role.TEACHING_STAFF);

    const res = await mark(cookie, branch.id, [{ studentId: otherStudent.id, status: "ABSENT" }]);

    expect(res.status).toBe(400);
    const record = await db.attendanceRecord.findUniqueOrThrow({ where: { studentId_date: { studentId: otherStudent.id, date } } });
    expect(record.status).toBe("PRESENT");
    expect(record.branchId).toBe(other.id);
  });

  test("an unknown, archived or unenrolled student id is a 400, and so is a duplicate id", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const archived = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "Old",
        lastName: "Pupil",
        gender: "MALE",
        dateOfBirth: new Date("2017-01-01"),
        admissionNo: `2026/A${Date.now()}`,
        archivedAt: new Date(),
      },
    });
    const unenrolled = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "New",
        lastName: "Pupil",
        gender: "MALE",
        dateOfBirth: new Date("2017-01-02"),
        admissionNo: `2026/U${Date.now()}`,
      },
    });

    for (const records of [
      [{ studentId: "does-not-exist", status: "PRESENT" }],
      [{ studentId: archived.id, status: "PRESENT" }],
      [{ studentId: unenrolled.id, status: "PRESENT" }],
      [
        { studentId: student1.id, status: "PRESENT" },
        { studentId: student1.id, status: "ABSENT" },
      ],
    ]) {
      const res = await mark(cookie, branch.id, records);
      expect(res.status, JSON.stringify(records)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
    }
    expect(await db.attendanceRecord.count({ where: { studentId: { in: [archived.id, unenrolled.id] } } })).toBe(0);
  });

  test("marking needs an active session in the branch", async () => {
    await db.academicSession.update({ where: { id: session.id }, data: { status: "CLOSED" } });
    try {
      const { cookie } = await asRole(Role.TEACHING_STAFF);
      const res = await mark(cookie, branch.id, [{ studentId: student1.id, status: "PRESENT" }]);
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("SESSION_NOT_ACTIVE");
    } finally {
      await db.academicSession.update({ where: { id: session.id }, data: { status: "ACTIVE" } });
    }
  });

  test("a malformed or impossible date on the roll-call GET is a 400, not a 500", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    for (const date of ["garbage", "2026-13-45", "2026-02-30"]) {
      const res = await api(`${ATTENDANCE_ROUTE}?branchId=${branch.id}&className=Primary 1&date=${date}`, { cookie });
      expect(res.status, date).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
    }
  });

  test("different roles in different branches: the role held IN the branch decides (teacher here, non-teaching there)", async () => {
    const user = await createUser();
    await db.membership.create({ data: { userId: user.id, branchId: branch.id, role: Role.TEACHING_STAFF } });
    await db.membership.create({ data: { userId: user.id, branchId: other.id, role: Role.NON_TEACHING_STAFF } });
    const cookie = cookieHeader((await loginAs(user)).token!);

    // may mark where they teach ...
    expect((await mark(cookie, branch.id, [{ studentId: student1.id, status: "PRESENT" }])).status).toBe(200);
    // ... may LOOK where they are non-teaching staff ...
    const look = await api(`${ATTENDANCE_ROUTE}?branchId=${other.id}&className=Primary 1&arm=Blue&date=${today()}`, { cookie });
    expect(look.status).toBe(200);
    // ... but may not mark there, although the route-level check ("a teacher somewhere") would let them in.
    const denied = await mark(cookie, other.id, [{ studentId: otherStudent.id, status: "PRESENT" }]);
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe("FORBIDDEN");
  });

  test("a PARENT or STUDENT membership in a branch gives nothing there, even for someone who is staff elsewhere", async () => {
    const user = await createUser();
    await db.membership.create({ data: { userId: user.id, branchId: branch.id, role: Role.TEACHING_STAFF } });
    await db.membership.create({ data: { userId: user.id, branchId: other.id, role: Role.PARENT } });
    const cookie = cookieHeader((await loginAs(user)).token!);

    expect((await api(`${ATTENDANCE_ROUTE}?branchId=${other.id}&className=Primary 1&date=${today()}`, { cookie })).status).toBe(404);
    expect((await mark(cookie, other.id, [{ studentId: otherStudent.id, status: "PRESENT" }])).status).toBe(404);
    expect((await api(`/api/v1/students/${otherStudent.id}/attendance`, { cookie })).status).toBe(404);
  });

  test("a branch administrator reaches their own branch and gets 404 for another", async () => {
    const { cookie } = await asRole(Role.ADMIN); // not a superadmin: administers the PRIMARY branch only
    const own = await api(`${ATTENDANCE_ROUTE}?branchId=${branch.id}&className=Primary 1&arm=Gold&date=${today()}`, { cookie });
    expect(own.status).toBe(200);
    expect((await api(`${ATTENDANCE_ROUTE}?branchId=${other.id}&className=Primary 1&arm=Blue&date=${today()}`, { cookie })).status).toBe(
      404,
    );
    expect((await mark(cookie, other.id, [{ studentId: otherStudent.id, status: "PRESENT" }])).status).toBe(404);
    expect((await api(`/api/v1/students/${otherStudent.id}/attendance`, { cookie })).status).toBe(404);
  });

  test("a superadmin reaches every branch", async () => {
    const { cookie } = await asRole(Role.ADMIN, branch.id, true);
    const get = await api(`${ATTENDANCE_ROUTE}?branchId=${other.id}&className=Primary 1&arm=Blue&date=${today()}`, { cookie });
    expect(get.status).toBe(200);
    expect(get.json.data.students.map((s: { studentId: string }) => s.studentId)).toContain(otherStudent.id);

    const history = await api(`/api/v1/students/${otherStudent.id}/attendance`, { cookie });
    expect(history.status).toBe(200);
    expect(history.json.data.student.branchId).toBeUndefined(); // the answer does not carry the branch id
  });
});
