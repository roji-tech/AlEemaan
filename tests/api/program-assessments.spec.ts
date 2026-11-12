import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { db, resetDatabase } from "../support/db";
import { api } from "../support/http";
import { PROGRAMS, buildWorld, day, get, post, send, staffIn, type Person, type World } from "../support/programs";

// Programs, slice P3b (task 0043, section 8.11): assessments. Who sees which assessment, the lifecycle, the score sheet, who may enter what and when, the history of every score, the
// three levels of the switch, and the results. Real HTTP against a production build, real database. The world is tests/support/programs.ts.

let w: World;
const base = () => `${PROGRAMS}/${w.program}/assessments`;
const settings = (who: Person, body: Record<string, unknown>) => send("PATCH", `${PROGRAMS}/${w.program}/settings`, who, body);
const list = (who: Person) => get(base(), who);
const one = (who: Person, id: string) => get(`${base()}/${id}`, who);
const act = (who: Person, id: string, action: string) => post(`${base()}/${id}`, who, { action });
const scores = (who: Person, id: string, entries: Record<string, unknown>[], reason?: string) =>
  send("PUT", `${base()}/${id}/scores`, who, { entries, ...(reason ? { reason } : {}) });
const history = (who: Person, id: string, personId: string) => get(`${base()}/${id}/history?personId=${personId}`, who);
const results = (who: Person, qs = "") => get(`${base()}/results${qs}`, who);
const mark = (participantId: string, score: number, extra: Record<string, unknown> = {}) => ({ participantId, score, ...extra });
const body = (over: Record<string, unknown> = {}) => ({
  title: "Monthly test",
  kind: "Test",
  date: day(0),
  maxScore: 40,
  passMark: 20,
  weight: 1,
  required: false,
  groupIds: [],
  ...over,
});

/// Makes an assessment as the super admin and opens it.
async function made(over: Record<string, unknown> = {}, open = true): Promise<string> {
  const res = await post(base(), w.sa, body(over));
  expect(res.status, res.text).toBe(201);
  if (open) expect((await act(w.sa, res.json.data.id, "open")).status).toBe(200);
  return res.json.data.id;
}
const scoresInDb = () => db.programScore.count();

test.beforeEach(async () => {
  w = await buildWorld();
  const on = await settings(w.sa, { assessmentsEnabled: true });
  expect(on.status, on.text).toBe(200);
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("reaching the routes", () => {
  test("nobody signed out can read or change anything; a member of staff with no place finds no program", async () => {
    const id = await made();
    for (const [method, path] of [
      ["GET", base()],
      ["POST", base()],
      ["GET", `${base()}/${id}`],
      ["PATCH", `${base()}/${id}`],
      ["POST", `${base()}/${id}`],
      ["PUT", `${base()}/${id}/scores`],
      ["GET", `${base()}/${id}/history?personId=${w.amina}`],
      ["GET", `${base()}/results`],
      ["GET", "/api/v1/settings/programs-assessments"],
      ["PATCH", "/api/v1/settings/programs-assessments"],
      ["GET", "/api/v1/settings/programs-fees"],
    ] as const)
      expect((await api(path, { method, body: method === "GET" ? undefined : {} })).status, `${method} ${path}`).toBe(401);
    const outsider = await staffIn(w.B.id, Role.TEACHING_STAFF, "Outsider");
    expect((await list(outsider)).status).toBe(404);
    expect((await one(outsider, id)).status).toBe(404);
    expect((await scores(outsider, id, [mark(w.amina, 10)])).status).toBe(404);
    expect((await results(outsider)).status).toBe(404);
  });
});

test.describe("the switch", () => {
  test("a program starts with assessments off; the school, the branch and the program must all have them on", async () => {
    await settings(w.sa, { assessmentsEnabled: false });
    const refused = await post(base(), w.sa, body());
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("ASSESSMENTS_OFF");
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.assessments).toMatchObject({
      on: false,
      offBy: "PROGRAM",
      enabled: false,
    });

    expect((await settings(w.progAdmin, { assessmentsEnabled: true })).status).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.teacher)).json.data.assessments).toMatchObject({ on: true, offBy: null, reach: true });
    expect((await get(`${PROGRAMS}/${w.program}`, w.loner)).json.data.assessments.reach).toBe(false);
    expect((await settings(w.teacher, { assessmentsEnabled: false })).status).toBe(403);

    const sw = (who: Person, b: Record<string, unknown>) => send("PATCH", "/api/v1/settings/programs-assessments", who, b);
    expect((await sw(w.sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.assessments).toMatchObject({ on: false, offBy: "SCHOOL" });
    expect((await post(base(), w.sa, body())).json.error.code).toBe("ASSESSMENTS_OFF");
    expect((await list(w.sa)).status).toBe(200);
    expect((await sw(w.adminB, { scope: "BRANCH", branchId: w.B.id, enabled: true })).status).toBeGreaterThanOrEqual(400);
    expect((await sw(w.sa, { scope: "GLOBAL", enabled: null })).status).toBe(200);
    expect((await sw(w.adminB, { scope: "BRANCH", branchId: w.B.id, enabled: false })).status).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.assessments).toMatchObject({ on: true, branchesOff: [{ id: w.B.id }] });
    expect((await send("GET", "/api/v1/settings/programs-assessments", w.teacher)).status).toBe(403);
    // the fees switch is its own switch and exists beside it
    expect((await get("/api/v1/settings/programs-fees", w.sa)).json.data.school).toEqual({ stored: null, effective: true });
  });

  test("the grade bands are checked and kept with the program", async () => {
    for (const bad of [
      [{ name: "A", from: 50 }],
      [
        { name: "A", from: 0 },
        { name: "a", from: 50 },
      ],
      [
        { name: "A", from: 0 },
        { name: "B", from: 0 },
      ],
      [{ name: "A", from: 101 }],
      Array.from({ length: 11 }, (_, i) => ({ name: `G${i}`, from: i * 9 })),
      [{ name: "", from: 0 }],
      [{ name: "A", from: 0, extra: 1 }],
    ])
      expect((await settings(w.sa, { gradeBands: bad })).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    const bands = [
      { name: "Fail", from: 0 },
      { name: "Good", from: 60 },
      { name: "Excellent", from: 85 },
    ];
    const set = await settings(w.progAdmin, { gradeBands: bands });
    expect(set.status, set.text).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.teacher)).json.data.assessments.bands).toEqual(bands);
    expect(await db.programAudit.count({ where: { programId: w.program, action: "PROGRAM_SETTINGS_CHANGED" } })).toBeGreaterThanOrEqual(2);
    expect((await settings(w.sa, { gradeBands: [] })).status).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.assessments.bands).toEqual([]);
  });
});

