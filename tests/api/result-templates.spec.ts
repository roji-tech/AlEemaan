import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";

// Task 0116 over real HTTP: result templates (a look, a marks structure and a grade scale), assigned class by class, per branch. A template is made, copied, changed, archived and made the
// default; a class is in one template, and moving one needs a confirmation; the report card and the marks sheet read the class's template; entered marks keep their structure. Who may do
// each is checked.

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

const T = "/api/v1/results/templates";
const list = (cookie: string, branchId = home.id, extra = "") => api(`${T}?branchId=${branchId}${extra}`, { cookie });
const make = (cookie: string, body: Record<string, unknown>) => api(T, { method: "POST", cookie, body: { branchId: home.id, ...body } });
const place = (cookie: string, id: string, classGroupIds: string[], confirmMoves = false) =>
  api(`${T}/${id}/classes`, { method: "PUT", cookie, body: { classGroupIds, ...(confirmMoves ? { confirmMoves: true } : {}) } });
const classNamed = (name: string, branchId = home.id, sortOrder = 0) => db.classGroup.create({ data: { branchId, name, sortOrder } });
const audits = (action: string, targetId?: string) => db.auditLog.findMany({ where: { action, ...(targetId ? { targetId } : {}) } });

test.describe("the default template", () => {
  test("a branch has one, made on first use; every class is listed as using it until someone places it", async () => {
    const admin = await asRole(Role.ADMIN);
    await classNamed("Nur 1", home.id, 1);
    await classNamed("Nur 2", home.id, 2);
    const res = await list(admin.cookie);
    expect(res.status).toBe(200);
    const { templates, coverage, unplaced, choices } = res.json.data;
    // The default and the school's four report cards (task 0116, seeded on first use).
    expect(templates).toHaveLength(5);
    expect(templates[0]).toMatchObject({
      name: "Default",
      isDefault: true,
      layoutCode: null,
      scheme: null,
      gradeScale: null,
      classGroupIds: [],
    });
    expect(coverage.map((c: { name: string; explicit: boolean }) => [c.name, c.explicit])).toEqual([
      ["Nur 1", false],
      ["Nur 2", false],
    ]);
    expect(unplaced).toBe(2);
    expect(choices.layouts.map((l: { code: string }) => l.code)).toEqual(expect.arrayContaining(["DEFAULT", "LEGACY"]));
    // Asking again does not make a second one.
    expect((await list(admin.cookie)).json.data.templates).toHaveLength(5);
    expect(await db.resultTemplate.count({ where: { branchId: home.id } })).toBe(5);
  });

  test("a branch made later gets its own default the first time it is asked for", async () => {
    const branch = await db.branch.create({ data: { name: `Late Branch ${Date.now()}` } }); // the code is assigned by the database;
    const sup = await superAdmin();
    const res = await list(sup.cookie, branch.id);
    expect(res.status).toBe(200);
    expect(res.json.data.templates).toHaveLength(5);
    expect(res.json.data.templates[0].isDefault).toBe(true);
  });
});

