import "../support/env";
import { test, expect } from "@playwright/test";
import { db, resetDatabase } from "../support/db";
import { api } from "../support/http";
import { PROGRAMS, day, get, post, send, type Person, type World } from "../support/programs";
import { GUARDIAN_PHONE, PUPIL_DOB, portalCookie, progressWorld, range } from "../support/progress";
import { weekStartOf } from "@/lib/programs/progress-rules";

// Progress records (task 0044, slices R1 to R3): the running log kept for each person in a program. Who sees which record, who writes, what is refused, the version check, verification and
// four-eyes, the lock, and what a pupil and a guardian see through the portal.

let w: World;

test.beforeEach(async () => {
  w = await progressWorld();
});
test.afterAll(async () => {
  await resetDatabase();
});

const P = () => `${PROGRAMS}/${w.program}/progress`;
const rec = (person: string) => `${P()}/people/${person}`;
const setProgram = (who: Person, body: object) => send("PATCH", `${PROGRAMS}/${w.program}/settings`, who, body);
const text = (entryDate: string, r = range(2, 1, 2, 5), extra: object = {}) => ({
  trackKey: "new",
  entryDate,
  values: { range: r, rating: 4, ...extra },
});
const add = (who: Person, person: string, body: object) => post(`${rec(person)}/entries`, who, body);
const patchEntry = (who: Person, person: string, id: string, body: object) => send("PATCH", `${rec(person)}/entries/${id}`, who, body);
const action = (who: Person, person: string, id: string, body: object) => post(`${rec(person)}/entries/${id}`, who, body);
const lock = (who: Person, person: string, id: string, act: string) => post(`${rec(person)}/entries/${id}/lock`, who, { action: act });
const peopleOf = async (who: Person) =>
  ((await get(P(), who)).json.data.people as { participantId: string }[]).map((p) => p.participantId).sort();
const entryRow = (id: string) => db.progressEntry.findUniqueOrThrow({ where: { id } });
const made = async (who: Person, person: string, entryDate: string, extra: object = {}) => {
  const res = await add(who, person, { ...text(entryDate), ...extra });
  expect(res.status, res.text).toBe(201);
  return res.json.data.id as string;
};
const lastWeek = () => weekStartOf(day(-7), 6);

test.describe("setting it up", () => {
  test("a program needs a template before it can turn progress records on, and the template is kept as a copy", async () => {
    const created = await post(PROGRAMS, w.sa, { name: "Second", kind: "ONGOING", branchIds: [w.A.id], levelLabels: ["Class"] });
    expect(created.status, created.text).toBe(201);
    const id = created.json.data.id as string;
    const set = (body: object) => send("PATCH", `${PROGRAMS}/${id}/settings`, w.sa, body);
    const refused = await set({ progressEnabled: true });
    expect(refused.status).toBe(400);
    expect(refused.json.error.details[0].path).toBe("body.progressTemplate");
    expect((await set({ progressTemplate: "NOPE" })).status).toBe(400);
    const on = await set({ progressTemplate: "SIMPLE_LOG", progressEnabled: true });
    expect(on.status, on.text).toBe(200);
    expect(on.json.data).toMatchObject({
      progressEnabled: true,
      progressTemplate: "SIMPLE_LOG",
      progressWriters: "BOTH",
      progressFourEyes: true,
    });
    const templates = await db.progressTemplate.findMany({ where: { programId: id } });
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ key: "SIMPLE_LOG", version: 1 });
    expect(await db.programAudit.count({ where: { programId: id, action: "PROGRAM_SETTINGS_CHANGED" } })).toBe(1);
  });

  test("the template cannot be swapped once a record has been started", async () => {
    await made(w.teacher, w.amina, day(-1));
    const swap = await setProgram(w.sa, { progressTemplate: "SIMPLE_LOG" });
    expect(swap.status).toBe(409);
    expect(swap.json.error.code).toBe("TEMPLATE_IN_USE");
    expect((await setProgram(w.sa, { progressTemplate: "QURAN_BOOKLET" })).status).toBe(200);
  });

  test("a program admin changes the settings; only a super admin changes four-eyes; the lock times are checked; nobody else may", async () => {
    expect(
      (
        await setProgram(w.progAdmin, {
          progressWriters: "TEACHERS",
          progressRequireVerification: true,
          progressLockInactivity: 600,
          progressLockRelease: 0,
        })
      ).status,
    ).toBe(200);
    expect(await db.program.findUniqueOrThrow({ where: { id: w.program } })).toMatchObject({
      progressWriters: "TEACHERS",
      progressRequireVerification: true,
      progressLockInactivity: 600,
      progressLockRelease: 0,
    });
    const four = await setProgram(w.progAdmin, { progressFourEyes: false });
    expect(four.status).toBe(403);
    expect((await setProgram(w.sa, { progressFourEyes: false })).status).toBe(200);
    expect((await setProgram(w.sa, { progressLockInactivity: 30 })).status).toBe(400);
    expect((await setProgram(w.sa, { progressLockInactivity: 4000 })).status).toBe(400);
    expect((await setProgram(w.sa, { progressLockRelease: 301 })).status).toBe(400);
    expect((await setProgram(w.sa, { progressGuardianDetail: "EVERYTHING" })).status).toBe(400);
    expect((await setProgram(w.sa, { progressSecret: true })).status).toBe(400);
    for (const who of [w.teacher, w.supervisor, w.recorder])
      expect((await setProgram(who, { progressWriters: "ASSIGNED" })).status).toBe(403);
    expect((await setProgram(w.loner, { progressWriters: "ASSIGNED" })).status).toBe(403);
  });

  test("the school's switch is a ceiling: off, nothing can be written, what was recorded can still be read; a branch can leave on its own", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    expect((await send("PATCH", "/api/v1/settings/programs-progress", w.sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    const overview = (await get(P(), w.teacher)).json.data;
    expect(overview.state).toMatchObject({ on: false, offBy: "SCHOOL" });
    const blocked = await add(w.teacher, w.amina, text(day(-2)));
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("PROGRESS_OFF");
    const read = await get(rec(w.amina), w.teacher);
    expect(read.status).toBe(200);
    expect(read.json.data.entries.map((e: { id: string }) => e.id)).toEqual([id]);
    expect(read.json.data.rights.write).toBe(false);
    expect((await send("PATCH", "/api/v1/settings/programs-progress", w.sa, { scope: "GLOBAL", enabled: null })).status).toBe(200);
    // one branch off: its people cannot be written to, the other branch goes on
    expect(
      (await send("PATCH", "/api/v1/settings/programs-progress", w.sa, { scope: "BRANCH", branchId: w.A.id, enabled: false })).status,
    ).toBe(200);
    const off = await add(w.teacher, w.amina, text(day(-3)));
    expect(off.status).toBe(409);
    expect(off.json.error.code).toBe("BRANCH_OFF");
    expect((await add(w.sa, w.cara, text(day(-3)))).status).toBe(201);
  });

  test("the program's own flag turns it off: reading still works", async () => {
    await made(w.teacher, w.amina, day(-1));
    expect((await setProgram(w.sa, { progressEnabled: false })).status).toBe(200);
    const overview = await get(P(), w.sa);
    expect(overview.json.data.state).toMatchObject({ on: false, offBy: "PROGRAM" });
    expect((await add(w.teacher, w.amina, text(day(-2)))).json.error.code).toBe("PROGRESS_OFF");
    expect((await get(rec(w.amina), w.sa)).status).toBe(200);
  });
});