test.describe("making and changing an assessment", () => {
  test("a super admin and a program admin make one; nobody else can", async () => {
    expect((await post(base(), w.progAdmin, body())).status).toBe(201);
    for (const who of [w.teacher, w.recorder, w.supervisor, w.adminA, w.adminB, w.loner])
      expect((await post(base(), who, body())).status, who.name).toBe(403);
    expect(await db.programAssessment.count()).toBe(1);
    const row = await db.programAssessment.findFirstOrThrow();
    expect(row).toMatchObject({ title: "Monthly test", kind: "Test", status: "DRAFT", createdByUserId: w.progAdmin.id });
    expect(Number(row.maxScore)).toBe(40);
    expect(await db.programAudit.count({ where: { action: "ASSESSMENT_CREATED" } })).toBe(1);
  });

  test("the shape is checked: title, maximum, pass mark, weight, date, groups and unknown keys", async () => {
    const bad: Record<string, unknown>[] = [
      { title: "   " },
      { title: "x".repeat(121) },
      { kind: "k".repeat(41) },
      { maxScore: 0 },
      { maxScore: 1000.01 },
      { maxScore: 40.123 },
      { maxScore: "40" },
      { passMark: 41 },
      { passMark: -1 },
      { weight: 0 },
      { weight: 101 },
      { date: "2026-02-30" },
      { date: "yesterday" },
      { groupIds: ["not an id"] },
      { extra: 1 },
    ];
    for (const over of bad) expect((await post(base(), w.sa, body(over))).status, JSON.stringify(over)).toBe(400);
    const other = await post(PROGRAMS, w.sa, { name: "Other", kind: "ONGOING", branchIds: [w.A.id], levelLabels: ["Class"] });
    const foreign = (await post(`${PROGRAMS}/${other.json.data.id}/groups`, w.sa, { name: "Foreign", parentId: null })).json.data.id;
    expect((await post(base(), w.sa, body({ groupIds: [foreign] }))).status).toBe(404);
    expect((await post(base(), w.sa, body({ groupIds: ["well-formed-but-nothing"] }))).status).toBe(404);
    expect(await db.programAssessment.count()).toBe(0);
  });

  test("at most 200 assessments in a program", async () => {
    await db.programAssessment.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        programId: w.program,
        title: `T${i}`,
        date: new Date(day(0)),
        maxScore: 10,
        createdByUserId: w.sa.id,
      })),
    });
    const refused = await post(base(), w.sa, body());
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("TOO_MANY");
  });

  test("a draft changes freely; an open one only its labels; a marked or published one not at all", async () => {
    const id = await made({}, false);
    expect((await send("PATCH", `${base()}/${id}`, w.progAdmin, { maxScore: 50, date: day(-1), groupIds: [w.group1] })).status).toBe(200);
    expect(Number((await db.programAssessment.findFirstOrThrow()).maxScore)).toBe(50);
    expect((await send("PATCH", `${base()}/${id}`, w.progAdmin, { passMark: 60 })).status).toBe(400);
    expect((await send("PATCH", `${base()}/${id}`, w.progAdmin, {})).status).toBe(400);
    // an edit that does not mention the kind leaves it alone (found by this test: the create-time default "" leaked into every edit)
    expect((await send("PATCH", `${base()}/${id}`, w.progAdmin, { kind: "Recitation" })).status).toBe(200);
    expect((await send("PATCH", `${base()}/${id}`, w.progAdmin, { title: "Renamed" })).status).toBe(200);
    expect((await db.programAssessment.findFirstOrThrow()).kind).toBe("Recitation");
    expect((await send("PATCH", `${base()}/${id}`, w.teacher, { title: "Hijacked" })).status).toBe(403);
    expect((await act(w.sa, id, "open")).status).toBe(200);
    expect(
      (await send("PATCH", `${base()}/${id}`, w.progAdmin, { title: "Renamed", passMark: 30, weight: 2, required: true })).status,
    ).toBe(200);
    for (const over of [{ maxScore: 60 }, { date: day(-2) }, { groupIds: [] }]) {
      const refused = await send("PATCH", `${base()}/${id}`, w.progAdmin, over);
      expect(refused.status, JSON.stringify(over)).toBe(409);
      expect(refused.json.error.code).toBe("LOCKED_FIELD");
    }
    expect((await send("PATCH", `${base()}/${id}`, w.teacher, { title: "Hijacked" })).status).toBe(403);
    expect(await db.programAssessment.findFirstOrThrow()).toMatchObject({ title: "Renamed", weight: expect.anything(), required: true });
    await scoresAll(id, 30, [w.amina, w.cara]); // this draft was narrowed to Group 1 above, so its sheet is those two
    expect((await act(w.sa, id, "mark")).status).toBe(200);
    expect((await send("PATCH", `${base()}/${id}`, w.progAdmin, { title: "Late rename" })).json.error.code).toBe("NOT_EDITABLE");
  });
});

