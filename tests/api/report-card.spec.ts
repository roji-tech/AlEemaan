import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";

// The report card, the remarks and public verification over real HTTP (Slice P2c). The card is computed from PUBLISHED results (an administrator may preview the rest),
// positions use competition ranking, remarks freeze at publication, and the public page proves a result is genuine while saying nothing about its marks.

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
const SHEETS = "/api/v1/academics/result-sheets";
const TRANSITION = "/api/v1/academics/results/transition";
type World = Awaited<ReturnType<typeof resultsWorld>>;
const addStudent = async (w: World, name: string) => {
  const s = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: name,
      lastName: "Bello",
      gender: "MALE",
      dateOfBirth: new Date("2012-01-01"),
      admissionNo: `ADM/R/${name}-${Math.random()}`,
    },
  });
  await db.studentEnrollment.create({
    data: { branchId: home.id, studentId: s.id, sessionId: w.session.id, className: w.group.name, arm: "A", classArmId: w.arm.id },
  });
  return s;
};
/// Enters (as the administrator), then submits, approves (as the second administrator) and optionally publishes the given marks for each student.
async function run(w: World, a: { cookie: string }, b: { cookie: string }, marks: [string, number][], publish = true) {
  const entries = marks.map(([studentId, exam]) => ({ studentId, parts: { "Test 1": 15, "Test 2": 10 }, exam }));
  expect(
    (
      await api(SHEETS, {
        method: "PUT",
        cookie: a.cookie,
        body: { periodId: w.period.id, classArmId: w.arm.id, subjectId: w.subject.id, entries },
      })
    ).status,
  ).toBe(200);
  const ids = (await db.result.findMany({ where: { subjectId: w.subject.id, periodId: w.period.id } })).map((r) => r.id);
  const step = async (who: { cookie: string }, action: string) =>
    expect((await api(TRANSITION, { method: "POST", cookie: who.cookie, body: { action, resultIds: ids } })).status).toBe(200);
  await step(a, "submit");
  await step(b, "approve");
  if (publish) await step(b, "publish");
  return ids;
}
const CARD = (studentId: string, periodId: string, extra = "") => `/api/v1/students/${studentId}/report-card?periodId=${periodId}${extra}`;

