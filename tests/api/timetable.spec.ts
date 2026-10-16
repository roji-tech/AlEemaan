import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

let home: { id: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.timetableSlot.deleteMany();
  await db.staffSubjectAssignment.deleteMany();
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.subject.deleteMany();
  await db.staffRecord.deleteMany();
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("Timetable API", () => {
  test("creates slots, enforces clash detection, updates, and deletes", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    // Setup base academic entities
    const group = await db.classGroup.create({
      data: { branchId: home.id, name: "JSS 1" },
    });
    const arm1 = await db.classArm.create({
      data: { branchId: home.id, classGroupId: group.id, name: "A" },
    });
    const arm2 = await db.classArm.create({
      data: { branchId: home.id, classGroupId: group.id, name: "B" },
    });
    const subjectMath = await db.subject.create({
      data: { branchId: home.id, name: "Mathematics", code: "MTH" },
    });
    const subjectEng = await db.subject.create({
      data: { branchId: home.id, name: "English", code: "ENG" },
    });
    const staff = await db.staffRecord.create({
      data: { branchId: home.id, firstName: "Amina", lastName: "Bello", category: "TEACHING" },
    });

    // 1. Unauthenticated is 401
    const unauth = await api(`/api/v1/timetable?branchId=${home.id}`);
    expect(unauth.status).toBe(401);

    // 2. Teacher cannot create slots (403)
    const teacherCreate = await api("/api/v1/timetable", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        classArmId: arm1.id,
        subjectId: subjectMath.id,
        staffRecordId: staff.id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
      },
    });
    expect(teacherCreate.status).toBe(403);

    // 3. Admin successfully creates first slot
    const createRes = await api("/api/v1/timetable", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        classArmId: arm1.id,
        subjectId: subjectMath.id,
        staffRecordId: staff.id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
        room: "Room 101",
      },
    });
    expect(createRes.status).toBe(201);
    const slot1 = createRes.json.data;
    expect(slot1.startTime).toBe("08:00");
    expect(slot1.endTime).toBe("09:00");

    // 4. Clash detection: Teacher double-booked (same teacher on Day 1 overlapping 08:30-09:30)
    const clashRes = await api("/api/v1/timetable", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        classArmId: arm2.id, // Different class arm
        subjectId: subjectEng.id,
        staffRecordId: staff.id, // Same teacher
        dayOfWeek: 1,
        startTime: "08:30",
        endTime: "09:30",
      },
    });
    expect(clashRes.status).toBe(409);
    expect(clashRes.json.error.code).toBe("SCHEDULE_CLASH");

    // 5. List slots
    const listRes = await api(`/api/v1/timetable?branchId=${home.id}&classArmId=${arm1.id}`, {
      cookie: teacher.cookie,
    });
    expect(listRes.status).toBe(200);
    expect(listRes.json.data).toHaveLength(1);

    // 6. Update slot
    const updateRes = await api(`/api/v1/timetable/${slot1.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.json.data.startTime).toBe("09:00");

    // 7. Delete slot
    const deleteRes = await api(`/api/v1/timetable/${slot1.id}?branchId=${home.id}`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(deleteRes.status).toBe(200);

    const emptyList = await api(`/api/v1/timetable?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(emptyList.json.data).toHaveLength(0);
  });
});
