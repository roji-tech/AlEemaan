import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0131 over real HTTP: "Make default" swaps the branch's one default scheme. The old default stays (it can still be named by a result template), nothing is archived or deleted, results are
// untouched, it is audited with the previous default, and a scheme that cannot be the default (archived, one class's own, school-wide, replaced by a newer version) is refused in words.

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
const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const SCHEMES = "/api/v1/academics/assessment-schemes";
const parts = (name: string) => ({
  name,
  examMax: 60,
  components: [
    { name: "Test 1", maxScore: 20 },
    { name: "Test 2", maxScore: 20 },
  ],
});
const makeDefaultViaApi = async (cookie: string, name: string) => {
  const res = await api(SCHEMES, { method: "POST", cookie, body: { branchId: home.id, ...parts(name) } });
  expect(res.status, res.text).toBe(201);
  return res.json.data.scheme.id as string;
};
/// A scheme made for a template (hosted): not the branch default, but usable.
const hosted = async (name: string, extra: Record<string, unknown> = {}) => {
  const s = await db.assessmentScheme.create({ data: { branchId: home.id, name, totalMax: 100, examMax: 60, hosted: true, ...extra } });
  await db.assessmentComponent.create({ data: { branchId: home.id, schemeId: s.id, name: "CA", maxScore: 40, sortOrder: 0 } });
  return s.id;
};
const post = (cookie: string | undefined, id: string) => api(`${SCHEMES}/${id}/make-default`, { method: "POST", cookie });
const defaults = () =>
  db.assessmentScheme.findMany({ where: { branchId: home.id, classGroupId: null, archivedAt: null, hosted: false }, select: { id: true } });

test.describe("making a scheme the branch default", () => {
  test("it swaps with the current default, which is kept; exactly one default remains; audited once with the previous default; repeating changes nothing", async () => {
    const admin = await asRole(Role.ADMIN);
    const oldId = await makeDefaultViaApi(admin.cookie, "Old default");
    const newId = await hosted("Template scheme");
    const res = await post(admin.cookie, newId);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.scheme).toMatchObject({ id: newId, hosted: false });
    expect((await defaults()).map((d) => d.id)).toEqual([newId]);
    const old = await db.assessmentScheme.findUniqueOrThrow({ where: { id: oldId } });
    expect([old.hosted, old.archivedAt]).toEqual([true, null]); // kept, live, no longer the default
    expect(await db.assessmentComponent.count({ where: { schemeId: oldId } })).toBe(2);

    const log = await db.auditLog.findMany({ where: { action: "ASSESSMENT_SCHEME_MADE_DEFAULT" } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorUserId: admin.user.id, targetId: newId });
    expect(log[0].beforeValue).toMatchObject({ defaultSchemeId: oldId, defaultSchemeName: "Old default" });

    expect((await post(admin.cookie, newId)).status).toBe(200); // already the default
    expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_MADE_DEFAULT" } })).toBe(1);

    expect((await post(admin.cookie, oldId)).status).toBe(200); // and back again
    expect((await defaults()).map((d) => d.id)).toEqual([oldId]);
  });

  test("a branch with no default gets one; the list reports which is which", async () => {
    const admin = await asRole(Role.ADMIN);
    const id = await hosted("Only scheme");
    expect((await defaults()).length).toBe(0);
    expect((await post(admin.cookie, id)).status).toBe(200);
    const list = await api(`${SCHEMES}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(list.json.data.schemes.find((s: { id: string }) => s.id === id)).toMatchObject({ hosted: false });
  });

  test("refused in words, and nothing changes: archived, one class's own, school-wide, replaced by a newer version", async () => {
    const admin = await asRole(Role.ADMIN, home.id, true);
    const keepId = await makeDefaultViaApi(admin.cookie, "Keeps being default");
    const archived = await hosted("Archived one", { archivedAt: new Date() });
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 9", sortOrder: 9 } });
    const classOwn = await db.assessmentScheme.create({
      data: { branchId: home.id, classGroupId: group.id, name: "JSS 9 own", totalMax: 100, examMax: 60 },
    });
    const wide = await api("/api/v1/academics/schemes/global", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, ...parts("School wide") },
    });
    expect(wide.status, wide.text).toBe(201);
    const replaced = await hosted("Replaced one");
    await hosted("Replacement", { supersedesId: replaced });

    const cases: [string, RegExp][] = [
      [archived, /archived/],
      [classOwn.id, /one class/],
      [wide.json.data.scheme.id, /school-wide or a teacher/],
      [replaced, /newer version/],
    ];
    for (const [id, message] of cases) {
      const res = await post(admin.cookie, id);
      expect(res.status, res.text).toBe(409);
      expect(res.json.error.message).toMatch(message);
    }
    expect((await defaults()).map((d) => d.id)).toEqual([keepId]);
    expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_MADE_DEFAULT" } })).toBe(0);
  });

  test("who may: signed out 401; a teacher 403; another branch's administrator and an unknown id are the same 404", async () => {
    const admin = await asRole(Role.ADMIN);
    const id = await hosted("Some scheme");
    expect((await post(undefined, id)).status).toBe(401);
    expect((await post((await asRole(Role.TEACHING_STAFF)).cookie, id)).status).toBe(403);
    expect((await post((await asRole(Role.ADMIN, other.id)).cookie, id)).status).toBe(404);
    expect((await post(admin.cookie, "nope")).status).toBe(404);
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id } })).hosted).toBe(true);
  });
});