test.describe("the card", () => {
  test("is computed from published results: totals, average, position with ties, remarks and the legend; unpublished ones are hidden from staff and shown in an administrator's preview", async () => {
    const w = await resultsWorld(home.id);
    const bola = await addStudent(w, "Bola");
    const chi = await addStudent(w, "Chi");
    const a = await asRole(Role.ADMIN);
    const b = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    // Amina 25 + 40 = 65; Bola 25 + 40 = 65 (tie); Chi 25 + 20 = 45 (lower); a second subject for Amina only comes later
    await run(w, a, b, [
      [w.student.id, 40],
      [bola.id, 40],
      [chi.id, 20],
    ]);

    const amina = (await api(CARD(w.student.id, w.period.id), { cookie: teacher.cookie })).json.data.card;
    expect(amina.subjects).toHaveLength(1);
    expect(amina.subjects[0]).toMatchObject({
      name: w.subject.name,
      caTotal: 25,
      exam: 40,
      total: 65,
      max: 100,
      percent: 65,
      gradeLetter: "C",
      status: "PUBLISHED",
    });
    expect(amina.subjects[0].verificationToken).toHaveLength(43);
    expect(amina.summary).toMatchObject({ subjectCount: 1, totalScore: 65, totalMax: 100, average: 65, position: 1, classSize: 3 });
    expect((await api(CARD(bola.id, w.period.id), { cookie: teacher.cookie })).json.data.card.summary.position).toBe(1); // a tie shares the position
    expect((await api(CARD(chi.id, w.period.id), { cookie: teacher.cookie })).json.data.card.summary).toMatchObject({
      position: 3,
      classSize: 3,
    }); // and the next is skipped
    expect(amina.legend.map((l: { letter: string }) => l.letter)).toEqual(["F", "C", "A"]);
    expect(amina.class).toEqual({ group: w.group.name, arm: "A" });
    expect(amina.allPublished).toBe(true);

    // a second subject, entered but NOT published: staff do not see it; an administrator's preview does
    const art = await db.subject.create({ data: { branchId: home.id, name: "Art" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: w.group.id, subjectId: art.id } });
    await api(SHEETS, {
      method: "PUT",
      cookie: a.cookie,
      body: {
        periodId: w.period.id,
        classArmId: w.arm.id,
        subjectId: art.id,
        entries: [{ studentId: w.student.id, parts: { "Test 1": 20, "Test 2": 20 }, exam: 60 }],
      },
    });
    expect((await api(CARD(w.student.id, w.period.id), { cookie: teacher.cookie })).json.data.card.subjects).toHaveLength(1);
    const preview = (await api(CARD(w.student.id, w.period.id, "&preview=true"), { cookie: a.cookie })).json.data.card;
    expect(preview.subjects.map((s: { name: string }) => s.name)).toEqual(["Art", w.subject.name]);
    expect(preview).toMatchObject({ preview: true, allPublished: false });
    expect(preview.summary.average).toBe(82.5); // (100% + 65%) / 2
    expect((await api(CARD(w.student.id, w.period.id, "&preview=true"), { cookie: teacher.cookie })).status).toBe(403); // a teacher cannot preview
  });

  test("who may read it: signed out 401; a parent 403; another branch's staff 404; an unknown student or term 404; a card with nothing published has no subjects", async () => {
    const w = await resultsWorld(home.id);
    const a = await asRole(Role.ADMIN);
    expect((await api(CARD(w.student.id, w.period.id))).status).toBe(401);
    const parent = await asRole(Role.PARENT);
    expect((await api(CARD(w.student.id, w.period.id), { cookie: parent.cookie })).status).toBe(403);
    const foreign = await asRole(Role.ADMIN, other.id);
    const unknown = await api(CARD("nope", w.period.id), { cookie: a.cookie });
    const theirs = await api(CARD(w.student.id, w.period.id), { cookie: foreign.cookie });
    expect([theirs.status, theirs.json]).toEqual([404, unknown.json]);
    expect((await api(CARD(w.student.id, "nope"), { cookie: a.cookie })).status).toBe(404);
    const empty = (await api(CARD(w.student.id, w.period.id), { cookie: a.cookie })).json.data.card;
    expect([empty.subjects, empty.summary.average, empty.summary.position, empty.allPublished]).toEqual([[], null, null, false]);
  });
});

test.describe("remarks", () => {
  test("an administrator saves and clears them; they freeze once a result is published; teachers and other branches cannot write", async () => {
    const w = await resultsWorld(home.id);
    const a = await asRole(Role.ADMIN);
    const b = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const put = (cookie: string, body: object, studentId = w.student.id) =>
      api(`/api/v1/students/${studentId}/report-remarks`, { method: "PUT", cookie, body });
    expect((await put(teacher.cookie, { periodId: w.period.id, teacherRemark: "x" })).status).toBe(403);
    const foreign = await asRole(Role.ADMIN, other.id);
    expect((await put(foreign.cookie, { periodId: w.period.id, teacherRemark: "x" })).status).toBe(404);
    expect(
      (await put(a.cookie, { periodId: w.period.id, teacherRemark: "Hard-working.", principalRemark: "Keep it up." })).json.data.remarks,
    ).toEqual({ teacher: "Hard-working.", principal: "Keep it up." });
    expect((await put(a.cookie, { periodId: w.period.id, teacherRemark: "x".repeat(501) })).status).toBe(400);
    expect((await put(a.cookie, { periodId: w.period.id, extra: 1 })).status).toBe(400);
    expect((await put(a.cookie, { periodId: w.period.id, principalRemark: "" })).json.data.remarks).toEqual({
      teacher: null,
      principal: null,
    }); // a save replaces both: blank clears
    await put(a.cookie, { periodId: w.period.id, teacherRemark: "Final words." });
    expect((await api(CARD(w.student.id, w.period.id, "&preview=true"), { cookie: a.cookie })).json.data.card.remarks.teacher).toBe(
      "Final words.",
    );
    await run(w, a, b, [[w.student.id, 40]]);
    const frozen = await put(a.cookie, { periodId: w.period.id, teacherRemark: "Too late" });
    expect([frozen.status, frozen.json.error.code]).toEqual([409, "CONFLICT"]);
    expect((await db.reportRemark.findFirstOrThrow({})).teacherRemark).toBe("Final words.");
    expect(await db.auditLog.count({ where: { action: "REPORT_REMARKS_SAVED" } })).toBe(3); // set, clear, final: the two refused (400) and the frozen one (409) wrote nothing
  });
});

