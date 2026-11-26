import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0132 over real HTTP: a class can be used without arms. It gets ONE flagged default arm (named "_", task 0133) that holds its pupils, marks and attendance; the list says which arm it is so the Classes tab
// can leave it out; repeating is safe; a class that already has arms, an archived class and an unknown class are refused; and only an administrator of the class's branch may do it.

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

  test("a real arm can be added later; the default arm stays; a class that already has arms is refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await group("Intermediate");
    await post(admin.cookie, g.id);
    const added = await api("/api/v1/academics/arms", { method: "POST", cookie: admin.cookie, body: { classGroupId: g.id, name: "A" } });
    expect(added.status, added.text).toBe(201);
    expect(await db.classArm.count({ where: { classGroupId: g.id, archivedAt: null } })).toBe(2);
    expect(added.json.data.arm.isDefault).toBe(false);

    const armed = await group("Advanced");
    await db.classArm.create({ data: { branchId: home.id, classGroupId: armed.id, name: "C" } });
    const refused = await post(admin.cookie, armed.id);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/already has arms/);
    expect(await db.classArm.count({ where: { classGroupId: armed.id } })).toBe(1);

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
