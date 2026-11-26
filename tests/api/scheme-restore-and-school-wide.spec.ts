import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0128 over real HTTP: bringing an archived scheme or grade scale back, editing the school-wide default scheme, and copying the school-wide default into a branch (marks entry never reads the
// school-wide scheme itself: every result names its own branch's scheme, so a branch with none of its own could not enter marks, which is what the maintainer hit).

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
const SCALES = "/api/v1/academics/grade-scales";
const GLOBAL = "/api/v1/academics/schemes/global";
const parts = (extra: Record<string, unknown> = {}) => ({
  name: `Scheme ${Math.random().toString(36).slice(2, 6)}`,
  examMax: 60,
  components: [
    { name: "Test 1", maxScore: 20 },
    { name: "Test 2", maxScore: 20 },
  ],
  ...extra,
});
const bands = [
  { min: 0, max: 50, letter: "F", remark: "Fail" },
  { min: 50, max: 70, letter: "C", remark: "Credit" },
  { min: 70, max: 100, letter: "A", remark: "Excellent" },
];
const make = async (cookie: string, body: Record<string, unknown>) => {
  const res = await api(SCHEMES, { method: "POST", cookie, body: { branchId: home.id, ...body } });
  expect(res.status, res.text).toBe(201);
  return res.json.data.scheme as { id: string; name: string };
};
const archive = (cookie: string, id: string) => api(`${SCHEMES}/${id}/archive`, { method: "POST", cookie });
const restore = (cookie: string | undefined, id: string) => api(`${SCHEMES}/${id}/restore`, { method: "POST", cookie });
const live = (id: string) => db.assessmentScheme.findUniqueOrThrow({ where: { id } }).then((s) => s.archivedAt === null);

test.describe("restoring an archived scheme", () => {
  test("it comes back, repeating is safe, the list shows archived ones only when asked, and it is audited once", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts());
    await archive(admin.cookie, s.id);
    const hidden = await api(`${SCHEMES}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(hidden.json.data.schemes.map((x: { id: string }) => x.id)).not.toContain(s.id);
    const shown = await api(`${SCHEMES}?branchId=${home.id}&includeArchived=true`, { cookie: admin.cookie });
    expect(shown.json.data.schemes.find((x: { id: string }) => x.id === s.id)).toMatchObject({ archived: true });

    const back = await restore(admin.cookie, s.id);
    expect(back.status, back.text).toBe(200);
    expect(back.json.data.scheme).toMatchObject({ id: s.id, archived: false });
    expect(await live(s.id)).toBe(true);
    expect((await restore(admin.cookie, s.id)).status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_RESTORED", targetId: s.id } })).toBe(1);
  });

  test("refused, in words, when another live scheme now holds its place or its name", async () => {
    const admin = await asRole(Role.ADMIN);
    const old = await make(admin.cookie, parts({ name: "Default A" }));
    await archive(admin.cookie, old.id);
    // Another default takes the branch's place: the old one cannot come back beside it.
    const newer = await make(admin.cookie, parts({ name: "Default B" }));
    const blocked = await restore(admin.cookie, old.id);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.message).toMatch(/already has a default scheme/);
    expect(await live(old.id)).toBe(false);
    // Same name, different place (a class scheme): the name rule says so.
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 1 } });
    const classScheme = await make(admin.cookie, parts({ name: "Shared name", classGroupId: group.id }));
    await archive(admin.cookie, classScheme.id);
    await archive(admin.cookie, newer.id);
    await make(admin.cookie, parts({ name: "Shared name" }));
    const named = await restore(admin.cookie, classScheme.id);
    expect(named.status).toBe(409);
    expect(named.json.error.message).toMatch(/already called "Shared name"/);
  });

  test("a version that replaced another leaves the old one archived for good", async () => {
    const admin = await asRole(Role.ADMIN);
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2", sortOrder: 2 } });
    const v1 = await make(admin.cookie, { ...parts({ name: "Versioned" }), classGroupId: group.id });
    await db.assessmentScheme.update({ where: { id: v1.id }, data: { lockedAt: new Date() } });
    const v2 = await api(`${SCHEMES}/${v1.id}/versions`, {
      method: "POST",
      cookie: admin.cookie,
      body: { examMax: 50, components: [{ name: "CA", maxScore: 50 }] },
    });
    expect(v2.status, v2.text).toBe(201);
    const refused = await restore(admin.cookie, v1.id);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/newer version/);
    expect(await live(v1.id)).toBe(false);
  });

  test("who may: signed out 401; a teacher 403; another branch's administrator and an unknown id are the same 404", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts());
    await archive(admin.cookie, s.id);
    expect((await restore(undefined, s.id)).status).toBe(401);
    expect((await restore((await asRole(Role.TEACHING_STAFF)).cookie, s.id)).status).toBe(403);
    expect((await restore((await asRole(Role.ADMIN, other.id)).cookie, s.id)).status).toBe(404);
    expect((await restore(admin.cookie, "nope")).status).toBe(404);
    expect(await live(s.id)).toBe(false);
  });
});

test.describe("restoring an archived grade scale", () => {
  const makeScale = async (cookie: string, name: string) => {
    const res = await api(SCALES, { method: "POST", cookie, body: { branchId: home.id, name, bands } });
    expect(res.status, res.text).toBe(201);
    return res.json.data.scale as { id: string };
  };

  test("a scale comes back (never as the default); the same name held by another live scale is refused; the default cannot be archived", async () => {
    const admin = await asRole(Role.ADMIN);
    const first = await makeScale(admin.cookie, "Main"); // the first scale is the default
    const extra = await makeScale(admin.cookie, "Extra");
    expect((await api(`${SCALES}/${first.id}/archive`, { method: "POST", cookie: admin.cookie })).status).toBe(409); // the default
    expect((await api(`${SCALES}/${extra.id}/archive`, { method: "POST", cookie: admin.cookie })).status).toBe(200);
    const back = await api(`${SCALES}/${extra.id}/restore`, { method: "POST", cookie: admin.cookie });
    expect(back.status, back.text).toBe(200);
    expect(back.json.data.scale).toMatchObject({ id: extra.id, archived: false, isDefault: false });
    expect(await db.gradeScale.count({ where: { branchId: home.id, isDefault: true, archivedAt: null } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "GRADE_SCALE_RESTORED", targetId: extra.id } })).toBe(1);
    // Archive again, take the name, and it cannot come back.
    await api(`${SCALES}/${extra.id}/archive`, { method: "POST", cookie: admin.cookie });
    await makeScale(admin.cookie, "Extra");
    const named = await api(`${SCALES}/${extra.id}/restore`, { method: "POST", cookie: admin.cookie });
    expect(named.status).toBe(409);
    expect(named.json.error.message).toMatch(/already called "Extra"/);
  });

  test("who may: signed out 401; a teacher 403; another branch's administrator 404", async () => {
    const admin = await asRole(Role.ADMIN);
    await makeScale(admin.cookie, "Main");
    const extra = await makeScale(admin.cookie, "Extra");
    await api(`${SCALES}/${extra.id}/archive`, { method: "POST", cookie: admin.cookie });
    const url = `${SCALES}/${extra.id}/restore`;
    expect((await api(url, { method: "POST" })).status).toBe(401);
    expect((await api(url, { method: "POST", cookie: (await asRole(Role.TEACHING_STAFF)).cookie })).status).toBe(403);
    expect((await api(url, { method: "POST", cookie: (await asRole(Role.ADMIN, other.id)).cookie })).status).toBe(404);
  });
});

test.describe("editing the school-wide default scheme", () => {
  const makeGlobal = async (cookie: string, body: Record<string, unknown>) => {
    const res = await api(GLOBAL, { method: "POST", cookie, body: { branchId: home.id, ...body } });
    expect(res.status, res.text).toBe(201);
    const list = await api(GLOBAL, { cookie });
    return (list.json.data.schemes as { scopeId: string; scheme: { id: string; name: string } }[]).find(
      (x) => x.scheme.id === res.json.data.scheme.id,
    )!;
  };
  const edit = (cookie: string | undefined, scopeId: string, body: Record<string, unknown>) =>
    api(`${GLOBAL}/${scopeId}`, { method: "PATCH", cookie, body });

  test("a superadmin changes the parts, the exam, the name and the default; the sum must stay 100; nothing changes on a refusal; audited with before and after", async () => {
    const su = await asRole(Role.ADMIN, home.id, true);
    const a = await makeGlobal(su.cookie, {
      name: "School A",
      examMax: 60,
      components: [
        { name: "CA 1", maxScore: 20 },
        { name: "CA 2", maxScore: 20 },
      ],
      isDefault: true,
    });
    const b = await makeGlobal(su.cookie, { name: "School B", examMax: 60, components: [{ name: "CA", maxScore: 40 }], isDefault: false });
    const res = await edit(su.cookie, a.scopeId, {
      name: "School A5",
      examMax: 50,
      components: [1, 2, 3, 4, 5].map((i) => ({ name: `CA ${i}`, maxScore: 10 })),
    });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.scheme).toMatchObject({ name: "School A5", examMax: 50, isDefault: true });
    expect(res.json.data.scheme.components).toHaveLength(5);
    const row = await db.assessmentScheme.findUniqueOrThrow({ where: { id: a.scheme.id }, include: { components: true } });
    expect(row.components).toHaveLength(5);
    const log = await db.auditLog.findMany({ where: { action: "GLOBAL_SCHEME_UPDATE", targetId: a.scheme.id } });
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log[0].beforeValue)).toContain("School A");
    // The sum must be exactly 100: refused, unchanged.
    const bad = await edit(su.cookie, a.scopeId, { name: "School A5", examMax: 50, components: [{ name: "CA", maxScore: 10 }] });
    expect(bad.status).toBe(409);
    expect(bad.json.error.message).toMatch(/exactly 100/);
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: a.scheme.id } })).name).toBe("School A5");
    // Making B the default clears A's default.
    const flip = await edit(su.cookie, b.scopeId, {
      name: "School B",
      examMax: 60,
      components: [{ name: "CA", maxScore: 40 }],
      isDefault: true,
    });
    expect(flip.status, flip.text).toBe(200);
    const defaults = await db.assessmentSchemeScope.findMany({ where: { level: "GLOBAL", isDefault: true } });
    expect(defaults.map((d) => d.id)).toEqual([b.scopeId]);
    // Saving the same thing again changes nothing and is not audited again.
    const same = await edit(su.cookie, b.scopeId, {
      name: "School B",
      examMax: 60,
      components: [{ name: "CA", maxScore: 40 }],
      isDefault: true,
    });
    expect(same.json.data.changed).toBe(false);
    expect(await db.auditLog.count({ where: { action: "GLOBAL_SCHEME_UPDATE", targetId: b.scheme.id } })).toBe(1);
  });

  test("a locked or archived scheme, a name already taken, an unknown id: refused; who may: superadmin only", async () => {
    const su = await asRole(Role.ADMIN, home.id, true);
    const a = await makeGlobal(su.cookie, { name: "Edit A", examMax: 60, components: [{ name: "CA", maxScore: 40 }] });
    const b = await makeGlobal(su.cookie, { name: "Edit B", examMax: 60, components: [{ name: "CA", maxScore: 40 }], isDefault: false });
    const body = { name: "Edit A", examMax: 60, components: [{ name: "CA", maxScore: 40 }] };
    expect((await edit(su.cookie, b.scopeId, { ...body, name: "Edit A" })).status).toBe(409); // the name is taken
    await db.assessmentScheme.update({ where: { id: a.scheme.id }, data: { lockedAt: new Date() } });
    const locked = await edit(su.cookie, a.scopeId, { ...body, name: "Edit A2" });
    expect(locked.status).toBe(409);
    expect(locked.json.error.message).toMatch(/Results already use/);
    await db.assessmentScheme.update({ where: { id: b.scheme.id }, data: { archivedAt: new Date() } });
    expect((await edit(su.cookie, b.scopeId, { ...body, name: "Edit B2" })).status).toBe(409);
    expect((await edit(su.cookie, "nope", body)).status).toBe(404);
    expect((await edit(undefined, a.scopeId, body)).status).toBe(401);
    expect((await edit((await asRole(Role.ADMIN)).cookie, a.scopeId, body)).status).toBe(403);
    expect((await edit((await asRole(Role.TEACHING_STAFF)).cookie, a.scopeId, body)).status).toBe(403);
    expect((await edit(su.cookie, a.scopeId, { ...body, extra: 1 })).status).toBe(400);
  });
});

test.describe("using the school-wide scheme in a branch", () => {
  const COPY = `${SCHEMES}/from-school-wide`;
  const school = async (name = "General School-wide Schema") => {
    const su = await asRole(Role.ADMIN, home.id, true);
    const res = await api(GLOBAL, {
      method: "POST",
      cookie: su.cookie,
      body: {
        branchId: home.id,
        name,
        examMax: 60,
        components: [
          { name: "CA 1", maxScore: 20 },
          { name: "CA 2", maxScore: 20 },
        ],
        isDefault: true,
      },
    });
    expect(res.status, res.text).toBe(201);
    return su;
  };

  test("a branch with no scheme of its own copies the default: an ordinary branch scheme, audited, and marks entry works", async () => {
    await school();
    const admin = await asRole(Role.ADMIN, other.id);
    const res = await api(COPY, { method: "POST", cookie: admin.cookie, body: { branchId: other.id } });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.scheme).toMatchObject({
      name: "General School-wide Schema",
      examMax: 60,
      classGroupId: null,
      hosted: false,
      archived: false,
    });
    expect(res.json.data.scheme.components.map((c: { name: string }) => c.name)).toEqual(["CA 1", "CA 2"]);
    const row = await db.assessmentScheme.findUniqueOrThrow({ where: { id: res.json.data.scheme.id } });
    expect([row.branchId, row.hosted]).toEqual([other.id, false]);
    expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_COPIED_FROM_SCHOOL_WIDE", targetId: row.id } })).toBe(1);
    // Again: the branch has its default now.
    const again = await api(COPY, { method: "POST", cookie: admin.cookie, body: { branchId: other.id } });
    expect(again.status).toBe(409);
    expect(again.json.error.message).toMatch(/already has a default scheme/);
  });

  test("in the branch that hosts the school-wide scheme the copy gets a distinct name (live names are unique per branch)", async () => {
    await school("Same name");
    const admin = await asRole(Role.ADMIN);
    const res = await api(COPY, { method: "POST", cookie: admin.cookie, body: { branchId: home.id } });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.scheme.name).toBe("Same name (branch default)");
  });

  test("no school-wide default yet is a 409 that says so; who may: signed out 401, a teacher 403, another branch's administrator 403; a strict body", async () => {
    const admin = await asRole(Role.ADMIN);
    const none = await api(COPY, { method: "POST", cookie: admin.cookie, body: { branchId: home.id } });
    expect(none.status).toBe(409);
    expect(none.json.error.message).toMatch(/no school-wide default scheme/);
    await school();
    expect((await api(COPY, { method: "POST", body: { branchId: home.id } })).status).toBe(401);
    expect(
      (await api(COPY, { method: "POST", cookie: (await asRole(Role.TEACHING_STAFF)).cookie, body: { branchId: home.id } })).status,
    ).toBe(403);
    expect(
      (await api(COPY, { method: "POST", cookie: (await asRole(Role.ADMIN, other.id)).cookie, body: { branchId: home.id } })).status,
    ).toBe(403);
    expect((await api(COPY, { method: "POST", cookie: admin.cookie, body: { branchId: home.id, extra: 1 } })).status).toBe(400);
    expect(await db.assessmentScheme.count({ where: { branchId: home.id, hosted: false } })).toBe(0);
  });
});