test.describe("public verification", () => {
  test("a published result's token proves it genuine and says only school, branch, class, term, subject, publish date and the pupil as first name + last initial - never the marks or admission number", async () => {
    const w = await resultsWorld(home.id);
    const a = await asRole(Role.ADMIN);
    const b = await asRole(Role.ADMIN);
    const [id] = await run(w, a, b, [[w.student.id, 40]]);
    const token = (await db.result.findUniqueOrThrow({ where: { id } })).verificationToken!;
    const res = await api(`/api/v1/verify/${token}`, { origin: null }); // no cookie, no origin: a stranger's browser
    expect(res.status).toBe(200);
    const v = res.json.data.verification;
    expect(v).toMatchObject({ genuine: true, pupil: "Amina Y.", subject: w.subject.name, className: `${w.group.name} A` });
    // The public answer is an exact allow-list of fields: anything new added to it must be a conscious decision, and no score, grade or id can slip in.
    expect(Object.keys(v).sort()).toEqual(["branch", "className", "genuine", "period", "publishedAt", "pupil", "school", "subject"]);
    const text = JSON.stringify(res.json);
    for (const secret of [w.student.admissionNo, w.student.id, w.student.lastName, "Credit", "gradeLetter", "score", "total"])
      expect(text, `the public answer must not contain ${secret}`).not.toContain(secret);
    const page = await api(`/verify/${token}`, { origin: null }); // the public PAGE, rendered on the server
    expect(page.status).toBe(200);
    expect(page.text).toContain("This result is genuine.");
    expect(page.text).toContain("Amina Y.");
    for (const secret of [w.student.admissionNo, "Credit", "Yusuf"])
      expect(page.text, `the public page must not contain ${secret}`).not.toContain(secret);
    expect((await api(`/verify/${"z".repeat(43)}`, { origin: null })).text).toContain("This verification code was not found.");
  });

  test("an unknown, malformed, never-issued or withdrawn (unlocked) token all get the same 404; a tampered result is reported as not matching", async () => {
    const w = await resultsWorld(home.id);
    const a = await asRole(Role.ADMIN);
    const b = await asRole(Role.ADMIN);
    const [id] = await run(w, a, b, [[w.student.id, 40]]);
    const token = (await db.result.findUniqueOrThrow({ where: { id } })).verificationToken!;
    const answers = await Promise.all(
      ["nope", "a".repeat(43), "%00", token.slice(0, 42)].map((t) => api(`/api/v1/verify/${t}`, { origin: null })),
    );
    expect(answers.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(answers.map((r) => JSON.stringify(r.json))).size).toBe(1);

    // the hash covers the content: if the stored hash no longer matches, the page does not say genuine
    await db.$executeRaw`UPDATE "Result" SET "verificationHash" = ${"0".repeat(64)} WHERE "id" = ${id}`;
    expect((await api(`/api/v1/verify/${token}`, { origin: null })).json.data.verification.genuine).toBe(false);
    await db.$executeRaw`UPDATE "Result" SET "verificationHash" = ${"0".repeat(64)} WHERE "id" = ${id}`; // (kept: now unlock withdraws the token entirely)
    expect(
      (
        await api(TRANSITION, {
          method: "POST",
          cookie: b.cookie,
          body: { action: "unlock", resultIds: [id], reason: "Correcting a mark" },
        })
      ).status,
    ).toBe(200);
    expect((await api(`/api/v1/verify/${token}`, { origin: null })).status).toBe(404); // withdrawn
  });
});