test.describe("making, copying and changing templates", () => {
  test("any number of templates; a name is unique among live ones ignoring case; the audit row says what was made", async () => {
    const admin = await asRole(Role.ADMIN);
    const first = await make(admin.cookie, { name: "Nursery", layoutCode: "LEGACY", layoutOptions: { signatureLine: true } });
    expect(first.status).toBe(201);
    for (const name of ["Primary", "JSS", "SSS 1 and 2", "SSS 3"]) expect((await make(admin.cookie, { name })).status).toBe(201);
    expect((await list(admin.cookie)).json.data.templates).toHaveLength(10); // five new ones, the default and the school's four report cards
    const clash = await make(admin.cookie, { name: "  nursery " });
    expect([clash.status, clash.json.error.code]).toEqual([409, "CONFLICT"]);
    expect((await make(admin.cookie, { name: "   " })).status).toBe(409);
    expect((await make(admin.cookie, { name: "x".repeat(201) })).status).toBe(400);
    const row = await db.resultTemplate.findUniqueOrThrow({ where: { id: first.json.data.id } });
    expect(row).toMatchObject({ name: "Nursery", layoutCode: "LEGACY", isDefault: false, schemeId: null, gradeScaleId: null });
    const a = await audits("RESULT_TEMPLATE_CREATED", row.id);
    expect(a).toHaveLength(1);
    expect(a[0].actorUserId).toBe(admin.user.id);
  });

  test("duplicating copies the look, the scheme and the scale, never the classes", async () => {
    const admin = await asRole(Role.ADMIN);
    const scale = await db.gradeScale.create({ data: { branchId: home.id, name: "Primary scale" } });
    const group = await classNamed("Basic 1");
    const src = await make(admin.cookie, {
      name: "Primary",
      layoutCode: "LEGACY",
      layoutOptions: { logo: false },
      gradeScaleId: scale.id,
      description: "Basic 1 to 5",
    });
    expect(src.status).toBe(201);
    expect((await place(admin.cookie, src.json.data.id, [group.id])).status).toBe(200);
    const copy = await make(admin.cookie, { name: "Primary copy", copyFrom: src.json.data.id });
    expect(copy.status).toBe(201);
    const row = await db.resultTemplate.findUniqueOrThrow({ where: { id: copy.json.data.id }, include: { classes: true } });
    expect(row).toMatchObject({ layoutCode: "LEGACY", gradeScaleId: scale.id, description: "Basic 1 to 5" });
    expect(row.layoutOptions).toEqual({ logo: false });
    expect(row.classes).toHaveLength(0);
    expect((await make(admin.cookie, { name: "From nowhere", copyFrom: "nope" })).status).toBe(409);
  });

  test("a template may name only this branch's live scheme and scale", async () => {
    const admin = await asRole(Role.ADMIN);
    const mine = await db.assessmentScheme.create({ data: { branchId: home.id, name: "Mine", totalMax: 100, examMax: 60 } });
    const theirs = await db.assessmentScheme.create({ data: { branchId: other.id, name: "Theirs", totalMax: 100, examMax: 60 } });
    const dead = await db.gradeScale.create({ data: { branchId: home.id, name: "Dead scale", archivedAt: new Date() } });
    expect((await make(admin.cookie, { name: "Ok", schemeId: mine.id })).status).toBe(201);
    expect((await make(admin.cookie, { name: "Foreign", schemeId: theirs.id })).status).toBe(409);
    expect((await make(admin.cookie, { name: "Archived scale", gradeScaleId: dead.id })).status).toBe(409);
    const t = await make(admin.cookie, { name: "Plain" });
    expect((await api(`${T}/${t.json.data.id}`, { method: "PATCH", cookie: admin.cookie, body: { schemeId: theirs.id } })).status).toBe(
      409,
    );
  });

  test("rename, describe, and set the scheme and scale; the audit row has before and after", async () => {
    const admin = await asRole(Role.ADMIN);
    const scale = await db.gradeScale.create({ data: { branchId: home.id, name: "SSS scale" } });
    const made = await make(admin.cookie, { name: "SSS" });
    const id = made.json.data.id as string;
    const patch = await api(`${T}/${id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { name: "Senior", description: "SSS 1 to 3", gradeScaleId: scale.id },
    });
    expect(patch.status, JSON.stringify(patch.json)).toBe(200);
    expect(await db.resultTemplate.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: "Senior",
      description: "SSS 1 to 3",
      gradeScaleId: scale.id,
    });
    const [row] = await audits("RESULT_TEMPLATE_UPDATED", id);
    expect(row.beforeValue).toMatchObject({ name: "SSS" });
    expect(row.afterValue).toMatchObject({ name: "Senior", gradeScaleId: scale.id });
    expect((await api(`${T}/${id}`, { method: "PATCH", cookie: admin.cookie, body: {} })).status).toBe(400); // nothing to change
    expect((await api(`${T}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { surprise: 1 } })).status).toBe(400);
  });

  test("a scheme made for a template is hosted: it does not count as the branch default, and its name must be free", async () => {
    const admin = await asRole(Role.ADMIN);
    await db.assessmentScheme.create({ data: { branchId: home.id, name: "Branch default", totalMax: 100, examMax: 60 } });
    const body = { branchId: home.id, name: "Nursery marks", examMax: 60, components: [{ name: "CA", maxScore: 40 }] };
    const made = await api(`${T}/schemes`, { method: "POST", cookie: admin.cookie, body });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    const row = await db.assessmentScheme.findUniqueOrThrow({ where: { id: made.json.data.scheme.id } });
    expect(row).toMatchObject({ hosted: true, classGroupId: null, name: "Nursery marks" });
    expect((await api(`${T}/schemes`, { method: "POST", cookie: admin.cookie, body })).status).toBe(409); // the name is taken
    expect((await api(`${T}/schemes`, { method: "POST", cookie: admin.cookie, body: { ...body, name: "Primary marks" } })).status).toBe(
      201,
    );
    expect(await db.assessmentScheme.count({ where: { branchId: home.id, hosted: false } })).toBe(1);
    expect(
      (await api(`${T}/schemes`, { method: "POST", cookie: admin.cookie, body: { ...body, name: "Bad sum", examMax: 10 } })).status,
    ).toBe(400);
  });
});