/// Everyone on the whole-program sheet gets a score, entered by the super admin (the sheet of the whole program is 4 people; Hauwa is in Juz B).
async function scoresAll(id: string, value = 30, people = [w.amina, w.binta, w.cara, w.hauwa]) {
  const res = await scores(
    w.sa,
    id,
    people.map((p) => mark(p, value)),
  );
  expect(res.status, res.text).toBe(200);
}

test.describe("who sees which assessment", () => {
  test("a draft only an administrator; an open one by its audience: the whole program, or the groups a person reaches", async () => {
    const draft = await made({ title: "Draft one" }, false);
    const whole = await made({ title: "Whole program" });
    const forGroup2 = await made({ title: "Group 2 only", groupIds: [w.group2] });
    const forJuzB = await made({ title: "Juz B only", groupIds: [w.juzB] });
    const titles = async (who: Person) => ((await list(who)).json.data.assessments as { title: string }[]).map((a) => a.title).sort();
    expect(await titles(w.sa)).toEqual(["Draft one", "Group 2 only", "Juz B only", "Whole program"]);
    expect(await titles(w.progAdmin)).toEqual(await titles(w.sa));
    expect(await titles(w.supervisor)).toEqual(["Group 2 only", "Juz B only", "Whole program"]);
    expect(await titles(w.adminA)).toEqual(["Group 2 only", "Juz B only", "Whole program"]);
    expect(await titles(w.teacher)).toEqual(["Group 2 only", "Whole program"]);
    expect(await titles(w.recorder)).toEqual(["Whole program"]);
    expect(await titles(w.loner)).toEqual([]);
    expect((await one(w.teacher, draft)).status).toBe(404);
    expect((await one(w.teacher, forJuzB)).status).toBe(404);
    expect((await one(w.recorder, forGroup2)).status).toBe(404);
    expect((await one(w.recorder, whole)).status).toBe(200);
    expect((await one(w.supervisor, draft)).status).toBe(404);
    expect((await one(w.sa, "well-formed-but-nothing")).status).toBe(404);
  });

  test("the sheet lists the people it is for, once each, and only those the caller may see", async () => {
    const id = await made();
    const ids = async (who: Person) =>
      ((await one(who, id)).json.data.rows as { participantId: string }[]).map((r) => r.participantId).sort();
    expect(await ids(w.sa)).toEqual([w.amina, w.binta, w.cara, w.hauwa].sort());
    expect(await ids(w.teacher)).toEqual([w.amina, w.binta, w.cara].sort());
    expect(await ids(w.recorder)).toEqual([w.amina, w.cara].sort());
    expect(await ids(w.adminA)).toEqual([w.amina, w.binta, w.hauwa].sort());
    expect(await ids(w.adminB)).toEqual([w.cara]);
    expect((await one(w.loner, id)).status).toBe(404); // no groups and no branch reach: the assessment does not exist for them
    const forGroup = await made({ groupIds: [w.juzA] });
    expect(((await one(w.sa, forGroup)).json.data.rows as unknown[]).length).toBe(3);
  });
});

