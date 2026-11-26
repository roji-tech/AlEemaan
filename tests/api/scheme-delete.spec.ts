import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultFootprint } from "../support/result-footprint";
import { resultsWorld } from "../support/results-world";

// Task 0128 over real HTTP: a scheme that is connected to nothing can be deleted for good (the maintainer: "if I create a new schema and it is not connected to anything, I should be able to delete
// it"). Anything that holds it (marks, a report-card template, a school-wide or teacher level, a version history) is refused in words and archiving stays the way out. Nothing is removed on a refusal.

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
const make = async (cookie: string, body: Record<string, unknown>) => {
  const res = await api(SCHEMES, { method: "POST", cookie, body: { branchId: home.id, ...body } });
  expect(res.status, res.text).toBe(201);
  return res.json.data.scheme as { id: string; name: string };
};
const del = (cookie: string | undefined, id: string) => api(`${SCHEMES}/${id}`, { method: "DELETE", cookie });
const exists = async (id: string) => (await db.assessmentScheme.count({ where: { id } })) === 1;
const partCount = (id: string) => db.assessmentComponent.count({ where: { schemeId: id } });

test.describe("deleting a scheme that is connected to nothing", () => {
  test("a new branch default is deleted with its parts; it leaves the list (archived too) and the name and place are free again; audited with what it was", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts({ name: "Throwaway" }));
    expect(await partCount(s.id)).toBe(2);

    const res = await del(admin.cookie, s.id);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toMatchObject({ deleted: true, name: "Throwaway" });
    expect(await exists(s.id)).toBe(false);
    expect(await partCount(s.id)).toBe(0);
    for (const q of ["", "&includeArchived=true"]) {
      const list = await api(`${SCHEMES}?branchId=${home.id}${q}`, { cookie: admin.cookie });
      expect(list.json.data.schemes.map((x: { id: string }) => x.id)).not.toContain(s.id);
    }

    const log = await db.auditLog.findMany({ where: { action: "ASSESSMENT_SCHEME_DELETED", targetId: s.id } });
    expect(log).toHaveLength(1);
    expect(log[0].actorUserId).toBe(admin.user.id);
    expect(log[0].beforeValue).toMatchObject({ name: "Throwaway", examMax: 60, archived: false });
    expect((log[0].beforeValue as { components: unknown[] }).components).toHaveLength(2);

    const again = await make(admin.cookie, parts({ name: "Throwaway" })); // the name and the branch's default place are free again
    expect(again.id).not.toBe(s.id);
  });

  test("repeating the delete, and an unknown id, are the same 404; nothing else is touched", async () => {
    const admin = await asRole(Role.ADMIN);
    const keep = await make(admin.cookie, parts({ name: "Keep" }));
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 3", sortOrder: 3 } });
    const gone = await make(admin.cookie, { ...parts({ name: "Gone" }), classGroupId: group.id });
    expect((await del(admin.cookie, gone.id)).status).toBe(200);
    expect((await del(admin.cookie, gone.id)).status).toBe(404);
    expect((await del(admin.cookie, "nope")).status).toBe(404);
    expect(await exists(keep.id)).toBe(true);
    expect(await partCount(keep.id)).toBe(2);
    expect(await db.classGroup.count({ where: { id: group.id } })).toBe(1); // a class's own scheme goes; the class stays
    expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_DELETED" } })).toBe(1);
  });

  test("an archived scheme that nothing uses can be deleted too", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts());
    await api(`${SCHEMES}/${s.id}/archive`, { method: "POST", cookie: admin.cookie });
    const res = await del(admin.cookie, s.id);
    expect(res.status, res.text).toBe(200);
    expect(await exists(s.id)).toBe(false);
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "ASSESSMENT_SCHEME_DELETED", targetId: s.id } })).toMatchObject({
      beforeValue: expect.objectContaining({ archived: true }),
    });
  });
});