test.describe("who sees which record", () => {
  test("each person sees the people they reach, and no one else", async () => {
    const all = [w.amina, w.binta, w.cara, w.hauwa].sort();
    expect(await peopleOf(w.sa)).toEqual(all);
    expect(await peopleOf(w.progAdmin)).toEqual(all);
    expect(await peopleOf(w.supervisor)).toEqual(all);
    expect(await peopleOf(w.teacher)).toEqual([w.amina, w.binta, w.cara].sort());
    expect(await peopleOf(w.recorder)).toEqual([w.amina, w.cara].sort());
    expect(await peopleOf(w.adminA)).toEqual([w.amina, w.binta, w.hauwa].sort());
    expect(await peopleOf(w.adminB)).toEqual([w.cara]);
    expect(await peopleOf(w.loner)).toEqual([]);
  });

  test("a record out of reach is not found", async () => {
    expect((await get(rec(w.amina), w.loner)).status).toBe(404);
    expect((await get(rec(w.amina), w.adminB)).status).toBe(404);
    expect((await get(rec(w.binta), w.recorder)).status).toBe(404);
    expect((await get(rec(w.hauwa), w.teacher)).status).toBe(404);
    expect((await get(rec(w.amina), w.recorder)).status).toBe(200);
    expect((await get(rec("not-a-person"), w.sa)).status).toBe(404);
    expect((await get(`${PROGRAMS}/not-a-program/progress`, w.sa)).status).toBe(404);
  });

  test("the search, the group filter and the pages narrow the list; a search for % matches nobody", async () => {
    const byName = (await get(`${P()}?q=amin`, w.sa)).json.data;
    expect(byName.people.map((p: { participantId: string }) => p.participantId)).toEqual([w.amina]);
    expect((await get(`${P()}?q=%25`, w.sa)).json.data.people).toEqual([]);
    const inGroup2 = (await get(`${P()}?groupId=${w.group2}`, w.sa)).json.data;
    expect(inGroup2.people.map((p: { participantId: string }) => p.participantId)).toEqual([w.binta]);
    expect(inGroup2.total).toBe(1);
    expect((await get(`${P()}?page=0`, w.sa)).status).toBe(400);
    expect((await get(`${P()}?colour=red`, w.sa)).status).toBe(400);
  });

  test("a guardian's contact is shown to those who write to the record, not to a supervisor who only reads", async () => {
    const asTeacher = (await get(rec(w.amina), w.teacher)).json.data.person;
    expect(asTeacher.guardianName).toBe("Amina's parent");
    expect(asTeacher.guardianPhone).toBe("+2348011110001");
    const asSupervisor = (await get(rec(w.amina), w.supervisor)).json.data.person;
    expect(asSupervisor.guardianName).toBeNull();
    expect(asSupervisor.guardianPhone).toBeNull();
  });

  test("the list says who has entries, the last one's day and how many wait to be verified", async () => {
    await setProgram(w.sa, { progressRequireVerification: true });
    const a = await made(w.teacher, w.amina, day(-3));
    await made(w.teacher, w.amina, day(-2));
    await action(w.teacher, w.amina, a, { action: "submit", version: 1 });
    const row = (await get(P(), w.supervisor)).json.data.people.find((p: { participantId: string }) => p.participantId === w.amina);
    expect(row).toMatchObject({ hasRecord: true, entries: 2, lastEntryOn: day(-2), waiting: 1, canWrite: false });
    const mine = (await get(P(), w.teacher)).json.data.people.find((p: { participantId: string }) => p.participantId === w.amina);
    expect(mine.canWrite).toBe(true);
    const none = (await get(P(), w.sa)).json.data.people.find((p: { participantId: string }) => p.participantId === w.binta);
    expect(none).toMatchObject({ hasRecord: false, entries: 0, lastEntryOn: null, waiting: 0 });
  });
});