test.describe("one class, one template", () => {
  test("PUT sets the template's whole set; a class in another template moves only with the confirmation, which names it", async () => {
    const admin = await asRole(Role.ADMIN);
    const [prep, nur1, nur2] = await Promise.all([
      classNamed("Prep A", home.id, 1),
      classNamed("Nur 1", home.id, 2),
      classNamed("Nur 2", home.id, 3),
    ]);
    const a = (await make(admin.cookie, { name: "A" })).json.data.id as string;
    const b = (await make(admin.cookie, { name: "B" })).json.data.id as string;
    const first = await place(admin.cookie, a, [prep.id, nur1.id]);
    expect(first.status).toBe(200);
    expect(first.json.data).toMatchObject({ added: 2, dropped: 0, moves: [] });
    expect(await db.resultTemplateClass.count({ where: { templateId: a } })).toBe(2);

    // B wants Nur 1 (in A) and Nur 2 (in none): a move, refused until confirmed, nothing changed.
    const refused = await place(admin.cookie, b, [nur1.id, nur2.id]);
    expect([refused.status, refused.json.error.code]).toEqual([409, "CONFIRM_MOVES"]);
    expect(refused.json.error.details).toEqual([{ path: nur1.id, message: "Nur 1 leaves A" }]);
    expect(await db.resultTemplateClass.count({ where: { templateId: b } })).toBe(0);
    expect(await db.resultTemplateClass.count({ where: { templateId: a } })).toBe(2);

    const moved = await place(admin.cookie, b, [nur1.id, nur2.id], true);
    expect(moved.status).toBe(200);
    expect(moved.json.data).toMatchObject({ added: 2 });
    const rows = await db.resultTemplateClass.findMany({ where: { branchId: home.id } });
    expect(Object.fromEntries(rows.map((r) => [r.classGroupId, r.templateId]))).toEqual({ [prep.id]: a, [nur1.id]: b, [nur2.id]: b });
    const [row] = await audits("RESULT_TEMPLATE_CLASSES_ASSIGNED", b);
    expect(row.afterValue).toMatchObject({ added: [nur1.id, nur2.id], moved: [{ classGroupId: nur1.id, from: a }] });
  });

  test("classes left out of the set go back to 'uses the default'; an empty set empties it", async () => {
    const admin = await asRole(Role.ADMIN);
    const [x, y] = await Promise.all([classNamed("X"), classNamed("Y", home.id, 1)]);
    const t = (await make(admin.cookie, { name: "T" })).json.data.id as string;
    await place(admin.cookie, t, [x.id, y.id]);
    const dropped = await place(admin.cookie, t, [y.id]);
    expect(dropped.json.data).toMatchObject({ added: 0, dropped: 1 });
    expect((await list(admin.cookie)).json.data.coverage.find((c: { name: string }) => c.name === "X")).toMatchObject({ explicit: false });
    expect((await place(admin.cookie, t, [])).json.data).toMatchObject({ dropped: 1 });
    expect(await db.resultTemplateClass.count({ where: { branchId: home.id } })).toBe(0);
    expect((await place(admin.cookie, t, [])).json.data).toMatchObject({ added: 0, dropped: 0 }); // repeating is safe
  });

  test("a class of another branch, an archived class or an unknown one is refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const foreign = await classNamed("Foreign", other.id);
    const gone = await db.classGroup.create({ data: { branchId: home.id, name: "Old", archivedAt: new Date() } });
    const t = (await make(admin.cookie, { name: "T" })).json.data.id as string;
    for (const id of [foreign.id, gone.id, "nope"]) expect((await place(admin.cookie, t, [id])).status).toBe(409);
    expect(await db.resultTemplateClass.count()).toBe(0);
  });

  test("the maintainer's scenario: five templates over sixteen scattered classes, and nothing is left unplaced", async () => {
    const admin = await asRole(Role.ADMIN);
    const names = [
      "Prep A",
      "Prep B",
      "Nur 1",
      "Nur 2",
      "Basic 1",
      "Basic 2",
      "Basic 3",
      "Basic 4",
      "Basic 5",
      "Basic 6",
      "JSS 1",
      "JSS 2",
      "JSS 3",
      "SSS 1",
      "SSS 2",
      "SSS 3",
    ];
    const ids: Record<string, string> = {};
    for (const [i, n] of names.entries()) ids[n] = (await classNamed(n, home.id, i)).id;
    const plan: Record<string, string[]> = {
      A: ["Prep A", "Prep B", "Nur 1"],
      B: ["Nur 2", "Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5"],
      C: ["Basic 6", "JSS 1", "JSS 2", "JSS 3"],
      D: ["SSS 1", "SSS 2"],
      E: ["SSS 3"],
    };
    for (const [name, classes] of Object.entries(plan)) {
      const made = await make(admin.cookie, { name: `Template ${name}` });
      expect(
        (
          await place(
            admin.cookie,
            made.json.data.id,
            classes.map((c) => ids[c]),
          )
        ).status,
      ).toBe(200);
    }
    const { coverage, unplaced } = (await list(admin.cookie)).json.data;
    expect(unplaced).toBe(0);
    expect(coverage).toHaveLength(16);
    const byClass = Object.fromEntries(coverage.map((c: { name: string; templateName: string }) => [c.name, c.templateName]));
    expect(byClass).toMatchObject({
      "Prep B": "Template A",
      "Nur 2": "Template B",
      "Basic 5": "Template B",
      "Basic 6": "Template C",
      "JSS 3": "Template C",
      "SSS 2": "Template D",
      "SSS 3": "Template E",
    });
  });
});

