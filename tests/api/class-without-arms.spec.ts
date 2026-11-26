import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0132 over real HTTP: a class can be used without arms. It gets ONE flagged default arm (named "_", task 0133) that holds its pupils, marks and attendance; the list says which arm it is so the Classes tab
// can leave it out; repeating is safe; a class with one arm is converted and one with two or more is refused, an archived class and an unknown class are refused; and only an administrator of the class's branch may do it.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const group = (name: string, extra: Record<string, unknown> = {}) => db.classGroup.create({ data: { branchId: home.id, name, ...extra } });
const post = (cookie: string | undefined, id: string) =>
  api(`/api/v1/academics/class-groups/${id}/without-arms`, { method: "POST", cookie });

test.describe("using a class without arms", () => {
  test("the class gets one flagged default arm, the list says so, repeating returns the same arm, audited once", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Beginner");
    const res = await post(admin.cookie, g.id);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.arm).toMatchObject({ name: "_", isDefault: true, classGroupId: g.id, branchId: home.id });

    const list = await api(`/api/v1/academics/class-groups?branchId=${home.id}`, { cookie: admin.cookie });
    const row = list.json.data.classGroups.find((c: { id: string }) => c.id === g.id);
    expect(row.arms).toHaveLength(1);
    expect(row.arms[0]).toMatchObject({ name: "_", isDefault: true });

    const again = await post(admin.cookie, g.id);
    expect(again.status).toBe(200);
    expect(again.json.data.arm.id).toBe(res.json.data.arm.id);
    expect(await db.classArm.count({ where: { classGroupId: g.id } })).toBe(1);
    const log = await db.auditLog.findMany({ where: { action: "CLASS_ARM_DEFAULT_CREATED", targetId: res.json.data.arm.id } });
    expect(log).toHaveLength(1);
    expect(log[0].actorUserId).toBe(admin.user.id);
  });

  test("a real arm can be added later; the default arm stays; a class that has two or more arms is refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Intermediate");
    await post(admin.cookie, g.id);
    const added = await api("/api/v1/academics/arms", { method: "POST", cookie: admin.cookie, body: { classGroupId: g.id, name: "A" } });
    expect(added.status, added.text).toBe(201);
    expect(await db.classArm.count({ where: { classGroupId: g.id, archivedAt: null } })).toBe(2);
    expect(added.json.data.arm.isDefault).toBe(false);

    // a class with two or more arms is refused (a class with exactly one is converted instead, task 0135)
    const armed = await group("Advanced");
    await db.classArm.createMany({
      data: [
        { branchId: home.id, classGroupId: armed.id, name: "C" },
        { branchId: home.id, classGroupId: armed.id, name: "D" },
      ],
    });
    const refused = await post(admin.cookie, armed.id);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/has 2 arms/);
    expect(await db.classArm.count({ where: { classGroupId: armed.id } })).toBe(2);

    const both = await post(admin.cookie, g.id); // default plus a real arm: no longer "without arms"
    expect(both.status).toBe(409);
  });

  test("the name _ is kept for the default arm: an ordinary arm cannot take it, and the default arm cannot be renamed (task 0133)", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Primary");
    const taken = await api("/api/v1/academics/arms", { method: "POST", cookie: admin.cookie, body: { classGroupId: g.id, name: "_" } });
    expect(taken.status).toBeGreaterThanOrEqual(400);
    expect(taken.status).toBeLessThan(500);
    expect(await db.classArm.count({ where: { classGroupId: g.id } })).toBe(0);
    const made = await post(admin.cookie, g.id);
    const armId = made.json.data.arm.id as string;
    const renamed = await api(`/api/v1/academics/arms/${armId}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Gold" } });
    expect(renamed.status).toBe(409);
    expect((await db.classArm.findUniqueOrThrow({ where: { id: armId } })).name).toBe("_");
    const real = await api("/api/v1/academics/arms", { method: "POST", cookie: admin.cookie, body: { classGroupId: g.id, name: "Main" } });
    expect(real.status, "an ordinary arm may now be called Main").toBe(201);
    const rename = await api(`/api/v1/academics/arms/${real.json.data.arm.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { name: "_" },
    });
    expect(rename.status).toBeGreaterThanOrEqual(400);
    expect(rename.status).toBeLessThan(500);
  });

  test("a pupil placed in the class with no arm named goes into its default arm, and reads as just the class (task 0133)", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Nursery");
    const made = await post(admin.cookie, g.id);
    const session = await db.academicSession.create({
      data: { branchId: home.id, label: "2031/2032", startDate: new Date("2031-09-01"), endDate: new Date("2032-07-01"), status: "ACTIVE" },
    });
    const res = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        firstName: "Noarm",
        lastName: "Pupil",
        gender: "FEMALE",
        dateOfBirth: "2020-03-03",
        className: "Nursery",
        allowDuplicate: true,
      },
    });
    expect(res.status, res.text).toBe(201);
    const enrolment = await db.studentEnrollment.findFirstOrThrow({ where: { student: { lastName: "Pupil" }, sessionId: session.id } });
    expect(enrolment.classArmId).toBe(made.json.data.arm.id);
    expect(enrolment.arm).toBeNull();
    const list = await api(`/api/v1/students?branchId=${home.id}&q=Noarm`, { cookie: admin.cookie });
    expect(list.status, list.text).toBe(200);
    const row = (list.json.data.items ?? list.json.data.students ?? list.json.data).find(
      (s: { firstName: string }) => s.firstName === "Noarm",
    );
    expect(row.currentClass).toBe("Nursery");
  });

  test("a class used without arms has a class teacher, kept on its default arm: set over HTTP, the teacher then takes its register (task 0134)", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const staff = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacher.user.id, category: "TEACHING", firstName: "Class", lastName: "Teacher" },
    });
    const g = await group("Reception");
    const armId = (await post(admin.cookie, g.id)).json.data.arm.id as string;
    const arms = (cookie: string | undefined) => api(`/api/v1/academics/attendance/arms?branchId=${home.id}`, { cookie });
    expect((await arms(teacher.cookie)).json.data).toEqual([]); // before: nothing

    const set = await api(`/api/v1/academics/arms/${armId}/class-teacher`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { branchId: home.id, staffRecordId: staff.id },
    });
    expect(set.status, set.text).toBe(200);
    expect((await db.classArm.findUniqueOrThrow({ where: { id: armId } })).classTeacherId).toBe(staff.id);
    const mine = (await arms(teacher.cookie)).json.data as { id: string; grantType: string; classGroupName: string }[];
    expect(mine.map((a) => [a.id, a.grantType, a.classGroupName])).toEqual([[armId, "CLASS_TEACHER", "Reception"]]);

    // the list the Classes tab reads carries the teacher on the hidden arm
    const list = await api(`/api/v1/academics/class-groups?branchId=${home.id}`, { cookie: admin.cookie });
    const row = (
      list.json.data.classGroups as { id: string; arms: { isDefault: boolean; classTeacher: { name: string } | null }[] }[]
    ).find((c) => c.id === g.id)!;
    expect(row.arms[0]).toMatchObject({ isDefault: true, classTeacher: { name: "Class Teacher" } });

    // and it can be taken away again
    const cleared = await api(`/api/v1/academics/arms/${armId}/class-teacher`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { branchId: home.id, staffRecordId: null },
    });
    expect(cleared.status).toBe(200);
    expect((await arms(teacher.cookie)).json.data).toEqual([]);
  });

  test("a class is made without arms in one step (withoutArms: true); without the flag it has no arm (task 0135)", async () => {
    const admin = await asRole(Role.ADMIN);
    const plain = await api("/api/v1/academics/class-groups", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Plain" },
    });
    expect(plain.status, plain.text).toBe(201);
    expect(await db.classArm.count({ where: { classGroupId: plain.json.data.classGroup.id } })).toBe(0);
    const res = await api("/api/v1/academics/class-groups", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Whole", withoutArms: true },
    });
    expect(res.status, res.text).toBe(201);
    const arms = await db.classArm.findMany({ where: { classGroupId: res.json.data.classGroup.id } });
    expect(arms.map((a) => [a.name, a.isDefault])).toEqual([["_", true]]);
    const log = await db.auditLog.findMany({ where: { action: "CLASS_ARM_DEFAULT_CREATED", targetId: arms[0].id } });
    expect(log).toHaveLength(1);
    const dup = await api("/api/v1/academics/class-groups", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Whole", withoutArms: true },
    });
    expect(dup.status).toBe(409); // a taken name still refuses, and leaves no stray arm
    expect(await db.classArm.count({ where: { branchId: home.id, name: "_" } })).toBe(1);
  });

  test("a class with ONE arm is converted: the arm becomes the default one, pupils, class teacher and marks stay; two arms are refused (task 0135)", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Advanced");
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "C", capacity: 40 } });
    const staff = await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Aliyu", lastName: "Imam" } });
    await db.classArm.update({ where: { id: arm.id }, data: { classTeacherId: staff.id } });
    const session = await db.academicSession.create({
      data: { branchId: home.id, label: "2031/2032", startDate: new Date("2031-09-01"), endDate: new Date("2032-07-01"), status: "ACTIVE" },
    });
    const made = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        firstName: "Moved",
        lastName: "Pupil",
        gender: "MALE",
        dateOfBirth: "2018-03-03",
        className: "Advanced",
        arm: "C",
        allowDuplicate: true,
      },
    });
    expect(made.status, made.text).toBe(201);
    const before = await db.studentEnrollment.findFirstOrThrow({ where: { sessionId: session.id, student: { lastName: "Pupil" } } });
    expect([before.arm, before.classArmId]).toEqual(["C", arm.id]);

    const res = await post(admin.cookie, g.id);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.arm.id).toBe(arm.id); // the SAME arm
    const after = await db.classArm.findUniqueOrThrow({ where: { id: arm.id } });
    expect([after.name, after.isDefault, after.capacity, after.classTeacherId]).toEqual(["_", true, null, staff.id]);
    const enrolment = await db.studentEnrollment.findUniqueOrThrow({ where: { id: before.id } });
    expect([enrolment.arm, enrolment.classArmId]).toEqual([null, arm.id]); // still in the same arm; its name is no longer written on the enrolment
    const log = await db.auditLog.findMany({ where: { action: "CLASS_ARM_MADE_DEFAULT", targetId: arm.id } });
    expect(log).toHaveLength(1);
    expect(log[0].beforeValue).toMatchObject({ name: "C", capacity: 40 });
    expect((await post(admin.cookie, g.id)).status).toBe(200); // repeating is safe
    expect(await db.classArm.count({ where: { classGroupId: g.id } })).toBe(1);

    const two = await group("Twin");
    await db.classArm.createMany({
      data: [
        { branchId: home.id, classGroupId: two.id, name: "A" },
        { branchId: home.id, classGroupId: two.id, name: "B" },
      ],
    });
    const refused = await post(admin.cookie, two.id);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/2 arms/);
    expect((await db.classArm.findMany({ where: { classGroupId: two.id } })).every((a) => !a.isDefault)).toBe(true);
  });

  test("a class nothing is connected to can be deleted, with its arms and subject list; one with pupils cannot (task 0135)", async () => {
    const admin = await asRole(Role.ADMIN);
    const del = (cookie: string | undefined, id: string) => api(`/api/v1/academics/class-groups/${id}`, { method: "DELETE", cookie });
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Quran" } });
    const fresh = await group("TEST");
    await post(admin.cookie, fresh.id);
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: fresh.id, subjectId: subject.id } });
    const res = await del(admin.cookie, fresh.id);
    expect(res.status, res.text).toBe(200);
    expect(await db.classGroup.count({ where: { id: fresh.id } })).toBe(0);
    expect(await db.classArm.count({ where: { classGroupId: fresh.id } })).toBe(0);
    expect(await db.subject.count({ where: { id: subject.id } })).toBe(1); // the subject itself stays
    const log = await db.auditLog.findMany({ where: { action: "CLASS_GROUP_DELETED", targetId: fresh.id } });
    expect(log).toHaveLength(1);
    expect(log[0].actorUserId).toBe(admin.user.id);
    expect(log[0].beforeValue).toMatchObject({ name: "TEST", arms: ["_"], subjects: 1 });
    expect((await del(admin.cookie, fresh.id)).status).toBe(404); // gone

    // a class with real arms and nothing in them goes too
    const armed = await group("Spare");
    await db.classArm.create({ data: { branchId: home.id, classGroupId: armed.id, name: "A" } });
    expect((await del(admin.cookie, armed.id)).status).toBe(200);

    // a class with a pupil is refused and nothing changes
    const busy = await group("Busy");
    await post(admin.cookie, busy.id);
    await db.academicSession.create({
      data: { branchId: home.id, label: "2031/2032", startDate: new Date("2031-09-01"), endDate: new Date("2032-07-01"), status: "ACTIVE" },
    });
    const made = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        firstName: "Here",
        lastName: "Stays",
        gender: "FEMALE",
        dateOfBirth: "2018-03-03",
        className: "Busy",
        allowDuplicate: true,
      },
    });
    expect(made.status, made.text).toBe(201);
    const refused = await del(admin.cookie, busy.id);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/Busy is connected to pupils/);
    expect(await db.classGroup.count({ where: { id: busy.id } })).toBe(1);
    expect(await db.classArm.count({ where: { classGroupId: busy.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "CLASS_GROUP_DELETED", targetId: busy.id } })).toBe(0);
  });

  test("who may delete a class: signed out 401; a teacher 403; another branch's administrator the same 404 as an unknown class (task 0135)", async () => {
    const g = await group("Guarded");
    const del = (cookie: string | undefined, id: string) => api(`/api/v1/academics/class-groups/${id}`, { method: "DELETE", cookie });
    expect((await del(undefined, g.id)).status).toBe(401);
    expect((await del((await asRole(Role.TEACHING_STAFF)).cookie, g.id)).status).toBe(403);
    expect((await del((await asRole(Role.ADMIN, other.id)).cookie, g.id)).status).toBe(404);
    expect((await del((await asRole(Role.ADMIN)).cookie, "nope")).status).toBe(404);
    expect(await db.classGroup.count({ where: { id: g.id } })).toBe(1);
  });

  test("an arm nothing is connected to can be deleted, with its class teacher link; one with a pupil or a timetable slot cannot (task 0136)", async () => {
    const admin = await asRole(Role.ADMIN);
    const del = (cookie: string | undefined, id: string) => api(`/api/v1/academics/arms/${id}`, { method: "DELETE", cookie });
    const g = await group("Nursery 1");
    const a = await db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "A" } });
    const b = await db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "B" } });
    const staff = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
    });
    await db.classArm.update({ where: { id: b.id }, data: { classTeacherId: staff.id } });

    const res = await del(admin.cookie, b.id);
    expect(res.status, res.text).toBe(200);
    expect(await db.classArm.count({ where: { id: b.id } })).toBe(0);
    expect(await db.classArm.count({ where: { id: a.id } })).toBe(1); // the sister arm stays
    expect(await db.staffRecord.count({ where: { id: staff.id } })).toBe(1); // the teacher's record stays
    const log = await db.auditLog.findMany({ where: { action: "CLASS_ARM_DELETED", targetId: b.id } });
    expect(log).toHaveLength(1);
    expect(log[0].actorUserId).toBe(admin.user.id);
    expect(log[0].beforeValue).toMatchObject({ name: "B", class: "Nursery 1", hadClassTeacher: true });
    expect((await del(admin.cookie, b.id)).status).toBe(404); // gone

    // a pupil in the arm, by placement
    await db.academicSession.create({
      data: { branchId: home.id, label: "2031/2032", startDate: new Date("2031-09-01"), endDate: new Date("2032-07-01"), status: "ACTIVE" },
    });
    const made = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        firstName: "Here",
        lastName: "Stays",
        gender: "FEMALE",
        dateOfBirth: "2018-03-03",
        className: "Nursery 1",
        arm: "A",
        allowDuplicate: true,
      },
    });
    expect(made.status, made.text).toBe(201);
    const refused = await del(admin.cookie, a.id);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/A is connected to pupils/);
    expect(await db.classArm.count({ where: { id: a.id } })).toBe(1);

    // a timetable slot in an otherwise empty arm
    const c = await db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "C" } });
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Maths" } });
    await db.timetableSlot.create({
      data: {
        branchId: home.id,
        classArmId: c.id,
        subjectId: subject.id,
        staffRecordId: staff.id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "08:40",
      },
    });
    const slot = await del(admin.cookie, c.id);
    expect(slot.status).toBe(409);
    expect(slot.json.error.message).toMatch(/timetable slots/);
    expect(await db.classArm.count({ where: { id: c.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "CLASS_ARM_DELETED", targetId: a.id } })).toBe(0);
  });

  test("a class's hidden default arm can be deleted while empty (the class then has no arms again); who may delete an arm (task 0136)", async () => {
    const admin = await asRole(Role.ADMIN);
    const del = (cookie: string | undefined, id: string) => api(`/api/v1/academics/arms/${id}`, { method: "DELETE", cookie });
    const g = await group("Whole");
    const armId = (await post(admin.cookie, g.id)).json.data.arm.id as string;
    expect((await del(undefined, armId)).status).toBe(401);
    expect((await del((await asRole(Role.TEACHING_STAFF)).cookie, armId)).status).toBe(403);
    expect((await del((await asRole(Role.ADMIN, other.id)).cookie, armId)).status).toBe(404);
    expect((await del((await asRole(Role.ADMIN)).cookie, "nope")).status).toBe(404);
    expect(await db.classArm.count({ where: { id: armId } })).toBe(1);
    expect((await del(admin.cookie, armId)).status).toBe(200);
    expect(await db.classArm.count({ where: { classGroupId: g.id } })).toBe(0);
    expect((await post(admin.cookie, g.id)).status).toBe(200); // and "Use without arms" works again
  });

  test("an archived class and an unknown class are refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const archived = await group("Old class", { archivedAt: new Date() });
    const res = await post(admin.cookie, archived.id);
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/archived/);
    expect(await db.classArm.count({ where: { classGroupId: archived.id } })).toBe(0);
    expect((await post(admin.cookie, "nope")).status).toBe(404);
  });

  test("who may: signed out 401; a teacher 403; another branch's administrator the same 404 as an unknown class; nothing is created", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Guarded");
    expect((await post(undefined, g.id)).status).toBe(401);
    expect((await post((await asRole(Role.TEACHING_STAFF)).cookie, g.id)).status).toBe(403);
    expect((await post((await asRole(Role.ADMIN, other.id)).cookie, g.id)).status).toBe(404);
    expect(await db.classArm.count({ where: { classGroupId: g.id } })).toBe(0);
    expect(admin.user.id).toBeTruthy();
  });
});
