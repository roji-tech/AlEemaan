import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0101 D7 over real HTTP: the branch's "Use departments" switch, departments and their members, heads and subjects, who may do what (an administrator everything; the head of a
// department its members and subjects only; other staff read; another branch nothing), the audit rows, and the staff list carrying each person's departments.

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

const asRole = async (role: Role, branchIds: string[] = [home.id]) => {
  const user = await createUser();
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
let n = 0;
const record = (branchId: string, extra: object = {}) =>
  db.staffRecord.create({
    data: {
      branchId,
      category: "TEACHING",
      firstName: `Dept${++n}`,
      lastName: "Person",
      email: `dept${n}-${Date.now()}@school.example`,
      ...extra,
    },
  });
const subject = (branchId: string, name = `Subject ${++n}`) => db.subject.create({ data: { branchId, name } });

const DEPTS = "/api/v1/academics/departments";
const turnOn = (cookie: string, branchId = home.id, enabled = true) =>
  api("/api/v1/settings/departments", { method: "PUT", cookie, body: { branchId, enabled } });
const create = (cookie: string, name: string, branchId = home.id) => api(DEPTS, { method: "POST", cookie, body: { branchId, name } });
const list = (cookie: string, branchId = home.id, extra = "") => api(`${DEPTS}?branchId=${branchId}${extra}`, { cookie });
const addMembers = (cookie: string, id: string, staffIds: string[]) =>
  api(`${DEPTS}/${id}/members`, { method: "POST", cookie, body: { staffIds } });
const setHead = (cookie: string, id: string, staffRecordId: string | null, replacing: string | null) =>
  api(`${DEPTS}/${id}/head`, { method: "PUT", cookie, body: { staffRecordId, replacing } });
const addSubjects = (cookie: string, id: string, subjectIds: string[]) =>
  api(`${DEPTS}/${id}/subjects`, { method: "POST", cookie, body: { subjectIds } });

/// A branch administrator with departments on and one department, "Sciences".
async function withSciences() {
  const admin = await asRole(Role.ADMIN);
  expect((await turnOn(admin.cookie)).status).toBe(200);
  const made = await create(admin.cookie, "Sciences");
  expect(made.status, JSON.stringify(made.json)).toBe(201);
  return { admin, id: made.json.data.department.id as string };
}

test.describe("the branch's switch", () => {
  test("off until an administrator turns it on; every write is refused while off; turning it off keeps everything; the change is audited", async () => {
    const admin = await asRole(Role.ADMIN);
    expect((await api(`/api/v1/settings/departments?branchId=${home.id}`, { cookie: admin.cookie })).json.data).toEqual({
      branchId: home.id,
      enabled: false,
    });
    const refused = await create(admin.cookie, "Sciences");
    expect([refused.status, refused.json.error.code]).toEqual([409, "CONFLICT"]);

    expect((await turnOn(admin.cookie)).json.data).toMatchObject({ enabled: true, changed: true });
    expect((await turnOn(admin.cookie)).json.data).toMatchObject({ enabled: true, changed: false });
    const made = await create(admin.cookie, "Sciences");
    expect(made.status).toBe(201);

    expect((await turnOn(admin.cookie, home.id, false)).json.data).toMatchObject({ enabled: false, changed: true });
    expect((await create(admin.cookie, "Languages")).status).toBe(409);
    expect(await db.department.count({ where: { branchId: home.id } })).toBe(1); // nothing deleted
    expect((await list(admin.cookie)).json.data).toMatchObject({ enabled: false });
    expect((await turnOn(admin.cookie)).status).toBe(200);
    expect((await list(admin.cookie)).json.data.departments.map((d: { name: string }) => d.name)).toEqual(["Sciences"]);

    const audits = await db.settingAudit.findMany({
      where: { settingKey: "academics.useDepartments", branchId: home.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((a) => [a.oldValue, a.newValue])).toEqual([
      [false, true],
      [true, false],
      [false, true],
    ]);
  });

  test("who may turn it on: an administrator of the branch (not another's, not a teacher)", async () => {
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    expect((await turnOn(elsewhere.cookie)).status).toBe(403); // a branch named in a body that is not theirs
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await turnOn(teacher.cookie)).status).toBe(403);
    expect((await api(`/api/v1/settings/departments?branchId=${home.id}`, { cookie: teacher.cookie })).status).toBe(200); // staff read
    expect((await api(`/api/v1/settings/departments?branchId=${home.id}`, { cookie: elsewhere.cookie })).status).toBe(404);
  });
});

test.describe("departments", () => {
  test("create, rename, describe, archive and restore; live names are unique ignoring case and an archived one frees its name; all audited", async () => {
    const { admin, id } = await withSciences();
    const dup = await create(admin.cookie, "  sciences ");
    expect([dup.status, dup.json.error.code]).toEqual([409, "CONFLICT"]);
    expect((await create(admin.cookie, "")).status).toBe(400);
    expect((await create(admin.cookie, "x".repeat(81))).status).toBe(400);
    expect((await api(DEPTS, { method: "POST", cookie: admin.cookie, body: { branchId: home.id, name: "Odd", surprise: 1 } })).status).toBe(
      400,
    ); // strict

    const renamed = await api(`${DEPTS}/${id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { name: "Natural   Sciences", description: "Maths excluded" },
    });
    expect(renamed.json.data.department).toMatchObject({ name: "Natural Sciences" });
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: {} })).status).toBe(400);

    expect(
      (await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { archived: true } })).json.data.department.archived,
    ).toBe(true);
    expect((await list(admin.cookie)).json.data.departments).toEqual([]);
    expect((await list(admin.cookie, home.id, "&includeArchived=true")).json.data.departments).toHaveLength(1);
    expect((await create(admin.cookie, "Natural Sciences")).status).toBe(201); // the archived one freed the name
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { archived: false } })).status).toBe(409); // now taken again
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Old Sciences" } })).status).toBe(409); // archived: restore first

    const actions = (await db.auditLog.findMany({ where: { targetType: "Department", targetId: id }, orderBy: { createdAt: "asc" } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(["DEPARTMENT_CREATED", "DEPARTMENT_UPDATED", "DEPARTMENT_ARCHIVED"]);
  });

  test("the list carries the head, members and subjects, and says who may change each", async () => {
    const { admin, id } = await withSciences();
    const a = await record(home.id);
    const b = await record(home.id);
    const maths = await subject(home.id, "Mathematics");
    expect((await addMembers(admin.cookie, id, [a.id, b.id])).json.data).toEqual({ added: 2, skipped: 0 });
    expect((await setHead(admin.cookie, id, a.id, null)).status).toBe(200);
    expect((await addSubjects(admin.cookie, id, [maths.id])).json.data).toMatchObject({ added: 1, moved: 0 });
    const seen = (await list(admin.cookie)).json.data.departments[0];
    expect(seen).toMatchObject({ name: "Sciences", head: { staffRecordId: a.id }, canManage: true });
    expect(seen.members.map((m: { staffRecordId: string; isHead: boolean }) => [m.staffRecordId, m.isHead])).toEqual([
      [a.id, true],
      [b.id, false],
    ]);
    expect(seen.subjects.map((s: { name: string }) => s.name)).toEqual(["Mathematics"]);
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await list(teacher.cookie)).json.data.departments[0].canManage).toBe(false);
  });

  test("another branch's administrator does not see or touch it (404), a teacher cannot create or rename", async () => {
    const { admin, id } = await withSciences();
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    expect((await list(elsewhere.cookie)).status).toBe(404);
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: elsewhere.cookie, body: { name: "Mine" } })).status).toBe(404);
    expect((await addMembers(elsewhere.cookie, id, ["x"])).status).toBe(404);
    expect((await create(elsewhere.cookie, "Mine")).status).toBe(403); // a branch named in the body that is not theirs
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await create(teacher.cookie, "Mine")).status).toBe(403);
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: teacher.cookie, body: { name: "Mine" } })).status).toBe(404);
    expect((await api(`${DEPTS}/no-such-department`, { method: "PATCH", cookie: admin.cookie, body: { name: "Mine" } })).status).toBe(404);
    const parent = await asRole(Role.PARENT);
    expect((await list(parent.cookie)).status).toBe(403);
  });
});

test.describe("members and the head", () => {
  test("only live staff of the same branch; one bad id refuses all; adding twice skips; removing; all audited", async () => {
    const { admin, id } = await withSciences();
    const a = await record(home.id);
    const away = await record(other.id);
    const gone = await record(home.id, { archivedAt: new Date() });
    for (const bad of [away.id, gone.id, "no-such-record"]) {
      const refused = await addMembers(admin.cookie, id, [a.id, bad]);
      expect([refused.status, refused.json.error.code]).toEqual([409, "CONFLICT"]);
    }
    expect(await db.departmentMember.count({ where: { departmentId: id } })).toBe(0); // nothing was added
    expect((await addMembers(admin.cookie, id, [a.id, a.id])).json.data).toEqual({ added: 1, skipped: 0 });
    expect((await addMembers(admin.cookie, id, [a.id])).json.data).toEqual({ added: 0, skipped: 1 });
    expect((await api(`${DEPTS}/${id}/members/${a.id}`, { method: "DELETE", cookie: admin.cookie })).status).toBe(200);
    expect((await api(`${DEPTS}/${id}/members/${a.id}`, { method: "DELETE", cookie: admin.cookie })).status).toBe(404);
    const actions = (await db.auditLog.findMany({ where: { targetType: "Department", targetId: id }, orderBy: { createdAt: "asc" } })).map(
      (x) => x.action,
    );
    expect(actions).toEqual(["DEPARTMENT_CREATED", "DEPARTMENT_MEMBER_ADDED", "DEPARTMENT_MEMBER_REMOVED"]);
    expect((await addMembers(admin.cookie, id, [])).status).toBe(400);
  });

  test("the head replaces the old head in one step: the old head stays a member, a non-member becomes one, exactly one head, audited with old and new", async () => {
    const { admin, id } = await withSciences();
    const a = await record(home.id);
    const b = await record(home.id);
    const c = await record(home.id);
    await addMembers(admin.cookie, id, [a.id, b.id]);
    expect((await setHead(admin.cookie, id, a.id, null)).json.data).toMatchObject({ changed: true });
    expect((await setHead(admin.cookie, id, a.id, a.id)).json.data).toMatchObject({ changed: false }); // choosing the head again

    const stale = await setHead(admin.cookie, id, b.id, null); // looking at "no head" while a is the head
    expect([stale.status, stale.json.error.code]).toEqual([409, "CONFLICT"]);
    expect((await db.departmentMember.findMany({ where: { departmentId: id, isHead: true } })).map((m) => m.staffRecordId)).toEqual([a.id]);

    expect((await setHead(admin.cookie, id, b.id, a.id)).json.data).toMatchObject({ changed: true });
    let members = await db.departmentMember.findMany({ where: { departmentId: id } });
    expect(members.filter((m) => m.isHead).map((m) => m.staffRecordId)).toEqual([b.id]);
    expect(members.map((m) => m.staffRecordId).sort()).toEqual([a.id, b.id].sort()); // the old head stays

    expect((await setHead(admin.cookie, id, c.id, b.id)).status).toBe(200); // c was not a member
    members = await db.departmentMember.findMany({ where: { departmentId: id } });
    expect(members.filter((m) => m.isHead).map((m) => m.staffRecordId)).toEqual([c.id]);
    expect(members).toHaveLength(3);

    expect((await setHead(admin.cookie, id, null, c.id)).json.data).toMatchObject({ changed: true });
    expect(await db.departmentMember.count({ where: { departmentId: id, isHead: true } })).toBe(0);

    const away = await record(other.id);
    expect((await setHead(admin.cookie, id, away.id, null)).status).toBe(409); // another branch's record
    const last = (
      await db.auditLog.findMany({ where: { action: "DEPARTMENT_HEAD_SET", targetId: id }, orderBy: { createdAt: "asc" } })
    ).map((x) => [
      (x.beforeValue as { staffRecordId: string | null }).staffRecordId,
      (x.afterValue as { staffRecordId: string | null }).staffRecordId,
    ]);
    expect(last).toEqual([
      [null, a.id],
      [a.id, b.id],
      [b.id, c.id],
      [c.id, null],
    ]);
  });

  test("the database itself allows one head: a second head row is refused", async () => {
    const { id } = await withSciences();
    const a = await record(home.id);
    const b = await record(home.id);
    await db.departmentMember.create({ data: { branchId: home.id, departmentId: id, staffRecordId: a.id, isHead: true } });
    await expect(
      db.departmentMember.create({ data: { branchId: home.id, departmentId: id, staffRecordId: b.id, isHead: true } }),
    ).rejects.toThrow();
  });

  test("a person may be in several departments, and be head of one and a member of another", async () => {
    const { admin, id } = await withSciences();
    const languages = (await create(admin.cookie, "Languages")).json.data.department.id as string;
    const a = await record(home.id);
    await addMembers(admin.cookie, id, [a.id]);
    await setHead(admin.cookie, id, a.id, null);
    await addMembers(admin.cookie, languages, [a.id]);
    const mine = (await api(`/api/v1/staff?branchId=${home.id}`, { cookie: admin.cookie })).json.data.staff.find(
      (s: { id: string }) => s.id === a.id,
    );
    expect(mine.departments).toEqual([
      { id: languages, name: "Languages", isHead: false },
      { id, name: "Sciences", isHead: true },
    ]);
  });
});

test.describe("a head of department", () => {
  /// A teacher with an account, a staff record linked to it, and the headship of Sciences; and another department, Languages.
  async function headOfSciences() {
    const { admin, id } = await withSciences();
    const teacher = await asRole(Role.TEACHING_STAFF);
    const mine = await record(home.id, { userId: teacher.user.id });
    await addMembers(admin.cookie, id, [mine.id]);
    expect((await setHead(admin.cookie, id, mine.id, null)).status).toBe(200);
    const languages = (await create(admin.cookie, "Languages")).json.data.department.id as string;
    return { admin, teacher, id, languages, mine };
  }

  test("adds and removes members and subjects of THEIR department; the list says they can", async () => {
    const { teacher, id } = await headOfSciences();
    const colleague = await record(home.id);
    const physics = await subject(home.id, "Physics");
    expect((await list(teacher.cookie)).json.data.departments.find((d: { id: string }) => d.id === id).canManage).toBe(true);
    expect((await addMembers(teacher.cookie, id, [colleague.id])).json.data).toEqual({ added: 1, skipped: 0 });
    expect((await addSubjects(teacher.cookie, id, [physics.id])).json.data).toMatchObject({ added: 1 });
    expect((await api(`${DEPTS}/${id}/subjects/${physics.id}`, { method: "DELETE", cookie: teacher.cookie })).status).toBe(200);
    expect((await api(`${DEPTS}/${id}/members/${colleague.id}`, { method: "DELETE", cookie: teacher.cookie })).status).toBe(200);
  });

  test("not another department, not the name, the archive or the head; another teacher cannot even change members", async () => {
    const { teacher, id, languages, mine } = await headOfSciences();
    const colleague = await record(home.id);
    expect((await list(teacher.cookie)).json.data.departments.find((d: { id: string }) => d.id === languages).canManage).toBe(false);
    for (const res of [
      await addMembers(teacher.cookie, languages, [colleague.id]),
      await addSubjects(teacher.cookie, languages, ["x"]),
      await api(`${DEPTS}/${languages}/members/${mine.id}`, { method: "DELETE", cookie: teacher.cookie }),
    ])
      expect(res.status).toBe(403);
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: teacher.cookie, body: { name: "Mine now" } })).status).toBe(404); // administrators only
    expect((await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: teacher.cookie, body: { archived: true } })).status).toBe(404);
    expect((await setHead(teacher.cookie, id, colleague.id, mine.id)).status).toBe(404);
    expect((await create(teacher.cookie, "Mine")).status).toBe(403);
    expect((await turnOn(teacher.cookie, home.id, false)).status).toBe(403);

    const other2 = await asRole(Role.TEACHING_STAFF);
    expect((await addMembers(other2.cookie, id, [colleague.id])).status).toBe(403);
    expect((await api(`${DEPTS}/${id}/members/${mine.id}`, { method: "DELETE", cookie: other2.cookie })).status).toBe(403);
  });

  test("a head loses the power the moment they are no longer the head, or their record is archived", async () => {
    const { admin, teacher, id, mine } = await headOfSciences();
    const colleague = await record(home.id);
    expect((await addMembers(teacher.cookie, id, [colleague.id])).status).toBe(200);
    await db.staffRecord.update({ where: { id: mine.id }, data: { archivedAt: new Date() } });
    expect((await addMembers(teacher.cookie, id, [(await record(home.id)).id])).status).toBe(403);
    await db.staffRecord.update({ where: { id: mine.id }, data: { archivedAt: null } });
    expect((await addMembers(teacher.cookie, id, [(await record(home.id)).id])).status).toBe(200);
    await setHead(admin.cookie, id, colleague.id, mine.id);
    expect((await addMembers(teacher.cookie, id, [(await record(home.id)).id])).status).toBe(403);
  });
});

test.describe("subjects", () => {
  test("a subject is in one department: adding it elsewhere moves it (counted, audited with where it came from); only live subjects of the branch", async () => {
    const { admin, id } = await withSciences();
    const languages = (await create(admin.cookie, "Languages")).json.data.department.id as string;
    const maths = await subject(home.id, "Mathematics");
    const away = await subject(other.id, "Elsewhere");
    const gone = await db.subject.create({ data: { branchId: home.id, name: "Old", archivedAt: new Date() } });
    for (const bad of [away.id, gone.id, "no-such-subject"])
      expect((await addSubjects(admin.cookie, id, [maths.id, bad])).status).toBe(409);
    expect((await db.subject.findUniqueOrThrow({ where: { id: maths.id } })).departmentId).toBeNull();

    expect((await addSubjects(admin.cookie, id, [maths.id])).json.data).toEqual({ added: 1, moved: 0, skipped: 0 });
    expect((await addSubjects(admin.cookie, id, [maths.id])).json.data).toEqual({ added: 0, moved: 0, skipped: 1 });
    expect((await addSubjects(admin.cookie, languages, [maths.id])).json.data).toEqual({ added: 1, moved: 1, skipped: 0 });
    expect((await db.subject.findUniqueOrThrow({ where: { id: maths.id } })).departmentId).toBe(languages);
    const moved = (await db.auditLog.findMany({ where: { action: "DEPARTMENT_SUBJECT_ADDED", targetId: languages } }))[0];
    expect(moved.afterValue).toMatchObject({ name: "Mathematics", from: "Sciences" });

    // The subject list says where each subject is.
    const subjects = (await api(`/api/v1/academics/subjects?branchId=${home.id}`, { cookie: admin.cookie })).json.data.subjects;
    expect(subjects.find((s: { id: string }) => s.id === maths.id).department).toEqual({ id: languages, name: "Languages" });

    expect((await api(`${DEPTS}/${languages}/subjects/${maths.id}`, { method: "DELETE", cookie: admin.cookie })).status).toBe(200);
    expect((await api(`${DEPTS}/${languages}/subjects/${maths.id}`, { method: "DELETE", cookie: admin.cookie })).status).toBe(404);
  });

  test("archiving a department keeps its members, head and subjects; an archived department takes no changes; a subject listed under an archived department shows none", async () => {
    const { admin, id } = await withSciences();
    const a = await record(home.id);
    const maths = await subject(home.id, "Mathematics");
    await addMembers(admin.cookie, id, [a.id]);
    await setHead(admin.cookie, id, a.id, null);
    await addSubjects(admin.cookie, id, [maths.id]);
    await api(`${DEPTS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { archived: true } });
    expect(await db.departmentMember.count({ where: { departmentId: id } })).toBe(1);
    expect((await db.subject.findUniqueOrThrow({ where: { id: maths.id } })).departmentId).toBe(id);
    expect((await addMembers(admin.cookie, id, [(await record(home.id)).id])).status).toBe(409);
    const subjects = (await api(`/api/v1/academics/subjects?branchId=${home.id}`, { cookie: admin.cookie })).json.data.subjects;
    expect(subjects.find((s: { id: string }) => s.id === maths.id).department).toBeNull();
    const staff = (await api(`/api/v1/staff?branchId=${home.id}`, { cookie: admin.cookie })).json.data.staff.find(
      (s: { id: string }) => s.id === a.id,
    );
    expect(staff.departments).toEqual([]);
  });
});