test.describe("the lifecycle", () => {
  test("open, mark, publish: in that order; marking needs every expected score; a supervisor may only mark", async () => {
    const id = await made({}, false);
    expect((await act(w.sa, id, "mark")).json.error.code).toBe("NOT_APPLICABLE");
    expect((await act(w.sa, id, "publish")).json.error.code).toBe("NOT_APPLICABLE");
    for (const who of [w.teacher, w.recorder, w.loner, w.adminA])
      expect([403, 404], who.name).toContain((await act(who, id, "open")).status);
    expect((await act(w.supervisor, id, "open")).status).toBe(404); // a draft is invisible to a supervisor
    expect((await act(w.progAdmin, id, "open")).status).toBe(200);
    expect((await act(w.sa, id, "open")).json.error.code).toBe("NOT_APPLICABLE");

    expect((await scores(w.teacher, id, [mark(w.amina, 30), mark(w.binta, 25)])).status).toBe(200);
    const incomplete = await act(w.supervisor, id, "mark");
    expect(incomplete.status).toBe(409);
    expect(incomplete.json.error.code).toBe("INCOMPLETE");
    expect(incomplete.json.error.details.length).toBe(2); // Cara and Hauwa
    expect((await act(w.teacher, id, "mark")).status).toBe(403);
    expect((await scores(w.sa, id, [mark(w.cara, 10), { participantId: w.hauwa, code: "EXCUSED" }])).status).toBe(200);
    expect((await act(w.supervisor, id, "mark")).status).toBe(200);
    expect((await act(w.supervisor, id, "publish")).status).toBe(403);
    expect((await act(w.supervisor, id, "reopen")).status).toBe(403);
    expect((await act(w.progAdmin, id, "reopen")).status).toBe(200);
    expect((await act(w.supervisor, id, "mark")).status).toBe(200);
    const published = await act(w.progAdmin, id, "publish");
    expect(published.status, published.text).toBe(200);
    expect((await db.programAssessment.findFirstOrThrow()).publishedAt).not.toBeNull();
    expect((await act(w.progAdmin, id, "publish")).json.error.code).toBe("NOT_APPLICABLE");
    expect((await act(w.sa, id, "archive")).status).toBe(200);
    expect((await act(w.sa, id, "open")).json.error.code).toBe("NOT_APPLICABLE");
    expect((await act(w.sa, id, "archive")).json.error.code).toBe("NOT_APPLICABLE");
    expect((await act(w.sa, id, "explode")).status).toBe(400);
    expect(
      await db.programAudit.count({
        where: {
          action: { in: ["ASSESSMENT_OPENED", "ASSESSMENT_MARKED", "ASSESSMENT_REOPENED", "ASSESSMENT_PUBLISHED", "ASSESSMENT_ARCHIVED"] },
        },
      }),
    ).toBe(6);
  });

  test("a suspended person does not hold up marking, and an assessment that has not taken place cannot be marked or scored", async () => {
    const id = await made();
    expect(
      (await post(`${PROGRAMS}/${w.program}/people/${w.hauwa}/standing`, w.sa, { action: "suspend", reason: "Disturbing the class" }))
        .status,
    ).toBe(200);
    const sheet = (await one(w.sa, id)).json.data;
    expect(sheet.rows.find((r: { participantId: string }) => r.participantId === w.hauwa)).toMatchObject({
      flag: "SUSPENDED",
      canEdit: false,
    });
    expect(sheet.counts.expected).toBe(3);
    expect((await scores(w.sa, id, [mark(w.hauwa, 10)])).json.error.code).toBe("NOT_MARKABLE");
    expect((await scores(w.sa, id, [mark(w.amina, 10), mark(w.binta, 10), mark(w.cara, 10)])).status).toBe(200);
    expect((await act(w.sa, id, "mark")).status).toBe(200);

    const later = await made({ date: day(2), title: "Next week" });
    expect((await scores(w.sa, later, [mark(w.amina, 10)])).json.error.code).toBe("NOT_YET");
    expect((await act(w.sa, later, "mark")).json.error.code).toBe("NOT_YET");
    expect((await one(w.sa, later)).json.data.rights.enter).toBe(false);
  });
});

