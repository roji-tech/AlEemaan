import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

let home: { id: string };
let session: { id: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();

  session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });
});

const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("Task 0019: Attendance Permissions API", () => {
  test("GET /api/v1/academics/attendance/arms filters list accurately by user role and assignments", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Primary 1" } });
    const arm1 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
    const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Silver" } });

    const teacherStaff = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacher.user.id, category: "TEACHING", firstName: "Test", lastName: "Teacher" },
    });

    // Make teacher class teacher of arm1 only
    await db.classArm.update({ where: { id: arm1.id }, data: { classTeacherId: teacherStaff.id } });

    // 1. Admin checks arms -> sees both arms with grantType: "ADMIN"
    const adminRes = await api(`/api/v1/academics/attendance/arms?branchId=${home.id}`, { cookie: admin.cookie });
    expect(adminRes.status).toBe(200);
    const adminData = adminRes.json.data as Array<{ id: string; grantType: string }>;
    expect(adminData.length).toBeGreaterThanOrEqual(2);
    expect(adminData.find((a) => a.id === arm1.id)?.grantType).toBe("ADMIN");
    expect(adminData.find((a) => a.id === arm2.id)?.grantType).toBe("ADMIN");

    // 2. Teacher checks arms -> sees only arm1 with grantType: "CLASS_TEACHER"
    const teacherRes = await api(`/api/v1/academics/attendance/arms?branchId=${home.id}`, { cookie: teacher.cookie });
    expect(teacherRes.status).toBe(200);
    const teacherData = teacherRes.json.data as Array<{ id: string; grantType: string }>;
    expect(teacherData).toHaveLength(1);
    expect(teacherData[0].id).toBe(arm1.id);
    expect(teacherData[0].grantType).toBe("CLASS_TEACHER");

    // 3. Grant teacher access to arm2 as well
    await db.attendanceGrant.create({
      data: { branchId: home.id, staffRecordId: teacherStaff.id, classArmId: arm2.id, grantedByUserId: admin.user.id },
    });

    const teacherRes2 = await api(`/api/v1/academics/attendance/arms?branchId=${home.id}`, { cookie: teacher.cookie });
    expect(teacherRes2.status).toBe(200);
    const teacherData2 = teacherRes2.json.data as Array<{ id: string; grantType: string }>;
    expect(teacherData2).toHaveLength(2);
    expect(teacherData2.find((a) => a.id === arm2.id)?.grantType).toBe("EXPLICIT_GRANT");
  });

  test("POST /api/v1/academics/attendance rejects unauthorized teachers with 403", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacherA = await asRole(Role.TEACHING_STAFF);
    const teacherB = await asRole(Role.TEACHING_STAFF);

    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Primary 2" } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Bronze" } });

    const staffA = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacherA.user.id, category: "TEACHING", firstName: "Teacher", lastName: "A" },
    });
    await db.staffRecord.create({
      data: { branchId: home.id, userId: teacherB.user.id, category: "TEACHING", firstName: "Teacher", lastName: "B" },
    });

    // Assign Teacher A as class teacher of arm
    await db.classArm.update({ where: { id: arm.id }, data: { classTeacherId: staffA.id } });

    // Create enrolled student
    const student = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Halima",
        lastName: "Sani",
        admissionNo: "2026/0201",
        gender: "FEMALE",
        dateOfBirth: new Date("2018-01-01"),
      },
    });
    await db.studentEnrollment.create({
      data: {
        branchId: home.id,
        sessionId: session.id,
        studentId: student.id,
        className: "Primary 2",
        arm: "Bronze",
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });

    const markPayload = {
      branchId: home.id,
      classArmId: arm.id,
      date: new Date().toISOString().slice(0, 10),
      records: [{ studentId: student.id, status: "PRESENT" }],
    };

    // 1. Teacher B (unauthorized) attempts to mark attendance -> 403 Forbidden
    const resB = await api("/api/v1/academics/attendance", {
      method: "POST",
      cookie: teacherB.cookie,
      body: markPayload,
    });
    expect(resB.status).toBe(403);

    // 2. Teacher A (form teacher) marks attendance -> 200 OK
    const resA = await api("/api/v1/academics/attendance", {
      method: "POST",
      cookie: teacherA.cookie,
      body: markPayload,
    });
    expect(resA.status).toBe(200);

    // 3. Admin marks attendance -> 200 OK
    const resAdmin = await api("/api/v1/academics/attendance", {
      method: "POST",
      cookie: admin.cookie,
      body: markPayload,
    });
    expect(resAdmin.status).toBe(200);
  });

  test("Attendance grants management endpoints (create, list, revoke, class-teacher)", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Primary 3" } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Diamond" } });

    const staff = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacher.user.id, category: "TEACHING", firstName: "John", lastName: "Doe" },
    });

    // 1. Non-admin cannot create grant -> 403
    const forbiddenCreate = await api("/api/v1/academics/attendance/grants", {
      method: "POST",
      cookie: teacher.cookie,
      body: { branchId: home.id, staffRecordId: staff.id, classArmId: arm.id },
    });
    expect(forbiddenCreate.status).toBe(403);

    // 2. Admin creates grant -> 201
    const createRes = await api("/api/v1/academics/attendance/grants", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, staffRecordId: staff.id, classArmId: arm.id },
    });
    expect(createRes.status).toBe(201);
    const grantId = createRes.json.data.grant.id;
    expect(grantId).toBeTruthy();

    // 3. Admin lists grants -> 200
    const listRes = await api(`/api/v1/academics/attendance/grants?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(listRes.status).toBe(200);
    const grants = listRes.json.data as Array<{ id: string }>;
    expect(grants.some((g) => g.id === grantId)).toBe(true);

    // 4. Admin assigns class teacher -> 200
    const patchRes = await api(`/api/v1/academics/arms/${arm.id}/class-teacher`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { branchId: home.id, staffRecordId: staff.id },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.data.classTeacherId).toBe(staff.id);

    // 5. Admin revokes grant -> 200
    const revokeRes = await api(`/api/v1/academics/attendance/grants/${grantId}?branchId=${home.id}`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(revokeRes.status).toBe(200);
  });
});
