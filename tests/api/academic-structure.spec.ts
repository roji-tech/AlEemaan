import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Academic structure over real HTTP (Slice P1a): classes, arms, subjects and offerings of ONE branch. Reading takes a staff role held in that branch; writing takes
// an administrator of that branch (a superadmin: any). Another branch's id is a 404 when it comes from a URL or a looked-up id and a 403 when the caller names it
// in a body. Nothing is deleted - archived rows free their names - and every change is audited.

let home: { id: string };
let other: { id: string };
test.beforeAll(async () => {
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});
test.beforeEach(async () => {
  await db.subjectOffering.deleteMany();
  await db.studentEnrollment.updateMany({ data: { classArmId: null } });
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.subject.deleteMany();
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const GROUPS = "/api/v1/academics/class-groups";
const group = async (cookie: string, name = "JSS 1", branchId = home.id) =>
  (await api(GROUPS, { method: "POST", cookie, body: { branchId, name } })).json.data.classGroup;

test.describe("who may use it", () => {
  test("signed out is 401; students, parents and people with no membership are 403; only an administrator of the branch writes", async () => {
    expect((await api(`${GROUPS}?branchId=${home.id}`)).status).toBe(401);
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const registrar = await asRole(Role.NON_TEACHING_STAFF);
    const parent = await asRole(Role.PARENT);
    for (const who of [parent]) expect((await api(`${GROUPS}?branchId=${home.id}`, { cookie: who.cookie })).status).toBe(403);
    for (const who of [teacher, registrar, parent]) {
      expect((await api(GROUPS, { method: "POST", cookie: who.cookie, body: { branchId: home.id, name: "X" } })).status, "create").toBe(
        403,
      );
    }
    expect((await api(GROUPS, { method: "POST", cookie: admin.cookie, body: { branchId: home.id, name: "JSS 1" } })).status).toBe(201);
    for (const who of [teacher, registrar]) expect((await api(`${GROUPS}?branchId=${home.id}`, { cookie: who.cookie })).status).toBe(200);
  });

  test("another branch: reading is a 404, creating by naming it in the body is a 403, and an id from another branch is the same 404 as an unknown one", async () => {
    const homeAdmin = await asRole(Role.ADMIN);
    const otherAdmin = await asRole(Role.ADMIN, other.id);
    const theirs = await group(otherAdmin.cookie, "Theirs", other.id);
    expect((await api(`${GROUPS}?branchId=${other.id}`, { cookie: homeAdmin.cookie })).status).toBe(404);
    const forbidden = await api(GROUPS, { method: "POST", cookie: homeAdmin.cookie, body: { branchId: other.id, name: "Sneaky" } });
    expect([forbidden.status, forbidden.json.error.code]).toEqual([403, "FORBIDDEN"]);
    const foreign = await api(`${GROUPS}/${theirs.id}`, { method: "PATCH", cookie: homeAdmin.cookie, body: { name: "Hijack" } });
    const unknown = await api(`${GROUPS}/no-such-id`, { method: "PATCH", cookie: homeAdmin.cookie, body: { name: "Hijack" } });
    expect([foreign.status, foreign.json]).toEqual([404, unknown.json]);
    expect(unknown.status).toBe(404);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe("Theirs");
    expect(
      (await api("/api/v1/academics/arms", { method: "POST", cookie: homeAdmin.cookie, body: { classGroupId: theirs.id, name: "A" } }))
        .status,
    ).toBe(404);
  });

  test("a superadmin writes in every branch", async () => {
    const boss = await asRole(Role.ADMIN, home.id, true);
    expect((await api(GROUPS, { method: "POST", cookie: boss.cookie, body: { branchId: other.id, name: "Anywhere" } })).status).toBe(201);
  });
});

test.describe("classes, arms and subjects", () => {
  test("create, list with arms, rename, archive frees the name, restore needs the name free; duplicates (any case) are a 409; every change is audited", async () => {
    const { cookie, user } = await asRole(Role.ADMIN);
    const jss = await group(cookie);
    expect((await api(GROUPS, { method: "POST", cookie, body: { branchId: home.id, name: "jss 1" } })).status).toBe(409);
    const arm = await api("/api/v1/academics/arms", { method: "POST", cookie, body: { classGroupId: jss.id, name: "A", capacity: 30 } });
    expect(arm.status, arm.text).toBe(201);
    expect((await api("/api/v1/academics/arms", { method: "POST", cookie, body: { classGroupId: jss.id, name: "a" } })).status).toBe(409);

    const list = await api(`${GROUPS}?branchId=${home.id}`, { cookie });
    expect(list.json.data.classGroups).toHaveLength(1);
    expect(list.json.data.classGroups[0].arms).toMatchObject([{ name: "A", capacity: 30, enrolments: 0 }]);

    expect(
      (await api(`${GROUPS}/${jss.id}`, { method: "PATCH", cookie, body: { name: "JSS One", sortOrder: 3 } })).json.data.classGroup,
    ).toMatchObject({ name: "JSS One", sortOrder: 3 });
    expect((await api(`${GROUPS}/${jss.id}`, { method: "PATCH", cookie, body: { archived: true } })).status).toBe(200);
    expect((await api(`${GROUPS}?branchId=${home.id}`, { cookie })).json.data.classGroups).toHaveLength(0);
    expect((await api(`${GROUPS}?branchId=${home.id}&includeArchived=true`, { cookie })).json.data.classGroups).toHaveLength(1);
    const again = await group(cookie, "JSS One"); // the archived one freed the name
    expect((await api(`${GROUPS}/${jss.id}`, { method: "PATCH", cookie, body: { archived: false } })).status).toBe(409); // ... so it cannot come back beside it
    expect((await api("/api/v1/academics/arms", { method: "POST", cookie, body: { classGroupId: jss.id, name: "B" } })).status).toBe(409); // an archived class takes no arm
    expect(again.name).toBe("JSS One");
    expect(await db.classGroup.count({ where: { id: jss.id } })).toBe(1); // never deleted

    const actions = (await db.auditLog.findMany({ where: { actorUserId: user.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["CLASS_GROUP_CREATED", "CLASS_ARM_CREATED", "CLASS_GROUP_UPDATED", "CLASS_GROUP_ARCHIVED"]),
    );
  });

  test("subjects: codes are upper-cased and unique among the live ones; bad input is a 400; offerings replace the set and accept only this branch's live subjects", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const otherAdmin = await asRole(Role.ADMIN, other.id);
    const math = await api("/api/v1/academics/subjects", {
      method: "POST",
      cookie,
      body: { branchId: home.id, name: "Mathematics", code: "mth" },
    });
    expect([math.status, math.json.data.subject.code]).toEqual([201, "MTH"]);
    expect(
      (await api("/api/v1/academics/subjects", { method: "POST", cookie, body: { branchId: home.id, name: "Maths 2", code: "MTH" } }))
        .status,
    ).toBe(409);
    expect(
      (await api("/api/v1/academics/subjects", { method: "POST", cookie, body: { branchId: home.id, name: "", code: "x y" } })).status,
    ).toBe(400);
    const eng = (await api("/api/v1/academics/subjects", { method: "POST", cookie, body: { branchId: home.id, name: "English" } })).json
      .data.subject;
    const foreign = (
      await api("/api/v1/academics/subjects", { method: "POST", cookie: otherAdmin.cookie, body: { branchId: other.id, name: "Foreign" } })
    ).json.data.subject;
    const jss = await group(cookie);

    const put = (subjectIds: string[]) => api(`${GROUPS}/${jss.id}/subjects`, { method: "PUT", cookie, body: { subjectIds } });
    expect((await put([math.json.data.subject.id, eng.id])).status).toBe(200);
    expect((await api(`${GROUPS}?branchId=${home.id}`, { cookie })).json.data.classGroups[0].subjectIds.sort()).toEqual(
      [math.json.data.subject.id, eng.id].sort(),
    );
    expect((await put([eng.id])).status).toBe(200);
    expect(await db.subjectOffering.count({ where: { classGroupId: jss.id } })).toBe(1);
    expect((await put([foreign.id])).status).toBe(409); // another branch's subject
    expect((await put(["nope"])).status).toBe(409);
    expect(await db.subjectOffering.count({ where: { classGroupId: jss.id } })).toBe(1); // a refused set changes nothing
    await api(`/api/v1/academics/subjects/${eng.id}`, { method: "PATCH", cookie, body: { archived: true } });
    expect((await put([eng.id])).status).toBe(409); // archived
    expect(
      (await api("/api/v1/academics/subjects?branchId=" + home.id, { cookie })).json.data.subjects.map((s: { name: string }) => s.name),
    ).toEqual(["Mathematics"]);
  });

  test("a strict body: unknown keys are a 400, never passed on", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    expect((await api(GROUPS, { method: "POST", cookie, body: { branchId: home.id, name: "X", archivedAt: "2020-01-01" } })).status).toBe(
      400,
    );
  });
});

test.describe("the student routes link the strings to a real arm", () => {
  test("creating a student whose class and arm match an arm of that branch sets classArmId; a miss leaves it null and the class list counts it as unmatched", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const jss = await group(cookie, "JSS 1");
    const arm = (await api("/api/v1/academics/arms", { method: "POST", cookie, body: { classGroupId: jss.id, name: "A" } })).json.data.arm;
    const session = await db.academicSession.upsert({
      where: { branchId_label: { branchId: home.id, label: "2031/2032" } },
      update: { status: "ACTIVE" },
      create: {
        branchId: home.id,
        label: "2031/2032",
        startDate: new Date("2031-09-01"),
        endDate: new Date("2032-07-01"),
        status: "ACTIVE",
      },
    });
    // The branch may have another ACTIVE session (other specs share this database): close it for this test and put it back afterwards.
    const displaced = await db.academicSession.findMany({
      where: { branchId: home.id, id: { not: session.id }, status: "ACTIVE" },
      select: { id: true },
    });
    await db.academicSession.updateMany({ where: { id: { in: displaced.map((d) => d.id) } }, data: { status: "CLOSED" } });
    const make = (first: string, className: string, armName: string) =>
      api("/api/v1/students", {
        method: "POST",
        cookie,
        body: {
          branchId: home.id,
          firstName: first,
          lastName: "Linked",
          gender: "FEMALE",
          dateOfBirth: "2015-03-03",
          className,
          arm: armName,
          allowDuplicate: true,
        },
      });
    const matched = await make("Hit", "jss 1", "a"); // case-insensitive
    const missed = await make("Miss", "JSS 9", "Z");
    expect([matched.status, missed.status]).toEqual([201, 201]);
    const enrol = async (first: string) =>
      db.studentEnrollment.findFirstOrThrow({ where: { student: { firstName: first, lastName: "Linked" }, sessionId: session.id } });
    expect((await enrol("Hit")).classArmId).toBe(arm.id);
    expect((await enrol("Miss")).classArmId).toBeNull();
    expect((await api(`${GROUPS}?branchId=${home.id}`, { cookie })).json.data.unmatchedEnrolments).toBeGreaterThanOrEqual(1);
    await db.studentEnrollment.deleteMany({ where: { student: { lastName: "Linked" } } });
    await db.studentRecord.deleteMany({ where: { lastName: "Linked" } });
    await db.academicSession.delete({ where: { id: session.id } }).catch(() => undefined);
    await db.academicSession.updateMany({ where: { id: { in: displaced.map((d) => d.id) } }, data: { status: "ACTIVE" } });
  });
});