test.describe("writing entries", () => {
  test("a teacher adds an entry: it is published at once while verification is off, with a record, a revision and the name of the writer", async () => {
    const res = await add(w.teacher, w.amina, text(day(-1), range(2, 1, 2, 5), { notes: "Smooth" }));
    expect(res.status, res.text).toBe(201);
    const row = await entryRow(res.json.data.id);
    expect(row).toMatchObject({
      status: "VERIFIED",
      version: 1,
      trackKey: "new",
      createdByUserId: w.teacher.id,
      lastEditedByUserId: w.teacher.id,
    });
    expect(row.values).toEqual({ range: range(2, 1, 2, 5), notes: "Smooth", rating: 4 });
    expect(row.publishedValues).toEqual(row.values);
    expect(row.publishedAt).not.toBeNull();
    expect(await db.progressRecord.count({ where: { participantId: w.amina } })).toBe(1);
    expect(await db.progressEntryRevision.count({ where: { entryId: row.id, action: "CREATE" } })).toBe(1);
    const shown = (await get(rec(w.amina), w.teacher)).json.data;
    expect(shown.entries).toHaveLength(1);
    expect(shown.entries[0]).toMatchObject({ trackKey: "new", status: "VERIFIED", createdBy: "Teacher", canEdit: true, canVerify: false });
    expect(shown.next.new).toEqual({ surah: 2, ayah: 6 });
  });

  test("the program admin and the super admin write anywhere; a recorder and a teacher write to their groups; the rest cannot", async () => {
    expect((await add(w.sa, w.cara, text(day(-1)))).status).toBe(201);
    expect((await add(w.progAdmin, w.binta, text(day(-1)))).status).toBe(201);
    expect((await add(w.recorder, w.amina, text(day(-1)))).status).toBe(201);
    expect((await add(w.teacher, w.binta, text(day(-2)))).status).toBe(201);
    expect((await add(w.supervisor, w.amina, text(day(-2)))).status).toBe(403);
    expect((await add(w.adminA, w.amina, text(day(-2)))).status).toBe(403);
    expect((await add(w.adminB, w.cara, text(day(-2)))).status).toBe(403);
    expect((await add(w.recorder, w.binta, text(day(-2)))).status).toBe(404);
    expect((await add(w.loner, w.amina, text(day(-2)))).status).toBe(404);
    expect((await add(w.teacher, w.hauwa, text(day(-2)))).status).toBe(404);
    expect(await db.progressEntry.count()).toBe(4);
  });

  test("the writers setting chooses between teachers and recorders", async () => {
    expect((await setProgram(w.sa, { progressWriters: "TEACHERS" })).status).toBe(200);
    expect((await add(w.recorder, w.amina, text(day(-1)))).status).toBe(403);
    expect((await add(w.teacher, w.amina, text(day(-1)))).status).toBe(201);
    expect((await setProgram(w.sa, { progressWriters: "ASSIGNED" })).status).toBe(200);
    expect((await add(w.teacher, w.amina, text(day(-2)))).status).toBe(403);
    expect((await add(w.recorder, w.amina, text(day(-2)))).status).toBe(201);
    const shown = (await get(rec(w.amina), w.teacher)).json.data;
    expect(shown.rights.write).toBe(false);
    expect(shown.rights.whyNot).toMatch(/not named to write/);
    expect((await setProgram(w.sa, { progressWriters: "BOTH" })).status).toBe(200);
    expect((await add(w.teacher, w.amina, text(day(-3)))).status).toBe(201);
  });

  test("what cannot be right is refused with the field named", async () => {
    const bad = async (body: object, path: string, status = 400) => {
      const res = await add(w.teacher, w.amina, body);
      expect(res.status, JSON.stringify(body) + res.text).toBe(status);
      if (path) expect(res.json.error.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad(text(day(-1), range(2, 1, 2, 500)), "body.values.range");
    await bad(text(day(-1), range(2, 10, 2, 9)), "body.values.range");
    await bad(text(day(-1), range(115, 1, 115, 1)), "body.values.range");
    await bad({ trackKey: "new", entryDate: day(-1), values: { rating: 4 } }, "body.values.range");
    await bad({ trackKey: "new", entryDate: day(-1), values: {} }, "");
    await bad(text(day(-1), range(2, 1, 2, 5), { rating: 9 }), "body.values.rating");
    await bad(text(day(-1), range(2, 1, 2, 5), { colour: "red" }), "body.values.colour");
    await bad(text(day(-1), range(2, 1, 2, 5), { notes: "x".repeat(501) }), "body.values.notes");
    await bad(text(day(1)), "body.entryDate");
    await bad(text(day(-31)), "body.entryDate");
    await bad(text("2026-02-30"), "body.entryDate");
    await bad({ trackKey: "nothing", entryDate: day(-1), values: { note: "x" } }, "body.trackKey");
    await bad({ trackKey: "new", entryDate: day(-1), values: "text" }, "");
    await bad({ trackKey: "new", entryDate: day(-1), values: {}, status: "VERIFIED" }, "");
    expect(await db.progressEntry.count()).toBe(0);
    // the edges are fine: today, and the day the place began
    expect((await add(w.teacher, w.amina, text(day(0)))).status).toBe(201);
    expect((await add(w.teacher, w.amina, text(day(-30)))).status).toBe(201);
  });

  test("a track with one row a day opens the existing entry instead of making a second; the others take as many as are wanted", async () => {
    const first = await made(w.teacher, w.amina, day(-1));
    const second = await add(w.teacher, w.amina, text(day(-1), range(3, 1, 3, 5)));
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("EXISTS");
    expect(second.json.error.details.find((d: { path: string }) => d.path === "entryId").message).toBe(first);
    expect((await add(w.teacher, w.amina, { trackKey: "revision", entryDate: day(-1), values: { range: range(1, 1, 1, 7) } })).status).toBe(
      201,
    );
    for (const grade of [3, 4])
      expect((await add(w.teacher, w.amina, { trackKey: "followup", entryDate: day(-1), values: { grade } })).status).toBe(201);
    expect(
      (await add(w.teacher, w.amina, { trackKey: "mistakes", entryDate: day(-1), values: { note: "Confuses the endings" } })).status,
    ).toBe(201);
    expect(await db.progressEntry.count()).toBe(5);
  });

  test("a change needs the version it was opened at; a stale one is refused naming who changed it; saving what is stored changes nothing", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    const changed = await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 9), rating: 5 }, version: 1 });
    expect(changed.status, changed.text).toBe(200);
    expect(await entryRow(id)).toMatchObject({ version: 2 });
    const stale = await patchEntry(w.recorder, w.amina, id, { values: { range: range(2, 1, 2, 7) }, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe("CHANGED");
    expect(stale.json.error.message).toMatch(/Changed by Teacher at \d\d:\d\d/);
    expect(stale.json.error.details[0].message).toBe("2");
    const same = await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 9), rating: 5 }, version: 2 });
    expect(same.status).toBe(200);
    expect(await entryRow(id)).toMatchObject({ version: 2 });
    expect(await db.progressEntryRevision.count({ where: { entryId: id } })).toBe(2);
    expect((await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 9) } })).status).toBe(400);
    expect((await patchEntry(w.teacher, w.amina, id, { values: {}, version: 2 })).status).toBe(400);
    expect((await patchEntry(w.supervisor, w.amina, id, { values: { range: range(2, 1, 2, 9) }, version: 2 })).status).toBe(403);
    expect((await patchEntry(w.teacher, w.binta, id, { values: { range: range(2, 1, 2, 9) }, version: 2 })).status).toBe(404);
  });

  test("every save is in the history, and the history and the template cannot be rewritten", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 9) }, version: 1 });
    const history = await get(`${rec(w.amina)}/entries/${id}/history`, w.supervisor);
    expect(history.status).toBe(200);
    const rows = history.json.data as { action: string; by: string; before: unknown; after: { range: unknown } }[];
    expect(rows.map((r) => r.action)).toEqual(["CREATE", "UPDATE"]);
    expect(rows[1]).toMatchObject({ by: "Teacher", before: { range: range(2, 1, 2, 5), rating: 4 }, after: { range: range(2, 1, 2, 9) } });
    expect((await get(`${rec(w.amina)}/entries/${id}/history`, w.loner)).status).toBe(404);
    await expect(db.progressEntryRevision.updateMany({ data: { note: "rewritten" } })).rejects.toThrow(/append-only/);
    await expect(db.progressEntryRevision.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(db.progressTemplate.updateMany({ data: { version: 2 } })).rejects.toThrow(/immutable/);
    await expect(db.progressTemplate.deleteMany({})).rejects.toThrow(/immutable/);
  });

  test("the week grid saves several days at once, all or nothing, and each changed day carries its version", async () => {
    const ws = lastWeek();
    const rows = [0, 1, 2].map((i) => ({
      trackKey: "new",
      entryDate: weekAfter(ws, i),
      values: { range: range(2, 1 + i * 5, 2, 5 + i * 5), rating: 3 },
    }));
    const saved = await send("PUT", `${rec(w.amina)}/week`, w.teacher, { rows });
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.data.saved).toBe(3);
    const ids = saved.json.data.ids as string[];
    // one bad row writes none of the others
    const bad = await send("PUT", `${rec(w.amina)}/week`, w.teacher, {
      rows: [
        { id: ids[0], trackKey: "new", entryDate: rows[0]!.entryDate, values: { range: range(2, 1, 2, 6) }, version: 1 },
        { trackKey: "revision", entryDate: weekAfter(ws, 0), values: { range: range(1, 1, 1, 7) } },
        { trackKey: "revision", entryDate: weekAfter(ws, 1), values: { range: range(1, 1, 1, 999) } },
      ],
    });
    expect(bad.status).toBe(400);
    expect(await db.progressEntry.count({ where: { trackKey: "revision" } })).toBe(0);
    expect(await entryRow(ids[0]!)).toMatchObject({ version: 1 });
    // a stale version in the middle refuses the lot
    const stale = await send("PUT", `${rec(w.amina)}/week`, w.teacher, {
      rows: [
        { trackKey: "revision", entryDate: weekAfter(ws, 0), values: { range: range(1, 1, 1, 7) } },
        { id: ids[1], trackKey: "new", entryDate: rows[1]!.entryDate, values: { range: range(2, 6, 2, 11) }, version: 9 },
      ],
    });
    expect(stale.status).toBe(409);
    expect(await db.progressEntry.count({ where: { trackKey: "revision" } })).toBe(0);
    // a good change of one day and a new day
    const good = await send("PUT", `${rec(w.amina)}/week`, w.teacher, {
      rows: [
        { id: ids[1], trackKey: "new", entryDate: rows[1]!.entryDate, values: { range: range(2, 6, 2, 12) }, version: 1 },
        { trackKey: "revision", entryDate: weekAfter(ws, 0), values: { range: range(1, 1, 1, 7) } },
      ],
    });
    expect(good.status, good.text).toBe(200);
    expect(await entryRow(ids[1]!)).toMatchObject({ version: 2 });
    // a day twice in one save, a row that changes an entry without its version, too many rows
    const twice = await send("PUT", `${rec(w.amina)}/week`, w.teacher, {
      rows: [text(weekAfter(ws, 3)), text(weekAfter(ws, 3), range(3, 1, 3, 2))],
    });
    expect(twice.status).toBe(400);
    expect((await send("PUT", `${rec(w.amina)}/week`, w.teacher, { rows: [{ id: ids[0], ...text(rows[0]!.entryDate) }] })).status).toBe(
      400,
    );
    const many = Array.from({ length: 31 }, (_, i) => ({ trackKey: "followup", entryDate: day(-1), values: { notes: `n${i}` } }));
    expect((await send("PUT", `${rec(w.amina)}/week`, w.teacher, { rows: many })).status).toBe(400);
    expect((await send("PUT", `${rec(w.amina)}/week`, w.supervisor, { rows })).status).toBe(403);
  });

  test("a place that is not taking part cannot be written to, but its record can be read", async () => {
    await made(w.teacher, w.amina, day(-2));
    const amina = await db.programParticipant.findUniqueOrThrow({ where: { id: w.amina }, select: { studentId: true } });
    const suspended = await post(`/api/v1/students/${amina.studentId}/standing`, w.sa, {
      action: "suspend",
      reason: "Disturbing the class",
    });
    expect(suspended.status, suspended.text).toBe(200);
    const refused = await add(w.teacher, w.amina, text(day(-1)));
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NOT_ACTIVE");
    expect((await add(w.sa, w.amina, text(day(-1)))).status).toBe(409);
    const shown = (await get(rec(w.amina), w.teacher)).json.data;
    expect(shown.entries).toHaveLength(1);
    expect(shown.rights).toMatchObject({ write: false });
    expect(shown.rights.whyNot).toMatch(/not taking part/);
    expect(
      (await post(`${PROGRAMS}/${w.program}/people/${w.binta}/place`, w.sa, { action: "withdraw", reason: "Moved away" })).status,
    ).toBe(200);
    expect((await add(w.teacher, w.binta, text(day(-1)))).json.error.code).toBe("NOT_ACTIVE");
  });

  test("the profile holds what the system does not know, is checked, and is versioned", async () => {
    const put = (who: Person, body: object, person = w.amina) => send("PUT", rec(person), who, body);
    const saved = await put(w.teacher, { values: { age: " 12 ", neighbourhood: "Gwarinpa", riwayah: "HAFS" } });
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.data.version).toBe(2);
    const shown = (await get(rec(w.amina), w.teacher)).json.data.record;
    expect(shown).toMatchObject({ profile: { age: "12", neighbourhood: "Gwarinpa", riwayah: "HAFS" }, version: 2 });
    expect(
      (await put(w.teacher, { values: { age: "12", neighbourhood: "Gwarinpa", riwayah: "HAFS" }, version: 2 })).json.data.version,
    ).toBe(2);
    expect((await put(w.recorder, { values: { age: "13" }, version: 1 })).status).toBe(409);
    expect((await put(w.recorder, { values: { age: "13" }, version: 2 })).status).toBe(200);
    expect((await put(w.teacher, { values: { shoeSize: "9" } })).status).toBe(400);
    expect((await put(w.teacher, { values: { riwayah: "OTHER" } })).status).toBe(400);
    expect((await put(w.teacher, { values: { age: 12 } })).status).toBe(400);
    expect((await put(w.supervisor, { values: { age: "13" } })).status).toBe(403);
    expect((await put(w.teacher, { values: { age: "13" } }, w.hauwa)).status).toBe(404);
    expect(await db.programAudit.count({ where: { programId: w.program, action: "PROGRESS_PROFILE_CHANGED" } })).toBe(2);
  });

  test("the next range starts after the last ayah done, and at the next surah after a finished one", async () => {
    await made(w.teacher, w.amina, day(-3));
    expect((await get(rec(w.amina), w.teacher)).json.data.next.new).toEqual({ surah: 2, ayah: 6 });
    await add(w.teacher, w.amina, text(day(-2), range(1, 1, 1, 7)));
    expect((await get(rec(w.amina), w.teacher)).json.data.next.new).toEqual({ surah: 2, ayah: 1 });
    expect((await get(rec(w.amina), w.teacher)).json.data.next.revision).toBeNull();
    expect((await get(rec(w.binta), w.teacher)).json.data.next).toEqual({});
  });

  test("the range of days shown is bounded and checked", async () => {
    await made(w.teacher, w.amina, day(-20));
    const narrow = (await get(`${rec(w.amina)}?from=${day(-5)}&to=${day(0)}`, w.teacher)).json.data;
    expect(narrow.entries).toHaveLength(0);
    const wide = (await get(`${rec(w.amina)}?from=${day(-25)}&to=${day(0)}`, w.teacher)).json.data;
    expect(wide.entries).toHaveLength(1);
    expect((await get(`${rec(w.amina)}?from=${day(0)}&to=${day(-5)}`, w.teacher)).status).toBe(400);
    expect((await get(`${rec(w.amina)}?from=yesterday`, w.teacher)).status).toBe(400);
    const clamped = (await get(`${rec(w.amina)}?from=2000-01-01&to=${day(0)}`, w.teacher)).json.data;
    expect(clamped.from).toBe(new Date(Date.parse(`${day(0)}T00:00:00Z`) - 400 * 864e5).toISOString().slice(0, 10));
  });

  test("two clients adding the same day at once make one entry", async () => {
    const results = await Promise.all([add(w.teacher, w.amina, text(day(-1))), add(w.recorder, w.amina, text(day(-1), range(3, 1, 3, 9)))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.progressEntry.count({ where: { trackKey: "new" } })).toBe(1);
  });

  test("two clients changing the same version at once: one wins, the other is told", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    const results = await Promise.all([
      patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 7) }, version: 1 }),
      patchEntry(w.recorder, w.amina, id, { values: { range: range(2, 1, 2, 8) }, version: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await entryRow(id)).toMatchObject({ version: 2 });
  });

  test("an unknown key, the wrong type and an oversized note are refused before anything is written", async () => {
    expect((await add(w.teacher, w.amina, { ...text(day(-1)), extra: 1 })).status).toBe(400);
    expect((await add(w.teacher, w.amina, { trackKey: 5, entryDate: day(-1), values: {} })).status).toBe(400);
    expect((await add(w.teacher, w.amina, { entryDate: day(-1), values: {} })).status).toBe(400);
    const bigNote = "n".repeat(70_000);
    expect((await add(w.teacher, w.amina, text(day(-1), range(2, 1, 2, 5), { notes: bigNote }))).status).toBeGreaterThanOrEqual(400);
    expect(await db.progressEntry.count()).toBe(0);
    expect((await api(`${rec(w.amina)}/entries`, { method: "POST", cookie: w.teacher.cookie, rawBody: "{not json" })).status).toBe(400);
    expect((await api(`${rec(w.amina)}/entries`, { method: "POST" })).status).toBe(401);
  });
});