test.describe("entering scores", () => {
  test("a teacher enters the scores of their groups; saving the same again changes nothing; the history keeps every entry", async () => {
    const id = await made();
    const saved = await scores(w.teacher, id, [
      mark(w.amina, 30.5, { comment: "  Good recitation " }),
      { participantId: w.binta, code: "ABSENT" },
      mark(w.cara, 12),
    ]);
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.data).toEqual({ created: 3, changed: 0, unchanged: 0 });
    const rows = await db.programScore.findMany({ orderBy: { participantId: "asc" } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.version === 1 && r.markedByUserId === w.teacher.id)).toBe(true);
    expect(rows.find((r) => r.participantId === w.amina)).toMatchObject({ comment: "Good recitation", code: null });
    expect(Number(rows.find((r) => r.participantId === w.amina)!.score)).toBe(30.5);
    expect(rows.find((r) => r.participantId === w.binta)).toMatchObject({ score: null, code: "ABSENT" });
    expect(rows.find((r) => r.participantId === w.cara)!.branchId).toBe(w.B.id);

    const again = await scores(w.teacher, id, [
      mark(w.amina, 30.5, { comment: "Good recitation" }),
      { participantId: w.binta, code: "ABSENT" },
    ]);
    expect(again.json.data).toEqual({ created: 0, changed: 0, unchanged: 2 });
    expect(await db.programScoreChange.count()).toBe(3);
    const shown = (await one(w.teacher, id)).json.data;
    expect(shown.counts).toMatchObject({ expected: 3, entered: 3, missing: 0 });
    expect(shown.rows.find((r: { participantId: string }) => r.participantId === w.amina)).toMatchObject({
      percent: 76.3,
      passed: true,
      canEdit: true,
      entry: { score: 30.5, version: 1, markedBy: "Teacher" },
    });
    expect(shown.rows.find((r: { participantId: string }) => r.participantId === w.cara)).toMatchObject({ passed: false });

    const h = (await history(w.teacher, id, w.amina)).json.data.changes;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ before: null, after: "30.5", by: "Teacher" });
  });

  test("a change needs the version the screen saw; a stale one is refused and nothing is written; a change keeps what it replaced", async () => {
    const id = await made();
    expect((await scores(w.teacher, id, [mark(w.amina, 30), mark(w.binta, 20)])).status).toBe(200);
    const fixed = await scores(w.teacher, id, [mark(w.amina, 33, { version: 1 })]);
    expect(fixed.json.data).toMatchObject({ created: 0, changed: 1 });
    expect(await db.programScore.findFirstOrThrow({ where: { participantId: w.amina } })).toMatchObject({
      version: 2,
      markedByUserId: w.teacher.id,
    });
    const stale = await scores(w.teacher, id, [mark(w.amina, 34, { version: 1 }), mark(w.binta, 21, { version: 1 })]);
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe("CHANGED");
    expect(stale.json.error.details[0].path).toBe("body.entries.0.version");
    expect(Number((await db.programScore.findFirstOrThrow({ where: { participantId: w.binta } })).score)).toBe(20);
    expect((await scores(w.teacher, id, [mark(w.amina, 35)])).json.error.code).toBe("CHANGED");
    expect((await scores(w.teacher, id, [mark(w.cara, 35, { version: 2 })])).json.error.code).toBe("CHANGED");
    const h = (await history(w.sa, id, w.amina)).json.data.changes;
    expect(h.map((c: { before: string | null; after: string | null }) => [c.before, c.after])).toEqual([
      ["30", "33"],
      [null, "30"],
    ]);
  });

  test("all or nothing: a score above the maximum, a person not on the sheet or a suspended person refuses the whole save", async () => {
    const id = await made();
    const tooHigh = await scores(w.teacher, id, [mark(w.amina, 30), mark(w.binta, 41)]);
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.json.error.code).toBe("INVALID_SCORE");
    expect(tooHigh.json.error.details[0].path).toBe("body.entries.1.score");
    const notOnSheet = await scores(w.teacher, id, [mark(w.amina, 30), mark(w.hauwa, 10)]);
    expect(notOnSheet.json.error.code).toBe("NOT_ON_SHEET");
    expect(notOnSheet.json.error.details[0].path).toBe("body.entries.1.participantId");
    expect((await scores(w.teacher, id, [mark("well-formed-but-nothing", 10)])).json.error.code).toBe("NOT_ON_SHEET");
    expect(await scoresInDb()).toBe(0);
    expect(await db.programScoreChange.count()).toBe(0);
  });

  test("the shape of a save is checked", async () => {
    const id = await made();
    const put = (b: Record<string, unknown>) => send("PUT", `${base()}/${id}/scores`, w.teacher, b);
    const ok = { participantId: w.amina, score: 10 };
    expect((await put({ entries: [ok], extra: 1 })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, extra: 1 }] })).status).toBe(400);
    expect((await put({ entries: [] })).status).toBe(400);
    expect((await put({ entries: Array.from({ length: 501 }, () => ok) })).status).toBe(400);
    expect((await put({ entries: [{ participantId: w.amina }] })).status).toBe(400);
    expect((await put({ entries: [{ participantId: w.amina, score: 10, code: "ABSENT" }] })).status).toBe(400);
    expect((await put({ entries: [{ participantId: w.amina, code: "SICK" }] })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, score: -1 }] })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, score: 10.123 }] })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, score: "10" }] })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, comment: "c".repeat(501) }] })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, comment: "bad\u0007char" }] })).status).toBe(400);
    expect((await put({ entries: [{ ...ok, version: 0 }] })).status).toBe(400);
    expect((await put({ entries: [ok, { ...ok, score: 11 }] })).json.error.code).toBe("DUPLICATE_ENTRY");
    expect(await scoresInDb()).toBe(0);
  });

  test("a recorder enters only their group; a teacher with no group, a supervisor and a branch administrator enter nothing", async () => {
    const id = await made();
    expect((await scores(w.recorder, id, [mark(w.amina, 10), mark(w.cara, 11)])).status).toBe(200);
    expect((await scores(w.recorder, id, [mark(w.binta, 10)])).json.error.code).toBe("NOT_ON_SHEET");
    expect((await scores(w.loner, id, [mark(w.amina, 10)])).status).toBe(404);
    // a supervisor reads every group, so Binta is on their sheet - and still they cannot enter a score
    const sup = await scores(w.supervisor, id, [mark(w.binta, 10)]);
    expect(sup.status).toBe(403);
    expect(sup.json.error.code).toBe("FORBIDDEN");
    expect((await scores(w.adminA, id, [mark(w.amina, 12, { version: 1 })])).status).toBe(403);
    expect((await one(w.adminA, id)).json.data.rights).toMatchObject({ enter: false });
    expect(await scoresInDb()).toBe(2);
  });

  test("not before the assessment is open; not after it is archived", async () => {
    const draft = await made({}, false);
    expect((await scores(w.sa, draft, [mark(w.amina, 10)])).json.error.code).toBe("NOT_OPEN");
    const open = await made();
    expect((await act(w.sa, open, "archive")).status).toBe(200);
    expect((await scores(w.sa, open, [mark(w.amina, 10)])).json.error.code).toBe("NOT_OPEN");
  });

  test("after marking only an administrator changes a score; after publishing it needs a reason, and the history keeps it", async () => {
    const id = await made();
    await scoresAll(id);
    expect((await act(w.sa, id, "mark")).status).toBe(200);
    const byTeacher = await scores(w.teacher, id, [mark(w.amina, 35, { version: 1 })]);
    expect(byTeacher.status).toBe(403);
    expect((await scores(w.progAdmin, id, [mark(w.amina, 35, { version: 1 })])).status).toBe(200);
    expect((await act(w.sa, id, "publish")).status).toBe(200);

    const bare = await scores(w.progAdmin, id, [mark(w.amina, 36, { version: 2 })]);
    expect(bare.status).toBe(400);
    expect(bare.json.error.code).toBe("REASON_REQUIRED");
    expect((await scores(w.progAdmin, id, [mark(w.amina, 36, { version: 2 })], "ok")).json.error.code).toBe("REASON_REQUIRED");
    expect((await scores(w.teacher, id, [mark(w.amina, 36, { version: 2 })], "Recounted the marks")).status).toBe(403);
    const fixed = await scores(w.progAdmin, id, [mark(w.amina, 36, { version: 2 })], "Recounted the marks");
    expect(fixed.status, fixed.text).toBe(200);
    expect(await db.programAudit.count({ where: { action: "SCORES_CORRECTED" } })).toBeGreaterThanOrEqual(2);
    const h = (await history(w.sa, id, w.amina)).json.data.changes;
    expect(h[0]).toMatchObject({ before: "35", after: "36", reason: "Recounted the marks", by: "Program Admin" });
    // a score that stays the same needs no reason
    expect((await scores(w.progAdmin, id, [mark(w.amina, 36)])).json.data.unchanged).toBe(1);
    expect((await one(w.teacher, id)).json.data.rights).toMatchObject({ reasonOnChange: true, enter: false });
  });

  test("history: only for a person the caller may see", async () => {
    const id = await made();
    await scoresAll(id);
    expect((await history(w.teacher, id, w.amina)).status).toBe(200);
    expect((await history(w.teacher, id, w.hauwa)).status).toBe(404);
    expect((await history(w.adminB, id, w.amina)).status).toBe(404);
    expect((await get(`${base()}/${id}/history`, w.sa)).status).toBe(400);
  });

  test("when assessments are switched off or the program is archived, scores can be read and not written", async () => {
    const id = await made();
    expect((await scores(w.teacher, id, [mark(w.amina, 10)])).status).toBe(200);
    expect((await send("PATCH", "/api/v1/settings/programs-assessments", w.sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    expect((await scores(w.teacher, id, [mark(w.amina, 11, { version: 1 })])).json.error.code).toBe("ASSESSMENTS_OFF");
    expect((await act(w.sa, id, "mark")).json.error.code).toBe("ASSESSMENTS_OFF");
    const shown = await one(w.teacher, id);
    expect(shown.status).toBe(200);
    expect(shown.json.data.rights).toMatchObject({ enter: false, actions: [] });
    await send("PATCH", "/api/v1/settings/programs-assessments", w.sa, { scope: "GLOBAL", enabled: null });
    expect((await post(`${PROGRAMS}/${w.program}/status`, w.sa, { action: "archive" })).status).toBe(200);
    expect((await scores(w.teacher, id, [mark(w.amina, 11, { version: 1 })])).json.error.code).toBe("PROGRAM_READ_ONLY");
    expect((await one(w.teacher, id)).status).toBe(200);
  });

  test("a branch that has assessments off leaves only its own people off the sheet", async () => {
    const id = await made();
    expect(
      (await send("PATCH", "/api/v1/settings/programs-assessments", w.adminB, { scope: "BRANCH", branchId: w.B.id, enabled: false }))
        .status,
    ).toBe(200);
    const row = (await one(w.sa, id)).json.data.rows.find((r: { participantId: string }) => r.participantId === w.cara);
    expect(row).toMatchObject({ branchOff: true, canEdit: false });
    expect((await scores(w.teacher, id, [mark(w.amina, 10), mark(w.cara, 10)])).json.error.code).toBe("NOT_ON_SHEET");
    expect((await scores(w.teacher, id, [mark(w.amina, 10)])).status).toBe(200);
  });

  test("someone moved to another group keeps their score on the sheet, read only", async () => {
    const id = await made({ groupIds: [w.group1] });
    expect((await scores(w.sa, id, [mark(w.amina, 22)])).status).toBe(200);
    expect((await post(`${PROGRAMS}/${w.program}/people/${w.amina}/move`, w.sa, { groupId: w.juzB })).status).toBe(200);
    const row = (await one(w.sa, id)).json.data.rows.find((r: { participantId: string }) => r.participantId === w.amina);
    expect(row).toMatchObject({ listed: false, canEdit: false, entry: { score: 22 } });
  });
});

test.describe("results", () => {
  async function publishedWorld() {
    expect(
      (
        await settings(w.sa, {
          gradeBands: [
            { name: "Fail", from: 0 },
            { name: "Good", from: 50 },
            { name: "Excellent", from: 85 },
          ],
        })
      ).status,
    ).toBe(200);
    const test1 = await made({ title: "Test 1", maxScore: 40, weight: 1 });
    const exam = await made({ title: "Exam", maxScore: 100, weight: 3, passMark: 50 });
    const draft = await made({ title: "Not yet", maxScore: 10, passMark: null }, false);
    expect(
      (await scores(w.sa, test1, [mark(w.amina, 36), mark(w.binta, 20), mark(w.cara, 40), { participantId: w.hauwa, code: "EXCUSED" }]))
        .status,
    ).toBe(200);
    expect(
      (await scores(w.sa, exam, [mark(w.amina, 80), { participantId: w.binta, code: "ABSENT" }, mark(w.cara, 90), mark(w.hauwa, 70)]))
        .status,
    ).toBe(200);
    for (const id of [test1, exam]) {
      expect((await act(w.sa, id, "mark")).status).toBe(200);
      expect((await act(w.sa, id, "publish")).status).toBe(200);
    }
    return { test1, exam, draft };
  }

  test("each person's results over the published assessments: the weighted average, the grade, ABSENT as 0, EXCUSED left out, drafts left out", async () => {
    await publishedWorld();
    const res = await results(w.sa);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.assessments.map((a: { title: string }) => a.title)).toEqual(["Test 1", "Exam"]);
    const rows = res.json.data.rows as {
      participantId: string;
      average: number | null;
      grade: string | null;
      cells: { title: string; percent: number | null; code: string | null; grade: string | null; passed: boolean | null }[];
    }[];
    const of = (id: string) => rows.find((r) => r.participantId === id)!;
    // Amina: 36/40 = 90% (weight 1), 80% (weight 3) -> (90 + 240) / 4 = 82.5
    expect(of(w.amina)).toMatchObject({ average: 82.5, grade: "Good" });
    expect(of(w.amina).cells[0]).toMatchObject({ title: "Test 1", percent: 90, grade: "Excellent", passed: true });
    // Binta: 50% (1) and ABSENT = 0 (3) -> 50 / 4 = 12.5
    expect(of(w.binta)).toMatchObject({ average: 12.5, grade: "Fail" });
    expect(of(w.binta).cells[1]).toMatchObject({ code: "ABSENT", percent: null });
    // Cara: 100% (1), 90% (3) -> 370 / 4 = 92.5
    expect(of(w.cara)).toMatchObject({ average: 92.5, grade: "Excellent" });
    // Hauwa: EXCUSED is left out, so only the exam counts: 70
    expect(of(w.hauwa)).toMatchObject({ average: 70, grade: "Good" });
    expect(of(w.hauwa).cells[0]).toMatchObject({ code: "EXCUSED", percent: null });
  });

  test("only the people the caller may see; a group narrows it", async () => {
    await publishedWorld();
    const ids = async (who: Person, qs = "") =>
      ((await results(who, qs)).json.data.rows as { participantId: string }[]).map((r) => r.participantId).sort();
    expect(await ids(w.sa)).toEqual([w.amina, w.binta, w.cara, w.hauwa].sort());
    expect(await ids(w.teacher)).toEqual([w.amina, w.binta, w.cara].sort());
    expect(await ids(w.recorder)).toEqual([w.amina, w.cara].sort());
    expect(await ids(w.adminB)).toEqual([w.cara]);
    expect(await ids(w.loner)).toEqual([]);
    expect(await ids(w.sa, `?groupId=${w.group2}`)).toEqual([w.binta]);
    expect((await results(w.teacher, `?groupId=${w.juzB}`)).status).toBe(404);
    expect((await results(w.sa, "?groupId=well-formed-but-nothing")).status).toBe(404);
    expect((await results(w.sa, "?other=1")).status).toBe(200);
  });

  test("an assessment for one group applies only to its people", async () => {
    const id = await made({ title: "Group 2 test", groupIds: [w.group2] });
    expect((await scores(w.sa, id, [mark(w.binta, 40)])).status).toBe(200);
    expect((await act(w.sa, id, "mark")).status).toBe(200);
    expect((await act(w.sa, id, "publish")).status).toBe(200);
    const rows = (await results(w.sa)).json.data.rows as { participantId: string; cells: unknown[]; average: number | null }[];
    expect(rows.find((r) => r.participantId === w.binta)).toMatchObject({ average: 100 });
    expect(rows.find((r) => r.participantId === w.amina)!.cells).toEqual([]);
    expect(rows.find((r) => r.participantId === w.amina)!.average).toBeNull();
  });
});

