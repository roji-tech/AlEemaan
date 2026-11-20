import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";

// Task 0116 (the maintainer, 2026-11-20): "make the scale editable per class per branch, and always superadmin editable", and the seeded junior scale is UNCONFIRMED until someone confirms or edits its
// bands (publishing results graded on it is refused). Over real HTTP: who may, the resolution order (class, template, branch default), an archived scale is a 409 never a silent substitute, entered
// marks keep their scale, the audit, and the publish guard in the results workflow.

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
const superAdmin = async () => {
  // A superadmin holds at least one membership (a superadmin flag alone grants nothing); `role: ADMIN` gives both.
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
type World = Awaited<ReturnType<typeof resultsWorld>>;

const TEMPLATES = "/api/v1/results/templates";
const SCALES = "/api/v1/academics/grade-scales";
const SHEETS = "/api/v1/academics/result-sheets";
const TRANSITION = "/api/v1/academics/results/transition";
const putScale = (cookie: string, body: Record<string, unknown>) => api(`${TEMPLATES}/class-scale`, { method: "PUT", cookie, body });
const entry = (cookie: string, w: World, subjectId = w.subject.id) =>
  api(SHEETS, {
    method: "PUT",
    cookie,
    body: {
      periodId: w.period.id,
      classArmId: w.arm.id,
      subjectId,
      entries: [{ studentId: w.student.id, parts: { "Test 1": 15, "Test 2": 10 }, exam: 40 }],
    },
  });
const BANDS = [
  { min: 0, max: 50, letter: "N", remark: "Not yet" },
  { min: 50, max: 100, letter: "Y", remark: "Yes" },
];
const makeScale = async (cookie: string, name: string, branchId = home.id) => {
  const res = await api(SCALES, { method: "POST", cookie, body: { branchId, name, bands: BANDS } });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json.data.scale.id as string;
};
const extraSubject = async (w: World, name: string) => {
  const subject = await db.subject.create({ data: { branchId: home.id, name } });
  await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: w.group.id, subjectId: subject.id } });
  return subject.id;
};