const weekAfter = (start: string, count: number) => new Date(Date.parse(`${start}T00:00:00Z`) + count * 864e5).toISOString().slice(0, 10);

test.describe("verification", () => {
  test.beforeEach(async () => {
    expect((await setProgram(w.sa, { progressRequireVerification: true })).status).toBe(200);
  });

  test("an entry is a draft, is handed in by its writer, and is verified by someone else; families get nothing until then", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    expect(await entryRow(id)).toMatchObject({ status: "DRAFT", publishedValues: null, publishedAt: null });
    const handIn = await action(w.teacher, w.amina, id, { action: "submit", version: 1 });
    expect(handIn.status, handIn.text).toBe(200);
    expect(await entryRow(id)).toMatchObject({ status: "SUBMITTED", version: 2, publishedValues: null });
    expect((await action(w.teacher, w.amina, id, { action: "submit", version: 2 })).status).toBe(409);
    expect((await action(w.teacher, w.amina, id, { action: "verify", version: 2 })).status).toBe(403);
    expect((await action(w.recorder, w.amina, id, { action: "verify", version: 2 })).status).toBe(403);
    expect((await action(w.adminA, w.amina, id, { action: "verify", version: 2 })).status).toBe(403);
    expect((await action(w.supervisor, w.amina, id, { action: "verify", version: 1 })).status).toBe(409);
    const verified = await action(w.supervisor, w.amina, id, { action: "verify", version: 2 });
    expect(verified.status, verified.text).toBe(200);
    expect(verified.json.data.status).toBe("VERIFIED");
    const row = await entryRow(id);
    expect(row).toMatchObject({ status: "VERIFIED", version: 3, verifiedByUserId: w.supervisor.id });
    expect(row.publishedValues).toEqual(row.values);
    expect(
      await db.progressEntryRevision.findMany({ where: { entryId: id }, select: { action: true }, orderBy: { createdAt: "asc" } }),
    ).toEqual([{ action: "CREATE" }, { action: "SUBMIT" }, { action: "VERIFY" }]);
  });

  test("a draft saved with 'hand in' goes straight to handed in; with verification off nothing can be handed in", async () => {
    const res = await add(w.teacher, w.amina, { ...text(day(-1)), submit: true });
    expect(res.status).toBe(201);
    expect(await entryRow(res.json.data.id)).toMatchObject({ status: "SUBMITTED" });
    expect((await setProgram(w.sa, { progressRequireVerification: false })).status).toBe(200);
    const direct = await made(w.teacher, w.amina, day(-2));
    expect((await action(w.teacher, w.amina, direct, { action: "submit", version: 1 })).json.error.code).toBe("NOT_APPLICABLE");
  });

  test("four-eyes: nobody verifies what they wrote or last changed, until a super admin turns the rule off", async () => {
    const mine = await add(w.progAdmin, w.binta, { ...text(day(-1)), submit: true });
    const id = mine.json.data.id as string;
    const own = await action(w.progAdmin, w.binta, id, { action: "verify", version: 1 });
    expect(own.status).toBe(403);
    expect(own.json.error.code).toBe("FOUR_EYES");
    expect((await action(w.sa, w.binta, id, { action: "verify", version: 1 })).status).toBe(200);
    expect((await setProgram(w.sa, { progressFourEyes: false })).status).toBe(200);
    const next = await add(w.progAdmin, w.binta, { ...text(day(-2)), submit: true });
    expect((await action(w.progAdmin, w.binta, next.json.data.id, { action: "verify", version: 1 })).status).toBe(200);
  });

  test("editing a verified entry hands it back in, and families keep the last verified copy", async () => {
    const id = (await add(w.teacher, w.amina, { ...text(day(-1)), submit: true })).json.data.id as string;
    await action(w.supervisor, w.amina, id, { action: "verify", version: 1 });
    const before = (await entryRow(id)).publishedValues;
    const edit = await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 9), rating: 2 }, version: 2 });
    expect(edit.status, edit.text).toBe(200);
    const row = await entryRow(id);
    expect(row).toMatchObject({ status: "SUBMITTED", version: 3 });
    expect(row.publishedValues).toEqual(before);
    expect(row.values).toEqual({ range: range(2, 1, 2, 9), rating: 2 });
    expect((await get(rec(w.amina), w.teacher)).json.data.entries[0]).toMatchObject({ status: "SUBMITTED", published: true });
  });

  test("a verifier can send an entry back with a comment; its writer fixes it and hands it in again", async () => {
    const id = (await add(w.teacher, w.amina, { ...text(day(-1)), submit: true })).json.data.id as string;
    expect((await action(w.supervisor, w.amina, id, { action: "return", version: 1, comment: "ok" })).status).toBe(400);
    expect((await action(w.supervisor, w.amina, id, { action: "return", version: 1 })).status).toBe(400);
    expect((await action(w.teacher, w.amina, id, { action: "return", version: 1, comment: "Not mine to return" })).status).toBe(403);
    const sent = await action(w.supervisor, w.amina, id, { action: "return", version: 1, comment: "Check the last ayah" });
    expect(sent.status, sent.text).toBe(200);
    expect(await entryRow(id)).toMatchObject({ status: "DRAFT", returnComment: "Check the last ayah", version: 2 });
    expect((await get(rec(w.amina), w.teacher)).json.data.entries[0].returnComment).toBe("Check the last ayah");
    const fixed = await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 4) }, version: 2, submit: true });
    expect(fixed.status).toBe(200);
    expect(await entryRow(id)).toMatchObject({ status: "SUBMITTED", returnComment: null });
    expect((await action(w.supervisor, w.amina, id, { action: "return", version: 3, comment: "Another look" })).status).toBe(200);
    expect((await action(w.supervisor, w.amina, id, { action: "verify", version: 4 })).json.error.code).toBe("NOT_APPLICABLE");
  });

  test("'verify the week' verifies every handed-in entry of one person in a week in one step, or none", async () => {
    const ws = lastWeek();
    const ids: string[] = [];
    for (const i of [0, 1, 2]) ids.push((await add(w.teacher, w.amina, { ...text(weekAfter(ws, i)), submit: true })).json.data.id);
    const verify = (who: Person, week = ws, person = w.amina) => post(`${rec(person)}/verify-week`, who, { weekStart: week });
    expect((await verify(w.teacher)).status).toBe(403);
    expect((await verify(w.loner)).status).toBe(404);
    expect((await verify(w.supervisor, weekAfter(ws, -7))).json.error.code).toBe("NOTHING_TO_VERIFY");
    // one of them is the verifier's own: none is verified
    ids.push((await add(w.progAdmin, w.amina, { ...text(weekAfter(ws, 3)), submit: true })).json.data.id);
    const own = await verify(w.progAdmin);
    expect(own.status).toBe(403);
    expect(own.json.error.code).toBe("FOUR_EYES");
    expect(await db.progressEntry.count({ where: { status: "VERIFIED" } })).toBe(0);
    const done = await verify(w.supervisor, weekAfter(ws, 2));
    expect(done.status, done.text).toBe(200);
    expect(done.json.data.verified).toBe(4);
    expect(await db.progressEntry.count({ where: { status: "VERIFIED", programId: w.program } })).toBe(4);
    expect(await db.progressEntryRevision.count({ where: { action: "VERIFY", note: `week of ${ws}` } })).toBe(4);
    expect((await verify(w.supervisor)).json.error.code).toBe("NOTHING_TO_VERIFY");
  });
});

