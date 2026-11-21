import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";
import { resultFootprint } from "../support/result-footprint";

// Task 0126 over real HTTP: the template a class's cards used for a term is recorded when that class's results are first published, so moving the class to another template later does not
// change how that term prints; an unlock that leaves nothing of the class published lets the term follow the class again; a term nothing was published in always follows the class.

let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});
const asAdmin = async () => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const TEMPLATES = "/api/v1/results/templates";
const TRANSITION = "/api/v1/academics/results/transition";
type World = Awaited<ReturnType<typeof resultsWorld>>;

async function setUp() {
  const w = await resultsWorld(home.id);
  const admin = await asAdmin();
  const list = await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie });
  const templates = list.json.data.templates as { id: string; layoutCode: string | null }[];
  const senior = templates.find((t) => t.layoutCode === "SENIOR")!;
  const basic = templates.find((t) => t.layoutCode === "BASIC")!;
  const place = async (id: string) =>
    (
      await api(`${TEMPLATES}/${id}/classes`, {
        method: "PUT",
        cookie: admin.cookie,
        body: { classGroupIds: [w.group.id], confirmMoves: true },
      })
    ).status;
  expect(await place(senior.id)).toBe(200);
  // APPROVED results: ready to be published through the workflow (which is what records the template).
  const approved = (subjectId: string) =>
    db.result.create({
      data: {
        branchId: home.id,
        studentId: w.student.id,
        subjectId,
        periodId: w.period.id,
        classArmId: w.arm.id,
        schemeId: w.scheme.id,
        scaleId: w.scale.id,
        componentScores: [{ name: "Test 1", max: 40, score: 30 }],
        examScore: 40,
        examMax: 60,
        caTotal: 30,
        total: 70,
        maxScore: 100,
        gradeLetter: "B",
        gradeRemark: "Good",
        enteredByUserId: admin.user.id,
        ...resultFootprint("APPROVED", admin.user.id),
      },
    });
  const result = await approved(w.subject.id);
  return { w, admin, senior, basic, place, result, approved };
}
const go = (cookie: string, action: string, resultIds: string[], reason?: string) =>
  api(TRANSITION, { method: "POST", cookie, body: { action, resultIds, ...(reason ? { reason } : {}) } });
const layoutOf = async (cookie: string, w: World, periodId = w.period.id) =>
  (await api(`/api/v1/students/${w.student.id}/report-card?periodId=${periodId}&preview=true`, { cookie })).json.data.card.layout
    .code as string;
const uses = () => db.resultTemplateUse.findMany({ where: { branchId: home.id } });

test("publishing records the class's template for the term; moving the class later does not change that term; an unlock lets it follow the class again", async () => {
  const t = await setUp();
  expect(await uses()).toHaveLength(0);
  expect(await layoutOf(t.admin.cookie, t.w)).toBe("SENIOR");

  expect((await go(t.admin.cookie, "publish", [t.result.id])).status).toBe(200);
  const recorded = await uses();
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({ periodId: t.w.period.id, classGroupId: t.w.group.id, templateId: t.senior.id });

  // The class moves to the basic template: the published term still prints as the senior card.
  expect(await t.place(t.basic.id)).toBe(200);
  expect(await layoutOf(t.admin.cookie, t.w)).toBe("SENIOR");
  const traits = await api(`/api/v1/students/${t.w.student.id}/report-traits?periodId=${t.w.period.id}`, { cookie: t.admin.cookie });
  expect(traits.json.data.sheet.template.layoutCode).toBe("SENIOR");

  // Publishing again (a second result of the class) does not overwrite what was recorded.
  const more = await t.approved((await db.subject.create({ data: { branchId: home.id, name: "Second subject" } })).id);
  expect((await go(t.admin.cookie, "publish", [more.id])).status).toBe(200);
  expect((await uses()).map((u) => u.templateId)).toEqual([t.senior.id]);

  // An unlock that leaves one result published keeps the record; one that leaves none clears it.
  expect((await go(t.admin.cookie, "unlock", [t.result.id], "Fixing a mark")).status).toBe(200);
  expect(await uses()).toHaveLength(1);
  expect((await go(t.admin.cookie, "unlock", [more.id], "Fixing a mark")).status).toBe(200);
  expect(await uses()).toHaveLength(0);
  expect(await layoutOf(t.admin.cookie, t.w)).toBe("BASIC");
});

test("a term nothing was published in follows the class; another term's record does not reach it", async () => {
  const t = await setUp();
  const second = await db.academicPeriod.create({
    data: {
      branchId: home.id,
      sessionId: t.w.session.id,
      ordinal: 2,
      label: "2nd Term",
      startDate: new Date("2027-01-05"),
      isCurrent: false,
    },
  });
  expect((await go(t.admin.cookie, "publish", [t.result.id])).status).toBe(200);
  expect(await t.place(t.basic.id)).toBe(200);
  expect(await layoutOf(t.admin.cookie, t.w, t.w.period.id)).toBe("SENIOR");
  expect(await layoutOf(t.admin.cookie, t.w, second.id)).toBe("BASIC");
});