test.describe("archive, restore and the default", () => {
  test("archiving is refused for the default and while classes are held (it names them); an empty one archives and restores", async () => {
    const admin = await asRole(Role.ADMIN);
    const group = await classNamed("Basic 1");
    const defaultId = (await list(admin.cookie)).json.data.templates[0].id as string;
    const refusedDefault = await api(`${T}/${defaultId}/archive`, { method: "POST", cookie: admin.cookie });
    expect(refusedDefault.status).toBe(409);
    const t = (await make(admin.cookie, { name: "Primary" })).json.data.id as string;
    await place(admin.cookie, t, [group.id]);
    const held = await api(`${T}/${t}/archive`, { method: "POST", cookie: admin.cookie });
    expect(held.status).toBe(409);
    expect(held.json.error.message).toContain("Basic 1");
    await place(admin.cookie, t, []);
    expect((await api(`${T}/${t}/archive`, { method: "POST", cookie: admin.cookie })).json.data).toMatchObject({ changed: true });
    expect((await api(`${T}/${t}/archive`, { method: "POST", cookie: admin.cookie })).json.data).toMatchObject({ changed: false });
    expect((await list(admin.cookie)).json.data.templates.map((x: { id: string }) => x.id)).not.toContain(t);
    expect((await list(admin.cookie, home.id, "&archived=1")).json.data.templates.map((x: { id: string }) => x.id)).toContain(t);
    expect((await place(admin.cookie, t, [group.id])).status).toBe(409); // an archived template takes no classes
    expect((await api(`${T}/${t}/restore`, { method: "POST", cookie: admin.cookie })).json.data).toMatchObject({ changed: true });
    expect(await audits("RESULT_TEMPLATE_ARCHIVED", t)).toHaveLength(1);
    expect(await audits("RESULT_TEMPLATE_RESTORED", t)).toHaveLength(1);
  });

  test("restoring is refused while a live template has its name", async () => {
    const admin = await asRole(Role.ADMIN);
    const t = (await make(admin.cookie, { name: "Primary" })).json.data.id as string;
    await api(`${T}/${t}/archive`, { method: "POST", cookie: admin.cookie });
    expect((await make(admin.cookie, { name: "Primary" })).status).toBe(201); // the name is free again
    expect((await api(`${T}/${t}/restore`, { method: "POST", cookie: admin.cookie })).status).toBe(409);
  });

  test("another template becomes the default; the old one stays a live template; there is always exactly one", async () => {
    const admin = await asRole(Role.ADMIN);
    const first = (await list(admin.cookie)).json.data.templates[0].id as string;
    const t = (await make(admin.cookie, { name: "Primary" })).json.data.id as string;
    expect((await api(`${T}/${t}/default`, { method: "POST", cookie: admin.cookie })).json.data).toMatchObject({ changed: true });
    expect((await api(`${T}/${t}/default`, { method: "POST", cookie: admin.cookie })).json.data).toMatchObject({ changed: false });
    const rows = await db.resultTemplate.findMany({ where: { branchId: home.id, archivedAt: null } });
    expect(rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([t]);
    expect(rows.map((r) => r.id)).toContain(first);
    const [row] = await audits("RESULT_TEMPLATE_DEFAULT_SET", t);
    expect(row.beforeValue).toEqual({ defaultTemplateId: first });
    // The old default can now be archived.
    expect((await api(`${T}/${first}/archive`, { method: "POST", cookie: admin.cookie })).status).toBe(200);
    // An archived template cannot be the default.
    const gone = (await make(admin.cookie, { name: "Gone" })).json.data.id as string;
    await api(`${T}/${gone}/archive`, { method: "POST", cookie: admin.cookie });
    expect((await api(`${T}/${gone}/default`, { method: "POST", cookie: admin.cookie })).status).toBe(409);
  });
});

test.describe("who may", () => {
  test("a teacher reads; an administrator of another branch gets a 404 for everything of this one; nobody signed in gets a 401", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, other.id);
    const group = await classNamed("Basic 1");
    const t = (await make(admin.cookie, { name: "Primary" })).json.data.id as string;

    expect((await list(teacher.cookie)).status).toBe(200);
    expect((await make(teacher.cookie, { name: "Mine" })).status).toBe(403);
    expect((await api(`${T}/${t}`, { method: "PATCH", cookie: teacher.cookie, body: { name: "Hers" } })).status).toBe(403);
    expect((await place(teacher.cookie, t, [group.id])).status).toBe(403);
    expect((await api(`${T}/${t}/archive`, { method: "POST", cookie: teacher.cookie })).status).toBe(403);
    expect((await api(`${T}/${t}/default`, { method: "POST", cookie: teacher.cookie })).status).toBe(403);
    expect(
      (
        await api(`${T}/schemes`, {
          method: "POST",
          cookie: teacher.cookie,
          body: { branchId: home.id, name: "S", examMax: 60, components: [{ name: "CA", maxScore: 40 }] },
        })
      ).status,
    ).toBe(403);

    expect((await list(away.cookie)).status).toBe(404);
    expect((await make(away.cookie, { name: "Foreign" })).status).toBe(403); // the branch is named in the body
    expect((await api(`${T}/${t}`, { method: "PATCH", cookie: away.cookie, body: { name: "Hers" } })).status).toBe(404);
    expect((await place(away.cookie, t, [group.id])).status).toBe(404);
    expect((await api(`${T}/${t}/archive`, { method: "POST", cookie: away.cookie })).status).toBe(404);
    expect((await api(`${T}/${t}/restore`, { method: "POST", cookie: away.cookie })).status).toBe(404);
    expect((await api(`${T}/${t}/default`, { method: "POST", cookie: away.cookie })).status).toBe(404);
    expect((await api(`${T}?branchId=${home.id}`)).status).toBe(401);
    expect(await db.resultTemplate.count({ where: { branchId: other.id } })).toBe(0);
  });

  test("a superadmin may do it in any branch", async () => {
    const sup = await superAdmin();
    expect((await make(sup.cookie, { name: "Anywhere" })).status).toBe(201);
    expect((await list(sup.cookie, other.id)).status).toBe(200);
  });
});