test.describe("the lock on an entry", () => {
  test("one person holds an entry; the others read it and are told who; it can be handed back", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    const taken = await lock(w.teacher, w.amina, id, "take");
    expect(taken.status, taken.text).toBe(200);
    expect(taken.json.data).toMatchObject({ held: true, mine: true, holder: "Teacher", releasing: false });
    const other = await lock(w.recorder, w.amina, id, "take");
    expect(other.status).toBe(409);
    expect(other.json.error.code).toBe("LOCKED");
    expect(other.json.error.message).toMatch(/Teacher is editing/);
    const blocked = await patchEntry(w.recorder, w.amina, id, { values: { range: range(2, 1, 2, 8) }, version: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("LOCKED");
    const seen = (await get(rec(w.amina), w.recorder)).json.data.entries[0];
    expect(seen.lock).toMatchObject({ holder: "Teacher", mine: false });
    expect(seen.canEdit).toBe(false);
    expect((await get(rec(w.amina), w.teacher)).json.data.entries[0].lock).toMatchObject({ mine: true });
    expect((await patchEntry(w.teacher, w.amina, id, { values: { range: range(2, 1, 2, 8) }, version: 1 })).status).toBe(200);
    expect((await lock(w.supervisor, w.amina, id, "take")).status).toBe(403);
    expect((await lock(w.loner, w.amina, id, "take")).status).toBe(404);
    expect((await lock(w.recorder, w.amina, id, "release")).status).toBe(403);
    expect((await lock(w.teacher, w.amina, id, "release")).json.data.held).toBe(false);
    expect((await lock(w.recorder, w.amina, id, "take")).json.data).toMatchObject({ held: true, holder: "Recorder" });
  });

  test("'Viewing' keeps it for a short while, then hands it back; zero hands it back at once; an administrator can release it", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    await lock(w.teacher, w.amina, id, "take");
    const viewing = await lock(w.teacher, w.amina, id, "viewing");
    expect(viewing.json.data).toMatchObject({ held: true, releasing: true });
    expect((await lock(w.recorder, w.amina, id, "take")).status).toBe(409);
    await db.progressLock.update({
      where: { entryId: id },
      data: { heartbeatAt: new Date(Date.now() - 5000), releaseAt: new Date(Date.now() - 1000) },
    });
    expect((await lock(w.recorder, w.amina, id, "take")).status).toBe(200);
    expect((await lock(w.sa, w.amina, id, "release")).json.data.held).toBe(false);
    expect(await db.progressLock.count()).toBe(0);
    expect((await setProgram(w.sa, { progressLockRelease: 0 })).status).toBe(200);
    await lock(w.teacher, w.amina, id, "take");
    expect((await lock(w.teacher, w.amina, id, "viewing")).json.data.held).toBe(false);
    expect(await db.progressLock.count()).toBe(0);
  });

  test("a lock that has expired is nobody's; a heartbeat keeps it going", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    await lock(w.teacher, w.amina, id, "take");
    const first = (await db.progressLock.findUniqueOrThrow({ where: { entryId: id } })).expiresAt.getTime();
    await new Promise((r) => setTimeout(r, 1100));
    expect((await lock(w.teacher, w.amina, id, "heartbeat")).status).toBe(200);
    expect((await db.progressLock.findUniqueOrThrow({ where: { entryId: id } })).expiresAt.getTime()).toBeGreaterThan(first);
    await db.progressLock.update({
      where: { entryId: id },
      data: { expiresAt: new Date(Date.now() - 1000), heartbeatAt: new Date(Date.now() - 2000) },
    });
    expect((await get(rec(w.amina), w.recorder)).json.data.entries[0].lock).toBeNull();
    expect((await patchEntry(w.recorder, w.amina, id, { values: { range: range(2, 1, 2, 6) }, version: 1 })).status).toBe(200);
    expect((await lock(w.recorder, w.amina, id, "heartbeat")).json.data).toMatchObject({ held: true, holder: "Recorder" });
  });

  test("a held entry cannot be verified or returned by someone else", async () => {
    await setProgram(w.sa, { progressRequireVerification: true });
    const id = (await add(w.teacher, w.amina, { ...text(day(-1)), submit: true })).json.data.id as string;
    await lock(w.teacher, w.amina, id, "take");
    const verify = await action(w.supervisor, w.amina, id, { action: "verify", version: 1 });
    expect(verify.status).toBe(409);
    expect(verify.json.error.code).toBe("LOCKED");
  });
});