test.describe("what keeps a scheme from being deleted", () => {
  const refused = async (cookie: string, id: string, message: RegExp) => {
    const before = {
      exists: await exists(id),
      parts: await partCount(id),
      audits: await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_DELETED" } }),
    };
    const res = await del(cookie, id);
    expect(res.status, res.text).toBe(409);
    expect(res.json.error.message).toMatch(message);
    expect(await exists(id)).toBe(before.exists);
    expect(await partCount(id)).toBe(before.parts);
    expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_DELETED" } })).toBe(before.audits); // a refusal leaves no trace of a delete
  };

  test("a scheme a result names stays even if it were never locked; so does a locked one", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id, "DEL");
    const by = await createUser();
    // A result row without the lock (the database lets a locked scheme never go back, so the order is: result first, lock after): the result check holds it by itself.
    await db.result.create({
      data: {
        branchId: home.id,
        studentId: w.student.id,
        subjectId: w.subject.id,
        periodId: w.period.id,
        classArmId: w.arm.id,
        schemeId: w.scheme.id,
        scaleId: w.scale.id,
        componentScores: [{ name: "Test 1", max: 20, score: 10 }],
        examScore: 50,
        examMax: 60,
        caTotal: 10,
        total: 60,
        maxScore: 100,
        gradeLetter: "B",
        gradeRemark: "Good",
        enteredByUserId: by.id,
        ...resultFootprint("DRAFT", by.id),
      },
    });
    await refused(admin.cookie, w.scheme.id, /Marks already use this scheme/);
    await db.assessmentScheme.update({ where: { id: w.scheme.id }, data: { lockedAt: new Date() } });
    await refused(admin.cookie, w.scheme.id, /Marks already use this scheme/);
  });

  test("a scheme a report-card template uses stays", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts());
    await db.resultTemplate.create({ data: { branchId: home.id, name: "Card using it", schemeId: s.id } });
    await refused(admin.cookie, s.id, /report-card template uses this scheme/);
  });

  test("a version history stays: the older version (locked) and the newer one (it replaced another)", async () => {
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
    await refused(admin.cookie, v1.id, /Marks already use this scheme/); // the older one was locked (that is why a version was made)
    await refused(admin.cookie, v2.json.data.scheme.id, /version history/); // never locked, but it replaced the first
  });

  test("a school-wide scheme and a teacher's level scheme stay (they are changed under Scheme levels)", async () => {
    const su = await asRole(Role.ADMIN, home.id, true);
    const made = await api(GLOBAL, {
      method: "POST",
      cookie: su.cookie,
      body: { branchId: home.id, ...parts({ name: "School standard" }) },
    });
    expect(made.status, made.text).toBe(201);
    await refused(su.cookie, made.json.data.scheme.id, /school-wide or a teacher's own scheme/);

    const mine = await make(su.cookie, parts({ name: "Teacher's own" }));
    await db.assessmentSchemeScope.create({
      data: { schemeId: mine.id, level: "TEACHER_SUBJECT", branchId: home.id, teacherUserId: su.user.id },
    });
    await refused(su.cookie, mine.id, /school-wide or a teacher's own scheme/);
  });

  test("a scheme a teacher's draft was approved into stays", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts());
    const teacher = await createUser();
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Maths DEL" } });
    await db.assessmentSchemeDraft.create({
      data: {
        branchId: home.id,
        teacherUserId: teacher.id,
        subjectId: subject.id,
        name: "Draft",
        caParts: [{ name: "Test 1", maxScore: 40, sortOrder: 0 }],
        totalMax: 100,
        examMax: 60,
        reason: "Test",
        approvedSchemeId: s.id,
      },
    });
    await refused(admin.cookie, s.id, /school-wide or a teacher's own scheme/);
  });
});

test.describe("who may delete", () => {
  test("signed out 401; a teacher 403; another branch's administrator gets the same 404 as an unknown id; nothing is removed", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await make(admin.cookie, parts());
    expect((await del(undefined, s.id)).status).toBe(401);
    expect((await del((await asRole(Role.TEACHING_STAFF)).cookie, s.id)).status).toBe(403);
    expect((await del((await asRole(Role.ADMIN, other.id)).cookie, s.id)).status).toBe(404);
    expect(await exists(s.id)).toBe(true);
    expect(await partCount(s.id)).toBe(2);
  });
});
