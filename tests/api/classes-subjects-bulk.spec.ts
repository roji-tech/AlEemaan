import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Bulk subjects and bulk classes over real HTTP (task 0084, requested 2026-11-17): a dry run that writes nothing, a save that is all or nothing, every rule checked again on the server,
// and the same scope as the single forms. A class is saved with its arms and the subjects it studies; subjects are looked up, never created.
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
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const SUBJECTS = "/api/v1/academics/subjects/import";
const CLASSES = "/api/v1/academics/class-groups/import";
const subjectRow = (line: number, values: Record<string, string> = {}) => ({
  line,
  values: { name: `Subject ${line}`, code: "", ...values },
});
const classRow = (line: number, values: Record<string, string> = {}) => ({
  line,
  values: { name: `Class ${line}`, arms: "", subjects: "", ...values },
});
const post = (url: string, cookie: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  api(url, { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows, ...extra } });

test("who may use them: signed out 401; a teacher 403; the administrator of another branch 403; a branch administrator may", async () => {
  for (const [url, rows] of [
    [SUBJECTS, [subjectRow(2)]],
    [CLASSES, [classRow(2)]],
  ] as const) {
    const body = { branchId: home.id, dryRun: true, rows };
    expect((await api(url, { method: "POST", body })).status, url).toBe(401);
    expect((await api(url, { method: "POST", cookie: (await asRole(Role.TEACHING_STAFF)).cookie, body })).status, url).toBe(403);
    expect((await api(url, { method: "POST", cookie: (await asRole(Role.ADMIN, other.id)).cookie, body })).status, url).toBe(403);
    expect((await api(url, { method: "POST", cookie: (await asRole(Role.ADMIN)).cookie, body })).status, url).toBe(200);
  }
});

test("subjects: a dry run writes nothing and names a saved name (any capitals) or code; an archived subject's name is free", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  await db.subject.create({ data: { branchId: home.id, name: "Mathematics", code: "MTH" } });
  await db.subject.create({ data: { branchId: home.id, name: "Old Art", code: "ART", archivedAt: new Date() } });
  const res = await post(SUBJECTS, cookie, [
    subjectRow(2, { name: "English", code: "eng" }),
    subjectRow(3, { name: "MATHEMATICS" }),
    subjectRow(4, { name: "Maths", code: "MTH" }),
    subjectRow(5, { name: "Old Art", code: "ART" }),
    subjectRow(6, { name: "" }),
  ]);
  expect(res.status).toBe(200);
  const v = res.json.data.verdicts;
  expect(v.map((x: { line: number; status: string }) => [x.line, x.status])).toEqual([
    [2, "ready"],
    [3, "error"],
    [4, "error"],
    [5, "ready"],
    [6, "error"],
  ]);
  expect(v[1].problems).toEqual([{ column: "name", message: "This branch already has a subject with that name or code." }]);
  expect(v[2].problems).toEqual([{ column: "code", message: "This branch already has a subject with that name or code." }]);
  expect(await db.subject.count({ where: { branchId: home.id } })).toBe(2);
});

test("subjects: the save is all or nothing; a clean list is saved with codes in capitals and one audit entry per subject and one for the bulk", async () => {
  const { user, cookie } = await asRole(Role.ADMIN);
  const bad = await post(SUBJECTS, cookie, [subjectRow(2, { name: "English" }), subjectRow(3, { name: "" })], { dryRun: false });
  expect([bad.status, bad.json.error.code]).toEqual([422, "BULK_PROBLEMS"]);
  expect(await db.subject.count({ where: { branchId: home.id } })).toBe(0);
  const ok = await post(SUBJECTS, cookie, [subjectRow(2, { name: "English", code: "eng" }), subjectRow(3, { name: "Biology" })], {
    dryRun: false,
  });
  expect(ok.status).toBe(201);
  expect(ok.json.data.saved).toBe(2);
  const saved = await db.subject.findMany({ where: { branchId: home.id }, orderBy: { name: "asc" } });
  expect(saved.map((s) => [s.name, s.code])).toEqual([
    ["Biology", null],
    ["English", "ENG"],
  ]);
  expect(await db.auditLog.count({ where: { action: "SUBJECT_CREATED", actorUserId: user.id } })).toBe(2);
  expect(await db.auditLog.count({ where: { action: "SUBJECT_BULK_IMPORTED", actorUserId: user.id } })).toBe(1);
});