test.describe("what a pupil and a guardian see", () => {
  let studentId: string;
  const family = async (secret: string, admission = "2026/0001") => ({ cookie: await portalCookie(admission, secret) });
  const seeProgress = async (cookie: string, student = studentId) => api(`/api/v1/portal/students/${student}/progress`, { cookie });

  test.beforeEach(async () => {
    studentId = (await db.programParticipant.findUniqueOrThrow({ where: { id: w.amina } })).studentId!;
  });

  test("a pupil sees their own entries in full; a guardian sees a summary and nothing day by day", async () => {
    await add(w.teacher, w.amina, text(day(-2), range(2, 1, 2, 5), { notes: "Private remark about the lesson" }));
    await add(w.teacher, w.amina, { trackKey: "mistakes", entryDate: day(-2), values: { note: "Confuses the endings" } });
    const pupil = await seeProgress((await family(PUPIL_DOB)).cookie);
    expect(pupil.status, pupil.text).toBe(200);
    const mine = pupil.json.data.programs[0];
    expect(pupil.json.data.actor).toBe("PUPIL");
    expect(mine).toMatchObject({ programId: w.program, detail: "FULL", participantId: w.amina });
    expect(mine.entries.map((e: { trackKey: string }) => e.trackKey).sort()).toEqual(["mistakes", "new"]);
    const guardian = await seeProgress((await family(GUARDIAN_PHONE)).cookie);
    expect(guardian.status).toBe(200);
    const theirs = guardian.json.data.programs[0];
    expect(theirs).toMatchObject({ detail: "SUMMARY", entries: null, profile: null });
    expect(theirs.summary.month.daysRecorded).toBe(1);
    expect(guardian.text).not.toContain("Private remark");
    expect(guardian.text).not.toContain("Confuses the endings");
    expect(guardian.text).not.toContain("guardianPhone");
  });

  test("the program can let a guardian see every verified entry", async () => {
    await add(w.teacher, w.amina, text(day(-2), range(2, 1, 2, 5), { notes: "Steady pace" }));
    expect((await setProgram(w.sa, { progressGuardianDetail: "FULL" })).status).toBe(200);
    const res = await seeProgress((await family(GUARDIAN_PHONE)).cookie);
    expect(res.json.data.programs[0].detail).toBe("FULL");
    expect(res.json.data.programs[0].entries[0].values.notes).toBe("Steady pace");
  });

  test("only what has been verified is shown, and an entry being corrected keeps showing its last verified copy", async () => {
    await setProgram(w.sa, { progressRequireVerification: true });
    const pupil = (await family(PUPIL_DOB)).cookie;
    const draft = (await add(w.teacher, w.amina, text(day(-3)))).json.data.id as string;
    const handedIn = (await add(w.teacher, w.amina, { ...text(day(-2)), submit: true })).json.data.id as string;
    expect((await seeProgress(pupil)).json.data.programs[0].entries).toEqual([]);
    await action(w.supervisor, w.amina, handedIn, { action: "verify", version: 1 });
    const shown = (await seeProgress(pupil)).json.data.programs[0].entries;
    expect(shown.map((e: { id: string }) => e.id)).toEqual([handedIn]);
    expect(shown[0].verifiedAt).not.toBeNull();
    // corrected: still the old verified copy
    await patchEntry(w.teacher, w.amina, handedIn, { values: { range: range(2, 1, 2, 99), rating: 1 }, version: 2 });
    const after = (await seeProgress(pupil)).json.data.programs[0].entries;
    expect(after[0].values).toEqual({ range: range(2, 1, 2, 5), rating: 4 });
    expect(draft).not.toBe(handedIn);
  });

  test("the switches are ceilings: the program, the school and the branch each can close the view, for the pupil and the guardian separately", async () => {
    await add(w.teacher, w.amina, text(day(-2)));
    const pupil = (await family(PUPIL_DOB)).cookie;
    const guardian = (await family(GUARDIAN_PHONE)).cookie;
    const counts = async () => [
      (await seeProgress(pupil)).json.data.programs.length,
      (await seeProgress(guardian)).json.data.programs.length,
    ];
    expect(await counts()).toEqual([1, 1]);
    await setProgram(w.sa, { progressGuardianView: false });
    expect(await counts()).toEqual([1, 0]);
    await setProgram(w.sa, { progressGuardianView: true, progressStudentView: false });
    expect(await counts()).toEqual([0, 1]);
    await setProgram(w.sa, { progressStudentView: true });
    expect(await counts()).toEqual([1, 1]);
    await send("PATCH", "/api/v1/settings/programs-progress-guardian", w.sa, { scope: "GLOBAL", enabled: false });
    expect(await counts()).toEqual([1, 0]);
    await send("PATCH", "/api/v1/settings/programs-progress-guardian", w.sa, { scope: "GLOBAL", enabled: null });
    await send("PATCH", "/api/v1/settings/programs-progress-student", w.sa, { scope: "BRANCH", branchId: w.A.id, enabled: false });
    expect(await counts()).toEqual([0, 1]);
    await send("PATCH", "/api/v1/settings/programs-progress-student", w.sa, { scope: "BRANCH", branchId: w.A.id, enabled: null });
    await send("PATCH", "/api/v1/settings/programs-progress", w.sa, { scope: "GLOBAL", enabled: false });
    expect(await counts()).toEqual([0, 0]);
    await send("PATCH", "/api/v1/settings/programs-progress", w.sa, { scope: "GLOBAL", enabled: null });
    await setProgram(w.sa, { progressEnabled: false });
    expect(await counts()).toEqual([0, 0]);
  });

  test("a pupil sees no one else's record, and a signed-out request sees nothing", async () => {
    await add(w.teacher, w.amina, text(day(-2)));
    const binta = (await family(PUPIL_DOB, "2026/0002")).cookie;
    const other = await seeProgress(binta, studentId);
    expect(other.status).toBe(403);
    expect(other.text).not.toContain("Al-Baqarah");
    expect(
      (await seeProgress(binta, (await db.programParticipant.findUniqueOrThrow({ where: { id: w.binta } })).studentId!)).json.data.programs,
    ).toHaveLength(1);
    expect((await api(`/api/v1/portal/students/${studentId}/progress`, {})).status).toBe(401);
    expect(
      (await api(`/api/v1/portal/students/${studentId}/progress/seen`, { body: { programId: w.program, weekStart: lastWeek() } })).status,
    ).toBe(401);
  });

  test("a person with no verified entries yet sees the program with nothing in it", async () => {
    const pupil = (await family(PUPIL_DOB)).cookie;
    const none = (await seeProgress(pupil)).json.data.programs[0];
    expect(none.summary.month.daysRecorded).toBe(0);
    expect(none.entries).toEqual([]);
  });

  test("'seen' is a record of a week, once for each of the pupil and the guardian, and staff can see it", async () => {
    await add(w.teacher, w.amina, text(weekAfter(lastWeek(), 1)));
    const pupil = (await family(PUPIL_DOB)).cookie;
    const guardian = (await family(GUARDIAN_PHONE)).cookie;
    const seen = (cookie: string, body: object) => api(`/api/v1/portal/students/${studentId}/progress/seen`, { cookie, body });
    const first = await seen(pupil, { programId: w.program, weekStart: weekAfter(lastWeek(), 3) });
    expect(first.status, first.text).toBe(200);
    expect(first.json.data.weekStart).toBe(lastWeek());
    expect((await seen(pupil, { programId: w.program, weekStart: lastWeek() })).status).toBe(200);
    expect((await seen(guardian, { programId: w.program, weekStart: lastWeek() })).status).toBe(200);
    expect(await db.progressSeen.count()).toBe(2);
    expect((await seen(pupil, { programId: w.program, weekStart: weekAfter(weekStartOf(day(0), 6), 14) })).status).toBe(400);
    expect((await seen(pupil, { programId: "nothing", weekStart: lastWeek() })).status).toBe(404);
    expect((await seen(pupil, { programId: w.program, weekStart: "yesterday" })).status).toBe(400);
    expect((await seen(pupil, { programId: w.program, weekStart: lastWeek(), extra: 1 })).status).toBe(400);
    const staff = (await get(rec(w.amina), w.teacher)).json.data.seen as { actor: string; weekStart: string }[];
    expect(staff.map((s) => s.actor).sort()).toEqual(["GUARDIAN", "PUPIL"]);
    expect(staff[0]!.weekStart).toBe(lastWeek());
    await setProgram(w.sa, { progressStudentView: false });
    expect((await seen(pupil, { programId: w.program, weekStart: lastWeek() })).status).toBe(404);
  });
});