test.describe("a class's own grade scale", () => {
  test("set and cleared by an administrator; audited with before and after; a repeat changes nothing", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const scaleId = await makeScale(admin.cookie, "Nursery scale");
    const set = await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: scaleId });
    expect(set.status, JSON.stringify(set.json)).toBe(200);
    expect(set.json.data).toEqual({ changed: true, gradeScaleId: scaleId });
    expect(await db.classGradeScale.findFirstOrThrow({ where: { classGroupId: w.group.id } })).toMatchObject({
      gradeScaleId: scaleId,
      branchId: home.id,
    });
    expect((await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: scaleId })).json.data.changed).toBe(
      false,
    );
    const cleared = await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: null });
    expect(cleared.json.data).toEqual({ changed: true, gradeScaleId: null });
    expect(await db.classGradeScale.count()).toBe(0);
    const [a, b] = await db.auditLog.findMany({
      where: { targetId: w.group.id, action: { startsWith: "RESULT_CLASS_SCALE" } },
      orderBy: { createdAt: "asc" },
    });
    expect([a.action, b.action]).toEqual(["RESULT_CLASS_SCALE_SET", "RESULT_CLASS_SCALE_CLEARED"]);
    expect(a.beforeValue).toEqual({ gradeScaleId: null });
    expect(a.afterValue).toMatchObject({ gradeScaleId: scaleId, branchId: home.id });
    expect(b.beforeValue).toEqual({ gradeScaleId: scaleId });
    expect(a.actorUserId).toBe(admin.user.id);
  });

  test("who may: an administrator of the branch and a superadmin everywhere; a teacher, non-teaching staff, another branch's administrator and nobody signed in may not", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const clerk = await asRole(Role.NON_TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, other.id);
    const sup = await superAdmin();
    const w = await resultsWorld(home.id);
    const scaleId = await makeScale(admin.cookie, "Nursery scale");
    const body = { branchId: home.id, classGroupId: w.group.id, gradeScaleId: scaleId };
    expect((await putScale(teacher.cookie, body)).status).toBe(403);
    expect((await putScale(clerk.cookie, body)).status).toBe(403);
    expect((await putScale(away.cookie, body)).status).toBe(403); // the branch is named in the body
    expect((await api(`${TEMPLATES}/class-scale`, { method: "PUT", body })).status).toBe(401);
    expect(await db.classGradeScale.count()).toBe(0);
    // A superadmin sets it in this branch and in another one.
    expect((await putScale(sup.cookie, body)).status).toBe(200);
    const foreignGroup = await db.classGroup.create({ data: { branchId: other.id, name: "Foreign class" } });
    const foreignScale = await makeScale(away.cookie, "Foreign scale", other.id);
    expect((await putScale(sup.cookie, { branchId: other.id, classGroupId: foreignGroup.id, gradeScaleId: foreignScale })).status).toBe(
      200,
    );
    expect(await db.classGradeScale.count()).toBe(2);
  });

  test("the class and the scale must be live ones of the same branch; extra fields are refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const away = await asRole(Role.ADMIN, other.id);
    const w = await resultsWorld(home.id);
    const mine = await makeScale(admin.cookie, "Mine");
    const theirs = await makeScale(away.cookie, "Theirs", other.id);
    const foreignGroup = await db.classGroup.create({ data: { branchId: other.id, name: "Foreign class" } });
    const archived = await db.classGroup.create({ data: { branchId: home.id, name: "Old", archivedAt: new Date() } });
    const deadScale = await db.gradeScale.create({ data: { branchId: home.id, name: "Dead scale", archivedAt: new Date() } });
    for (const body of [
      { branchId: home.id, classGroupId: w.group.id, gradeScaleId: theirs },
      { branchId: home.id, classGroupId: foreignGroup.id, gradeScaleId: mine },
      { branchId: home.id, classGroupId: archived.id, gradeScaleId: mine },
      { branchId: home.id, classGroupId: w.group.id, gradeScaleId: deadScale.id },
      { branchId: home.id, classGroupId: w.group.id, gradeScaleId: "nope" },
    ]) {
      const res = await putScale(admin.cookie, body);
      expect([res.status, res.json.error.code], JSON.stringify(body)).toEqual([409, "CONFLICT"]);
    }
    expect((await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: mine, extra: 1 })).status).toBe(400);
    expect((await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id })).status).toBe(400);
    expect(await db.classGradeScale.count()).toBe(0);
  });

  test("resolution order on the marks sheet: the class's own scale, then its template's, then the branch default; entered marks keep theirs", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id); // its scale is the branch default
    const templateScale = await makeScale(admin.cookie, "Template scale");
    const classScale = await makeScale(admin.cookie, "Class scale");
    const tpl = await api(TEMPLATES, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Own template", gradeScaleId: templateScale, classGroupIds: [w.group.id] },
    });
    expect(tpl.status, JSON.stringify(tpl.json)).toBe(201);
    const subjects = [w.subject.id, await extraSubject(w, "Art"), await extraSubject(w, "Music")];
    // 1. the template's scale beats the branch default
    expect((await entry(admin.cookie, w, subjects[0])).status).toBe(200);
    expect((await db.result.findFirstOrThrow({ where: { subjectId: subjects[0] } })).scaleId).toBe(templateScale);
    // 2. the class's own scale beats the template's
    expect((await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: classScale })).status).toBe(200);
    expect((await entry(admin.cookie, w, subjects[1])).status).toBe(200);
    expect((await db.result.findFirstOrThrow({ where: { subjectId: subjects[1] } })).scaleId).toBe(classScale);
    // the first subject's result keeps what it was entered under
    expect((await db.result.findFirstOrThrow({ where: { subjectId: subjects[0] } })).scaleId).toBe(templateScale);
    // 3. cleared: back to the template's; and with no template scale either, the branch default
    await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: null });
    expect((await entry(admin.cookie, w, subjects[2])).status).toBe(200);
    expect((await db.result.findFirstOrThrow({ where: { subjectId: subjects[2] } })).scaleId).toBe(templateScale);
    const bare = await resultsWorld(home.id, "bare", true);
    const art = await extraSubject(bare, "Bare art");
    expect((await entry(admin.cookie, bare, art)).status).toBe(200);
    // The branch's default scale (the first world's) is what a class in no template with no scale of its own grades on.
    expect((await db.result.findFirstOrThrow({ where: { subjectId: art } })).scaleId).toBe(w.scale.id);
  });

  test("a scale replaced by a new version is followed; one archived with nothing replacing it is a 409 naming the class, never another scale", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const v1 = await makeScale(admin.cookie, "Versioned");
    await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: v1 });
    const subjects = [w.subject.id, await extraSubject(w, "Art"), await extraSubject(w, "Music")];
    expect((await entry(admin.cookie, w, subjects[0])).status).toBe(200); // locks v1
    const next = await api(`${SCALES}/${v1}/versions`, {
      method: "POST",
      cookie: admin.cookie,
      body: {
        name: "Versioned",
        bands: [
          { min: 0, max: 40, letter: "N", remark: "Not yet" },
          { min: 40, max: 100, letter: "Y", remark: "Yes" },
        ],
      },
    });
    expect(next.status, JSON.stringify(next.json)).toBe(201);
    const v2 = next.json.data.scale.id as string;
    expect((await entry(admin.cookie, w, subjects[1])).status).toBe(200);
    expect((await db.result.findFirstOrThrow({ where: { subjectId: subjects[1] } })).scaleId).toBe(v2); // followed to the live successor
    expect((await db.result.findFirstOrThrow({ where: { subjectId: subjects[0] } })).scaleId).toBe(v1); // the entered one keeps its version
    await db.gradeScale.update({ where: { id: v2 }, data: { archivedAt: new Date() } });
    const blocked = await entry(admin.cookie, w, subjects[2]);
    expect([blocked.status, blocked.json.error.code]).toEqual([409, "CONFLICT"]);
    expect(blocked.json.error.message).toContain(`The grade scale chosen for ${w.group.name} is archived`);
    expect(await db.result.count({ where: { subjectId: subjects[2] } })).toBe(0);
  });

  test("the coverage says which scale each class grades on and from where; the choices carry the scales", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const classScale = await makeScale(admin.cookie, "Class scale");
    const before = (await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie })).json.data;
    const row0 = before.coverage.find((c: { classGroupId: string }) => c.classGroupId === w.group.id);
    expect(row0).toMatchObject({ classScaleId: null, scale: { id: w.scale.id, source: "branch", unconfirmed: false } });
    await putScale(admin.cookie, { branchId: home.id, classGroupId: w.group.id, gradeScaleId: classScale });
    const after = (await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie })).json.data;
    expect(after.coverage.find((c: { classGroupId: string }) => c.classGroupId === w.group.id)).toMatchObject({
      classScaleId: classScale,
      scale: { id: classScale, name: "Class scale", source: "class" },
    });
    expect(after.choices.scales.map((s: { id: string }) => s.id)).toContain(classScale);
    // A teacher reads it (staff-read) but cannot set it.
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: teacher.cookie })).status).toBe(200);
  });
});