test.describe("races and the database", () => {
  test("two people entering the same score at once: one wins, the other is told it changed", async () => {
    const id = await made();
    const [one1, two] = await Promise.all([scores(w.teacher, id, [mark(w.amina, 10)]), scores(w.progAdmin, id, [mark(w.amina, 20)])]);
    expect([one1.status, two.status].sort()).toEqual([200, 409]);
    expect([one1, two].find((r) => r.status === 409)!.json.error.code).toBe("CHANGED");
    expect(await scoresInDb()).toBe(1);
  });

  test("two people correcting the same score at once: one correction, one refusal", async () => {
    const id = await made();
    expect((await scores(w.teacher, id, [mark(w.amina, 10)])).status).toBe(200);
    const [a, b] = await Promise.all([
      scores(w.teacher, id, [mark(w.amina, 11, { version: 1 })]),
      scores(w.progAdmin, id, [mark(w.amina, 12, { version: 1 })]),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await db.programScore.findFirstOrThrow()).version).toBe(2);
  });

  test("the score history is append-only", async () => {
    const id = await made();
    expect((await scores(w.teacher, id, [mark(w.amina, 10)])).status).toBe(200);
    await expect(db.$executeRawUnsafe(`UPDATE "ProgramScoreChange" SET "reason" = 'rewritten'`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "ProgramScoreChange"`)).rejects.toThrow(/append-only/);
    expect(await db.programScoreChange.count()).toBe(1);
  });

  test("the database refuses what the service would", async () => {
    const id = await made();
    const row = { assessmentId: id, programId: w.program, participantId: w.amina, branchId: w.A.id, markedByUserId: w.sa.id };
    await expect(db.programScore.create({ data: { ...row } })).rejects.toThrow(); // neither a score nor a code
    await expect(db.programScore.create({ data: { ...row, score: 5, code: "ABSENT" } })).rejects.toThrow(); // both
    await expect(db.programScore.create({ data: { ...row, score: -1 } })).rejects.toThrow();
    await expect(db.programScore.create({ data: { ...row, score: 1001 } })).rejects.toThrow();
    await expect(db.programScore.create({ data: { ...row, score: 5, comment: "c".repeat(501) } })).rejects.toThrow();
    await expect(db.programScore.create({ data: { ...row, score: 5, version: 0 } })).rejects.toThrow();
    const other = await post(PROGRAMS, w.sa, { name: "Elsewhere", kind: "ONGOING", branchIds: [w.A.id], levelLabels: ["Class"] });
    await expect(db.programScore.create({ data: { ...row, score: 5, programId: other.json.data.id } })).rejects.toThrow(); // a person of another program
    await db.programScore.create({ data: { ...row, score: 5 } });
    await expect(db.programScore.create({ data: { ...row, score: 6 } })).rejects.toThrow(); // one per person per assessment
    const mk = (over: Record<string, unknown>) =>
      db.programAssessment.create({
        data: { programId: w.program, title: "T", date: new Date(day(0)), maxScore: 10, createdByUserId: w.sa.id, ...over },
      });
    await expect(mk({ title: " padded" })).rejects.toThrow();
    await expect(mk({ maxScore: 0 })).rejects.toThrow();
    await expect(mk({ passMark: 11 })).rejects.toThrow();
    await expect(mk({ weight: 0 })).rejects.toThrow();
    await expect(db.programGroup.delete({ where: { id: w.group1 } })).rejects.toThrow();
    await expect(db.program.update({ where: { id: w.program }, data: { gradeBands: { not: "an array" } } })).rejects.toThrow();
  });
});