test("classes: a dry run names an existing class (any capitals) and a subject that is not a subject of the branch; archived ones do not count as classes, and an archived subject is not a subject", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2", archivedAt: new Date() } });
  await db.subject.create({ data: { branchId: home.id, name: "Mathematics" } });
  await db.subject.create({ data: { branchId: home.id, name: "Retired", archivedAt: new Date() } });
  await db.subject.create({ data: { branchId: other.id, name: "Elsewhere" } });
  const res = await post(CLASSES, cookie, [
    classRow(2, { name: "jss 1" }),
    classRow(3, { name: "JSS 2", subjects: "mathematics" }),
    classRow(4, { name: "JSS 3", subjects: "Mathematics, Physics, Retired, Elsewhere" }),
  ]);
  expect(res.status).toBe(200);
  const v = res.json.data.verdicts;
  expect(v.map((x: { line: number; status: string }) => [x.line, x.status])).toEqual([
    [2, "error"],
    [3, "ready"],
    [4, "error"],
  ]);
  expect(v[0].problems).toEqual([{ column: "name", message: "This branch already has a class with that name." }]);
  expect(v[2].problems).toHaveLength(1);
  expect(v[2].problems[0].column).toBe("subjects");
  expect(v[2].problems[0].message).toContain('There is no subject called "Physics" in this branch. Add it on the Subjects tab first.');
  expect(v[2].problems[0].message).toContain('"Retired"');
  expect(v[2].problems[0].message).toContain('"Elsewhere"');
  expect(await db.classGroup.count({ where: { branchId: home.id } })).toBe(2);
});

test("classes: the save creates each class with its arms and the subjects it studies, with the single forms' audit entries; and it is all or nothing", async () => {
  const { user, cookie } = await asRole(Role.ADMIN);
  const maths = await db.subject.create({ data: { branchId: home.id, name: "Mathematics" } });
  const english = await db.subject.create({ data: { branchId: home.id, name: "English" } });
  const bad = await post(
    CLASSES,
    cookie,
    [classRow(2, { name: "JSS 1", arms: "A, B" }), classRow(3, { name: "JSS 2", subjects: "Nope" })],
    { dryRun: false },
  );
  expect([bad.status, bad.json.error.code]).toEqual([422, "BULK_PROBLEMS"]);
  expect(await db.classGroup.count({ where: { branchId: home.id } })).toBe(0);
  expect(await db.classArm.count({ where: { branchId: home.id } })).toBe(0);

  const res = await post(
    CLASSES,
    cookie,
    [classRow(2, { name: "JSS 1", arms: "A, B, C", subjects: "mathematics; English" }), classRow(3, { name: "JSS 2" })],
    { dryRun: false },
  );
  expect(res.status).toBe(201);
  expect(res.json.data.saved).toBe(2);
  const one = await db.classGroup.findFirstOrThrow({ where: { branchId: home.id, name: "JSS 1" } });
  expect((await db.classArm.findMany({ where: { classGroupId: one.id }, orderBy: { name: "asc" } })).map((a) => a.name)).toEqual([
    "A",
    "B",
    "C",
  ]);
  expect((await db.subjectOffering.findMany({ where: { classGroupId: one.id } })).map((o) => o.subjectId).sort()).toEqual(
    [english.id, maths.id].sort(),
  );
  const two = await db.classGroup.findFirstOrThrow({ where: { branchId: home.id, name: "JSS 2" } });
  expect(await db.classArm.count({ where: { classGroupId: two.id } })).toBe(0);
  expect(await db.subjectOffering.count({ where: { classGroupId: two.id } })).toBe(0);
  expect(await db.auditLog.count({ where: { action: "CLASS_GROUP_CREATED", actorUserId: user.id } })).toBe(2);
  expect(await db.auditLog.count({ where: { action: "CLASS_ARM_CREATED", actorUserId: user.id } })).toBe(3);
  expect(await db.auditLog.count({ where: { action: "SUBJECT_OFFERINGS_SET", actorUserId: user.id } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: "CLASS_GROUP_BULK_IMPORTED", actorUserId: user.id } })).toBe(1);
});

test("both: a body that names a key it should not, or has no rows, or is not JSON, is refused and writes nothing", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  for (const url of [SUBJECTS, CLASSES]) {
    expect((await post(url, cookie, [], {})).status, url).toBe(400);
    expect(
      (await api(url, { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows: [{ line: 2, values: {} }], extra: 1 } }))
        .status,
      url,
    ).toBe(400);
    expect((await api(url, { method: "POST", cookie, rawBody: "{nope" })).status, url).toBe(400);
  }
  expect(await db.subject.count()).toBe(0);
  expect(await db.classGroup.count()).toBe(0);
});