/// A world with the branch's default scheme (two parts of 20 + an exam of 60) and default scale, a class and arm studying a subject, and one enrolled pupil.
const SHEETS = "/api/v1/academics/result-sheets";
const CARD = (studentId: string, periodId: string) => `/api/v1/students/${studentId}/report-card?periodId=${periodId}&preview=true`;
type World = Awaited<ReturnType<typeof resultsWorld>>;
const enter = (cookie: string, w: World, parts: Record<string, number>, exam: number) =>
  api(SHEETS, {
    method: "PUT",
    cookie,
    body: { periodId: w.period.id, classArmId: w.arm.id, subjectId: w.subject.id, entries: [{ studentId: w.student.id, parts, exam }] },
  });
const defaultParts = { "Test 1": 15, "Test 2": 10 };

test.describe("what a class uses", () => {
  test("the report card's look: the class's template, else the branch's standard layout; not set follows the standard", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    expect((await enter(admin.cookie, w, defaultParts, 40)).status).toBe(200);
    const layoutOf = async () => (await api(CARD(w.student.id, w.period.id), { cookie: admin.cookie })).json.data.card.layout;
    expect(await layoutOf()).toMatchObject({ code: "DEFAULT" });

    const legacy = (
      await make(admin.cookie, {
        name: "Old look",
        layoutCode: "LEGACY",
        layoutOptions: { logo: true, signatureLine: false, nextTermDate: false },
      })
    ).json.data.id as string;
    await place(admin.cookie, legacy, [w.group.id]);
    expect(await layoutOf()).toMatchObject({ code: "LEGACY", options: { logo: true, signatureLine: false } });

    // A template that names no layout follows the branch's standard one (Approvals > Report cards).
    const plain = (await make(admin.cookie, { name: "Plain" })).json.data.id as string;
    await place(admin.cookie, plain, [w.group.id], true);
    expect(await layoutOf()).toMatchObject({ code: "DEFAULT" });
    expect(
      (await api("/api/v1/settings/layouts", { method: "PATCH", cookie: admin.cookie, body: { branchId: home.id, layoutCode: "LEGACY" } }))
        .status,
    ).toBe(200);
    expect(await layoutOf()).toMatchObject({ code: "LEGACY" });

    // Back to "uses the default": the default template names no layout either, so the standard one.
    await place(admin.cookie, plain, []);
    expect(await layoutOf()).toMatchObject({ code: "LEGACY" });
  });

  test("the marks sheet: a class's own scheme first, then its template's scheme, then the branch's; the scale is the template's, else the branch's", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id); // the branch's default scheme and scale
    const made = await api(`${T}/schemes`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Nursery marks", examMax: 60, components: [{ name: "CA", maxScore: 40 }] },
    });
    const tplScheme = made.json.data.scheme.id as string;
    const tplScale = await db.gradeScale.create({ data: { branchId: home.id, name: "Nursery scale" } });
    await db.gradeBand.createMany({
      data: [
        { branchId: home.id, scaleId: tplScale.id, minScore: 0, maxScore: 60, letter: "N", remark: "Not yet", sortOrder: 0 },
        { branchId: home.id, scaleId: tplScale.id, minScore: 60, maxScore: 100, letter: "Y", remark: "Yes", sortOrder: 1 },
      ],
    });
    const t = (await make(admin.cookie, { name: "Nursery", schemeId: tplScheme, gradeScaleId: tplScale.id })).json.data.id as string;

    // Not placed: the branch's default scheme and scale, as before.
    expect((await enter(admin.cookie, w, defaultParts, 40)).status).toBe(200);
    expect(await db.result.findFirstOrThrow({ where: { studentId: w.student.id } })).toMatchObject({
      schemeId: w.scheme.id,
      scaleId: w.scale.id,
    });

    // A second subject of the same class, placed in the template: its scheme and scale.
    const art = await db.subject.create({ data: { branchId: home.id, name: "Art" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: w.group.id, subjectId: art.id } });
    await place(admin.cookie, t, [w.group.id]);
    const sheet = await api(SHEETS, {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        periodId: w.period.id,
        classArmId: w.arm.id,
        subjectId: art.id,
        entries: [{ studentId: w.student.id, parts: { CA: 30 }, exam: 50 }],
      },
    });
    expect(sheet.status, JSON.stringify(sheet.json)).toBe(200);
    expect(await db.result.findFirstOrThrow({ where: { studentId: w.student.id, subjectId: art.id } })).toMatchObject({
      schemeId: tplScheme,
      scaleId: tplScale.id,
      gradeLetter: "Y",
    });
    // The first subject's result keeps what it was entered under.
    expect(await db.result.findFirstOrThrow({ where: { studentId: w.student.id, subjectId: w.subject.id } })).toMatchObject({
      schemeId: w.scheme.id,
      scaleId: w.scale.id,
    });

    // A class with a scheme of its own keeps it; the template's scale still applies.
    const own = await resultsWorld(home.id, "own", true);
    const ownTemplateScale = await place(admin.cookie, t, [w.group.id, own.group.id]);
    expect(ownTemplateScale.status).toBe(200);
    expect((await enter(admin.cookie, own, defaultParts, 40)).status).toBe(200);
    expect(await db.result.findFirstOrThrow({ where: { studentId: own.student.id } })).toMatchObject({
      schemeId: own.scheme.id,
      scaleId: tplScale.id,
    });
  });

  test("a result keeps its structure when the class moves; only sheets made afterwards use the new one", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const made = await api(`${T}/schemes`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Other marks", examMax: 60, components: [{ name: "CA", maxScore: 40 }] },
    });
    const t = (await make(admin.cookie, { name: "Other", schemeId: made.json.data.scheme.id })).json.data.id as string;
    await place(admin.cookie, t, [w.group.id]);
    const art = await db.subject.create({ data: { branchId: home.id, name: "Art" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: w.group.id, subjectId: art.id } });
    const entry = (subjectId: string, parts: Record<string, number>, exam: number) =>
      api(SHEETS, {
        method: "PUT",
        cookie: admin.cookie,
        body: { periodId: w.period.id, classArmId: w.arm.id, subjectId, entries: [{ studentId: w.student.id, parts, exam }] },
      });
    expect((await entry(art.id, { CA: 20 }, 40)).status).toBe(200);
    // Move the class back to the default: the entered result is not rewritten.
    await place(admin.cookie, t, []);
    expect(await db.result.findFirstOrThrow({ where: { subjectId: art.id } })).toMatchObject({ schemeId: made.json.data.scheme.id });
    expect((await entry(w.subject.id, defaultParts, 40)).status).toBe(200);
    expect(await db.result.findFirstOrThrow({ where: { subjectId: w.subject.id } })).toMatchObject({ schemeId: w.scheme.id });
  });

  test("changing a template's scheme once marks are entered in the open session needs an acknowledgement", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const a = await api(`${T}/schemes`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Marks A", examMax: 60, components: [{ name: "CA", maxScore: 40 }] },
    });
    const b = await api(`${T}/schemes`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Marks B", examMax: 50, components: [{ name: "CA", maxScore: 50 }] },
    });
    const t = (await make(admin.cookie, { name: "T", schemeId: a.json.data.scheme.id })).json.data.id as string;
    await place(admin.cookie, t, [w.group.id]);
    // Nothing entered yet: the change goes through.
    expect((await api(`${T}/${t}`, { method: "PATCH", cookie: admin.cookie, body: { schemeId: b.json.data.scheme.id } })).status).toBe(200);
    expect(
      (
        await api(SHEETS, {
          method: "PUT",
          cookie: admin.cookie,
          body: {
            periodId: w.period.id,
            classArmId: w.arm.id,
            subjectId: w.subject.id,
            entries: [{ studentId: w.student.id, parts: { CA: 40 }, exam: 40 }],
          },
        })
      ).status,
    ).toBe(200);
    // Now marks exist: refused with the count until acknowledged; the name alone is not a marks change.
    const refused = await api(`${T}/${t}`, { method: "PATCH", cookie: admin.cookie, body: { schemeId: a.json.data.scheme.id } });
    expect([refused.status, refused.json.error.code]).toEqual([409, "CONFLICT"]);
    expect(refused.json.error.message).toContain("Marks are already entered for 1 result");
    expect((await api(`${T}/${t}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Renamed" } })).status).toBe(200);
    expect(
      (await api(`${T}/${t}`, { method: "PATCH", cookie: admin.cookie, body: { schemeId: a.json.data.scheme.id, acknowledge: true } }))
        .status,
    ).toBe(200);
  });

  test("a scheme replaced by a new version is followed; one archived with nothing replacing it is a 409 naming the template", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const made = await api(`${T}/schemes`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "V1", examMax: 60, components: [{ name: "CA", maxScore: 40 }] },
    });
    const v1 = made.json.data.scheme.id as string;
    const t = (await make(admin.cookie, { name: "Versioned", schemeId: v1 })).json.data.id as string;
    await place(admin.cookie, t, [w.group.id]);
    // Version 2 supersedes version 1 (what the scheme API does once a result has locked it).
    await db.assessmentScheme.update({ where: { id: v1 }, data: { archivedAt: new Date() } });
    const v2 = await db.assessmentScheme.create({
      data: { branchId: home.id, name: "V2", totalMax: 100, examMax: 60, hosted: true, version: 2, supersedesId: v1 },
    });
    await db.assessmentComponent.create({ data: { branchId: home.id, schemeId: v2.id, name: "CA", maxScore: 40, sortOrder: 0 } });
    expect(
      (
        await api(SHEETS, {
          method: "PUT",
          cookie: admin.cookie,
          body: {
            periodId: w.period.id,
            classArmId: w.arm.id,
            subjectId: w.subject.id,
            entries: [{ studentId: w.student.id, parts: { CA: 30 }, exam: 50 }],
          },
        })
      ).status,
    ).toBe(200);
    expect(await db.result.findFirstOrThrow({ where: { studentId: w.student.id } })).toMatchObject({ schemeId: v2.id });
    // The successor is archived too: nothing live remains.
    await db.assessmentScheme.update({ where: { id: v2.id }, data: { archivedAt: new Date() } });
    const art = await db.subject.create({ data: { branchId: home.id, name: "Art" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: w.group.id, subjectId: art.id } });
    const blocked = await api(SHEETS, {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        periodId: w.period.id,
        classArmId: w.arm.id,
        subjectId: art.id,
        entries: [{ studentId: w.student.id, parts: { CA: 30 }, exam: 50 }],
      },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.message).toContain('"Versioned"');
  });
});

test.describe("the layout behind approval", () => {
  test("where a superadmin has put layouts behind approval, an administrator's change to a template's look is a request; the rest of the save applies; approving applies the look", async () => {
    const admin = await asRole(Role.ADMIN);
    const sup = await superAdmin();
    const t = (await make(admin.cookie, { name: "Primary" })).json.data.id as string;
    expect(
      (
        await api("/api/v1/settings/enforcement", {
          method: "PUT",
          cookie: sup.cookie,
          body: { key: "report_card_layout", enforced: true },
        })
      ).status,
    ).toBe(200);

    const noReason = await api(`${T}/${t}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { name: "Primary school", layoutCode: "LEGACY", layoutOptions: { logo: true } },
    });
    expect(noReason.status).toBe(400);
    expect(noReason.json.error.details[0].path).toBe("body.reason");
    expect((await db.resultTemplate.findUniqueOrThrow({ where: { id: t } })).name).toBe("Primary"); // nothing was written

    const filed = await api(`${T}/${t}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { name: "Primary school", layoutCode: "LEGACY", layoutOptions: { logo: true }, reason: "Parents prefer the old card." },
    });
    expect(filed.status).toBe(202);
    expect(filed.json.data).toMatchObject({ pending: true });
    expect(await db.resultTemplate.findUniqueOrThrow({ where: { id: t } })).toMatchObject({ name: "Primary school", layoutCode: null }); // the name applied, the look waits

    // A rename alone never needs approval.
    expect((await api(`${T}/${t}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Primary" } })).status).toBe(200);

    expect(
      (
        await api(`/api/v1/settings/approval/${filed.json.data.approvalId}`, {
          method: "PATCH",
          cookie: admin.cookie,
          body: { action: "APPROVE", decisionReason: "ok" },
        })
      ).status,
    ).toBe(403);
    const decided = await api(`/api/v1/settings/approval/${filed.json.data.approvalId}`, {
      method: "PATCH",
      cookie: sup.cookie,
      body: { action: "APPROVE", decisionReason: "Fine." },
    });
    expect(decided.status, JSON.stringify(decided.json)).toBe(200);
    expect(await db.resultTemplate.findUniqueOrThrow({ where: { id: t } })).toMatchObject({ layoutCode: "LEGACY" });

    // A superadmin's own change is immediate.
    expect((await api(`${T}/${t}`, { method: "PATCH", cookie: sup.cookie, body: { layoutCode: null } })).status).toBe(200);
    expect((await db.resultTemplate.findUniqueOrThrow({ where: { id: t } })).layoutCode).toBeNull();
  });
});