test.describe("the database's own checks", () => {
  test("a verified entry must carry the copy families see; the lock and seen tables are bounded; the lock seconds are bounded", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    await expect(db.$executeRaw`UPDATE "ProgressEntry" SET "publishedValues" = NULL WHERE "id" = ${id}`).rejects.toThrow(/verified_check/);
    await expect(db.$executeRaw`UPDATE "ProgressEntry" SET "values" = '[]'::jsonb WHERE "id" = ${id}`).rejects.toThrow(/values_check/);
    await expect(db.$executeRaw`UPDATE "ProgressEntry" SET "returnComment" = repeat('x', 301) WHERE "id" = ${id}`).rejects.toThrow(
      /return_check/,
    );
    const record = await db.progressRecord.findFirstOrThrow();
    await expect(
      db.progressSeen.create({
        data: { programId: w.program, recordId: record.id, actor: "TEACHER", weekStart: new Date(`${lastWeek()}T00:00:00Z`) },
      }),
    ).rejects.toThrow(/actor_check/);
    await expect(db.$executeRaw`UPDATE "Program" SET "progressLockInactivity" = 5 WHERE "id" = ${w.program}`).rejects.toThrow(
      /progressLockInactivity_check/,
    );
    await expect(db.$executeRaw`UPDATE "Program" SET "progressLockRelease" = 301 WHERE "id" = ${w.program}`).rejects.toThrow(
      /progressLockRelease_check/,
    );
    await expect(
      db.progressLock.create({
        data: {
          entryId: id,
          programId: w.program,
          holderUserId: w.teacher.id,
          heartbeatAt: new Date(),
          expiresAt: new Date(Date.now() - 60_000),
        },
      }),
    ).rejects.toThrow(/times_check/);
  });

  test("an entry of another program's record, and a record for a person of another program, are refused by the keys", async () => {
    const id = await made(w.teacher, w.amina, day(-1));
    const created = await post(PROGRAMS, w.sa, { name: "Other", kind: "ONGOING", branchIds: [w.A.id], levelLabels: ["Class"] });
    const otherId = created.json.data.id as string;
    const record = await db.progressRecord.findFirstOrThrow();
    await expect(
      db.progressEntry.create({
        data: {
          programId: otherId,
          recordId: record.id,
          trackKey: "new",
          entryDate: new Date(),
          values: {},
          createdByUserId: w.sa.id,
          lastEditedByUserId: w.sa.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.progressLock.create({
        data: { entryId: id, programId: otherId, holderUserId: w.sa.id, heartbeatAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
      }),
    ).rejects.toThrow();
  });
});