/// The seeded junior scale of this branch (seeded the first time the templates are read).
async function juniorScale(cookie: string) {
  await api(`${TEMPLATES}?branchId=${home.id}`, { cookie });
  return db.gradeScale.findFirstOrThrow({ where: { branchId: home.id, name: "Junior secondary report card scale" } });
}
/// An APPROVED result graded on `scaleId`, ready to publish.
async function approved(w: World, scaleId: string, subjectId = w.subject.id) {
  const by = await createUser();
  return db.result.create({
    data: {
      branchId: home.id,
      studentId: w.student.id,
      subjectId,
      periodId: w.period.id,
      classArmId: w.arm.id,
      schemeId: w.scheme.id,
      scaleId,
      componentScores: [{ name: "Test 1", max: 20, score: 10 }],
      examScore: 50,
      examMax: 60,
      caTotal: 10,
      total: 60,
      maxScore: 100,
      gradeLetter: "B",
      gradeRemark: "Good",
      status: "APPROVED",
      enteredByUserId: by.id,
    },
  });
}
const publish = (cookie: string, ids: string[]) => api(TRANSITION, { method: "POST", cookie, body: { action: "publish", resultIds: ids } });

test.describe("an unconfirmed grade scale", () => {
  test("the seeded junior scale is unconfirmed, the senior and the plain scales are not; the list says so", async () => {
    const admin = await asRole(Role.ADMIN);
    const junior = await juniorScale(admin.cookie);
    expect(junior.unconfirmed).toBe(true);
    expect(await db.gradeScale.findMany({ where: { branchId: home.id, unconfirmed: true } })).toHaveLength(1);
    const list = (await api(`${SCALES}?branchId=${home.id}`, { cookie: admin.cookie })).json.data.scales as {
      id: string;
      unconfirmed: boolean;
    }[];
    expect(list.find((s) => s.id === junior.id)?.unconfirmed).toBe(true);
    expect(list.filter((s) => s.unconfirmed)).toHaveLength(1);
  });

  test("entering and approving work, but publishing results graded on it is a 409 that says where to confirm; a confirmed scale publishes", async () => {
    const admin = await asRole(Role.ADMIN);
    const second = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const junior = await juniorScale(admin.cookie);
    const r = await approved(w, junior.id);
    const refused = await publish(second.cookie, [r.id]);
    expect([refused.status, refused.json.error.code]).toEqual([409, "CONFLICT"]);
    expect(refused.json.error.message).toContain("Junior secondary report card scale");
    expect(refused.json.error.message).toContain("Results > Templates");
    expect((await db.result.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("APPROVED");
    // A result on a confirmed scale publishes in the same branch.
    const ok = await approved(w, w.scale.id, await extraSubject(w, "Art"));
    expect((await publish(second.cookie, [ok.id])).status).toBe(200);
    // One unconfirmed result in a batch stops the whole batch (all or nothing).
    const art = await extraSubject(w, "Music");
    const fine = await approved(w, w.scale.id, art);
    expect((await publish(second.cookie, [fine.id, r.id])).status).toBe(409);
    expect((await db.result.findUniqueOrThrow({ where: { id: fine.id } })).status).toBe("APPROVED");
    // Confirm, and it publishes.
    expect((await api(`${SCALES}/${junior.id}/confirm`, { method: "POST", cookie: admin.cookie })).status).toBe(200);
    expect((await publish(second.cookie, [r.id, fine.id])).status).toBe(200);
  });

  test("Confirm these bands: a branch administrator and a superadmin may; a teacher and another branch's administrator may not; repeating is safe; audited with who", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, other.id);
    const sup = await superAdmin();
    const junior = await juniorScale(admin.cookie);
    const url = `${SCALES}/${junior.id}/confirm`;
    expect((await api(url, { method: "POST", cookie: teacher.cookie })).status).toBe(403);
    expect((await api(url, { method: "POST", cookie: away.cookie })).status).toBe(404);
    expect((await api(url, { method: "POST" })).status).toBe(401);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: junior.id } })).unconfirmed).toBe(true);
    const done = await api(url, { method: "POST", cookie: admin.cookie });
    expect(done.json.data).toEqual({ id: junior.id, changed: true });
    expect((await api(url, { method: "POST", cookie: sup.cookie })).json.data.changed).toBe(false);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: junior.id } })).unconfirmed).toBe(false);
    const rows = await db.auditLog.findMany({ where: { action: "GRADE_SCALE_CONFIRMED", targetId: junior.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(admin.user.id);
    expect(rows[0].afterValue).toMatchObject({ unconfirmed: false, branchId: home.id });
    expect((await api(`${SCALES}/nope/confirm`, { method: "POST", cookie: admin.cookie })).status).toBe(404);
    // A superadmin confirms another branch's scale.
    await api(`${TEMPLATES}?branchId=${other.id}`, { cookie: sup.cookie });
    const foreign = await db.gradeScale.findFirstOrThrow({ where: { branchId: other.id, unconfirmed: true } });
    expect((await api(`${SCALES}/${foreign.id}/confirm`, { method: "POST", cookie: sup.cookie })).json.data.changed).toBe(true);
  });

  test("editing and saving changed bands confirms it; a rename alone does not", async () => {
    const admin = await asRole(Role.ADMIN);
    const junior = await juniorScale(admin.cookie);
    const bands = (await db.gradeBand.findMany({ where: { scaleId: junior.id }, orderBy: { minScore: "asc" } })).map((b) => ({
      min: Number(b.minScore),
      max: Number(b.maxScore),
      letter: b.letter,
      remark: b.remark,
    }));
    const rename = await api(`${SCALES}/${junior.id}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Junior scale renamed" } });
    expect(rename.status, JSON.stringify(rename.json)).toBe(200);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: junior.id } })).unconfirmed).toBe(true);
    const changed = bands.map((b) => (b.letter === "A" ? { ...b, min: 75 } : b.letter === "B" ? { ...b, max: 75 } : b));
    expect((await api(`${SCALES}/${junior.id}`, { method: "PATCH", cookie: admin.cookie, body: { bands: changed } })).status).toBe(200);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: junior.id } })).unconfirmed).toBe(false);
    const [row] = await db.auditLog.findMany({
      where: { action: "GRADE_SCALE_UPDATED", targetId: junior.id },
      orderBy: { createdAt: "desc" },
    });
    expect(row.afterValue).toMatchObject({ confirmedByEdit: true });
  });

  test("once marks have used it, an edit is a new version that is confirmed; the earlier version stays unconfirmed, its results cannot be published, and it can be confirmed on its own", async () => {
    const admin = await asRole(Role.ADMIN);
    const second = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const junior = await juniorScale(admin.cookie);
    const r = await approved(w, junior.id);
    await db.gradeScale.update({ where: { id: junior.id }, data: { lockedAt: new Date() } }); // a result uses it
    const bands = (await db.gradeBand.findMany({ where: { scaleId: junior.id }, orderBy: { minScore: "asc" } })).map((b) => ({
      min: Number(b.minScore),
      max: Number(b.maxScore),
      letter: b.letter,
      remark: b.remark,
    }));
    const changed = bands.map((b) => (b.letter === "A" ? { ...b, min: 75 } : b.letter === "B" ? { ...b, max: 75 } : b));
    const made = await api(`${SCALES}/${junior.id}/versions`, { method: "POST", cookie: admin.cookie, body: { bands: changed } });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    const v2 = await db.gradeScale.findUniqueOrThrow({ where: { id: made.json.data.scale.id } });
    expect(v2.unconfirmed).toBe(false); // the bands were edited
    const old = await db.gradeScale.findUniqueOrThrow({ where: { id: junior.id } });
    expect([old.unconfirmed, old.archivedAt !== null]).toEqual([true, true]);
    // The result graded on the earlier version cannot be published; the list names it.
    const refused = await publish(second.cookie, [r.id]);
    expect(refused.status).toBe(409);
    const list = (await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie })).json.data;
    expect(list.choices.earlierUnconfirmed).toEqual([{ id: junior.id, name: "Junior secondary report card scale", version: 1 }]);
    expect((await api(`${SCALES}/${junior.id}/confirm`, { method: "POST", cookie: admin.cookie })).json.data.changed).toBe(true);
    expect((await publish(second.cookie, [r.id])).status).toBe(200);
    // A rename-only new version of an unconfirmed scale stays unconfirmed.
    const again = await db.gradeScale.create({
      data: { branchId: home.id, name: "Another guess", unconfirmed: true, lockedAt: new Date() },
    });
    await db.gradeBand.createMany({
      data: bands.map((b, i) => ({
        branchId: home.id,
        scaleId: again.id,
        minScore: b.min,
        maxScore: b.max,
        letter: b.letter,
        remark: b.remark,
        sortOrder: i,
      })),
    });
    const renamed = await api(`${SCALES}/${again.id}/versions`, {
      method: "POST",
      cookie: admin.cookie,
      body: { name: "Another guess v2" },
    });
    expect(renamed.status, JSON.stringify(renamed.json)).toBe(201);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: renamed.json.data.scale.id } })).unconfirmed).toBe(true);
  });
});
