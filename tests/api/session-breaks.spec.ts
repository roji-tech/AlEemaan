import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A break inside a term or semester (task 0098), over real HTTP: POST /periods/[id]/breaks, PATCH and DELETE /breaks/[id], the breaks in the sessions list, and the rule that moving a term's days
// never leaves a break outside it. Administrators of the term's branch only (another branch's term or break is "not found", like an unknown id); every change is audited; a removed break is archived.

let home: { id: string };
let other: { id: string };
test.beforeAll(async () => {
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const made: string[] = [];
test.afterEach(async () => {
  // Only what this spec made: other specs share the database (breaks go with their term).
  await db.academicPeriod.deleteMany({ where: { sessionId: { in: made } } });
  await db.academicSession.deleteMany({ where: { id: { in: made } } });
  made.length = 0;
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
let n = 0;
const label = () => `2050/${Date.now()}-${++n}`.slice(0, 30);
const day = (value: string | Date | null) => (value instanceof Date ? value.toISOString() : (value ?? "")).slice(0, 10);

const session = async (cookie: string, branchId = home.id) => {
  const res = await api("/api/v1/academics/sessions", {
    method: "POST",
    cookie,
    body: {
      branchId,
      label: label(),
      startDate: "2050-09-01",
      endDate: "2051-07-31",
      periods: [
        { startDate: "2050-09-01", endDate: "2050-12-15" },
        { startDate: "2051-01-10", endDate: "2051-04-05" },
        { startDate: "2051-04-28", endDate: "2051-07-31" },
      ],
    },
  });
  expect(res.status).toBe(201);
  made.push(res.json.data.session.id);
  return res.json.data.session as { id: string; periods: { id: string }[] };
};
const add = (cookie: string | undefined, periodId: string, body: unknown) =>
  api(`/api/v1/academics/periods/${periodId}/breaks`, { method: "POST", cookie, body });
const MID = { label: "Mid-term break", startDate: "2050-10-26", endDate: "2050-10-30" };

test.describe("adding, changing and removing a break", () => {
  test("an administrator adds a break; it is saved with its days, audited, and shown under its term in the sessions list", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const s = await session(cookie);
    const res = await add(cookie, s.periods[0].id, MID);
    expect([res.status, res.json.error]).toEqual([201, null]);
    const brk = res.json.data.break;
    expect([brk.label, day(brk.startDate), day(brk.endDate), brk.branchId, brk.periodId]).toEqual([
      "Mid-term break",
      "2050-10-26",
      "2050-10-30",
      home.id,
      s.periods[0].id,
    ]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ACADEMIC_BREAK_CREATED", targetId: brk.id } });
    expect(audit.actorUserId).toBe(user.id);

    const list = await api(`/api/v1/academics/sessions?branchId=${home.id}`, { cookie });
    const mine = list.json.data.sessions.find((x: { id: string }) => x.id === s.id);
    expect(mine.periods.map((p: { breaks: { label: string }[] }) => p.breaks.map((b) => b.label))).toEqual([["Mid-term break"], [], []]);
    const detail = await api(`/api/v1/academics/sessions/${s.id}`, { cookie });
    expect(detail.json.data.session.periods[0].breaks).toHaveLength(1);
  });

  test("a break outside its term, backwards, with a bad day or name, or overlapping another is a 400 with the reason, and nothing is saved", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const s = await session(cookie);
    expect((await add(cookie, s.periods[0].id, MID)).status).toBe(201);
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ["after the term", { ...MID, startDate: "2050-12-20", endDate: "2050-12-22" }, /must sit inside the 1st Term/],
      ["before the term", { ...MID, startDate: "2050-08-20", endDate: "2050-09-03" }, /must sit inside the 1st Term/],
      ["in another term", { ...MID, startDate: "2051-02-01", endDate: "2051-02-03" }, /must sit inside the 1st Term/],
      ["backwards", { ...MID, startDate: "2050-10-30", endDate: "2050-10-26" }, /cannot be before its first day/],
      ["not a day", { ...MID, startDate: "2050-10-31", endDate: "2050-11-31" }, /Choose the last day/],
      ["no name", { ...MID, label: " " }, /Name the break/],
      ["overlap", { ...MID, label: "Again", startDate: "2050-10-30", endDate: "2050-11-02" }, /overlaps Mid-term break/],
    ];
    for (const [why, body, message] of cases) {
      const res = await add(cookie, s.periods[0].id, body);
      expect([why, res.status, res.json.error.code]).toEqual([why, 400, "VALIDATION"]);
      expect(res.json.error.message, why).toMatch(message);
    }
    expect(await db.academicBreak.count({ where: { periodId: s.periods[0].id } })).toBe(1);
    // unknown fields and a missing body field are refused too
    expect((await add(cookie, s.periods[1].id, { ...MID, periodId: "x" })).status).toBe(400);
    expect((await add(cookie, s.periods[1].id, { label: "x y" })).status).toBe(400);
  });

  test("a break can be changed (the same rules; its own days do not count as an overlap) and removed (archived, never deleted); both are audited with the before", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const s = await session(cookie);
    const id = (await add(cookie, s.periods[0].id, MID)).json.data.break.id;
    const moved = await api(`/api/v1/academics/breaks/${id}`, {
      method: "PATCH",
      cookie,
      body: { label: "Mid-term holiday", startDate: "2050-10-27", endDate: "2050-10-31" },
    });
    expect([moved.status, moved.json.data.break.label, day(moved.json.data.break.startDate)]).toEqual([
      200,
      "Mid-term holiday",
      "2050-10-27",
    ]);
    const bad = await api(`/api/v1/academics/breaks/${id}`, {
      method: "PATCH",
      cookie,
      body: { ...MID, startDate: "2051-02-01", endDate: "2051-02-02" },
    });
    expect([bad.status, bad.json.error.code]).toEqual([400, "VALIDATION"]);
    const updated = await db.auditLog.findFirstOrThrow({ where: { action: "ACADEMIC_BREAK_UPDATED", targetId: id } });
    expect(JSON.stringify(updated.beforeValue)).toContain("2050-10-26");
    expect(JSON.stringify(updated.afterValue)).toContain("2050-10-27");

    const removed = await api(`/api/v1/academics/breaks/${id}`, { method: "DELETE", cookie });
    expect([removed.status, removed.json.data.removed]).toEqual([200, true]);
    const row = await db.academicBreak.findUniqueOrThrow({ where: { id } });
    expect(row.archivedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "ACADEMIC_BREAK_REMOVED", targetId: id } })).toBe(1);
    // gone from the list, and from the API: a second removal, or a change, is "not found"
    const list = await api(`/api/v1/academics/sessions?branchId=${home.id}`, { cookie });
    expect(list.json.data.sessions.find((x: { id: string }) => x.id === s.id).periods[0].breaks).toEqual([]);
    expect((await api(`/api/v1/academics/breaks/${id}`, { method: "DELETE", cookie })).status).toBe(404);
    // and its days are free again
    expect((await add(cookie, s.periods[0].id, MID)).status).toBe(201);
  });
});

test.describe("moving a term's days never leaves a break outside it", () => {
  test("the schedule edit that would is a 400 naming the break and the term; one that keeps it inside is fine", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const s = await session(cookie);
    expect((await add(cookie, s.periods[0].id, MID)).status).toBe(201);
    const full = (await api(`/api/v1/academics/sessions/${s.id}`, { cookie })).json.data.session;
    const body = (end1: string) => ({
      startDate: day(full.startDate),
      endDate: day(full.endDate),
      periods: full.periods.map((p: { id: string; startDate: string; endDate: string }, i: number) => ({
        id: p.id,
        startDate: day(p.startDate),
        endDate: i === 0 ? end1 : day(p.endDate),
      })),
    });
    const refused = await api(`/api/v1/academics/sessions/${s.id}/schedule`, { method: "PUT", cookie, body: body("2050-10-28") });
    expect([refused.status, refused.json.error.code]).toEqual([400, "VALIDATION"]);
    expect(refused.json.error.message).toMatch(/Mid-term break \(2050-10-26 to 2050-10-30\) would fall outside 1st Term/);
    expect(day((await db.academicPeriod.findUniqueOrThrow({ where: { id: s.periods[0].id } })).endDate)).toBe("2050-12-15");
    expect((await api(`/api/v1/academics/sessions/${s.id}/schedule`, { method: "PUT", cookie, body: body("2050-12-10") })).status).toBe(
      200,
    );
  });
});

test.describe("who may", () => {
  test("signed out 401; a teacher 403; an administrator of another branch gets the same 404 as an unknown id; a superadmin may", async () => {
    const admin = await asRole(Role.ADMIN);
    const s = await session(admin.cookie);
    const id = (await add(admin.cookie, s.periods[0].id, MID)).json.data.break.id;
    expect((await add(undefined, s.periods[0].id, MID)).status).toBe(401);
    expect((await api(`/api/v1/academics/breaks/${id}`, { method: "DELETE" })).status).toBe(401);
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await add(teacher.cookie, s.periods[0].id, MID)).status).toBe(403);
    expect((await api(`/api/v1/academics/breaks/${id}`, { method: "DELETE", cookie: teacher.cookie })).status).toBe(403);

    const elsewhere = await asRole(Role.ADMIN, other.id);
    const foreign = await add(elsewhere.cookie, s.periods[0].id, { ...MID, startDate: "2050-11-02", endDate: "2050-11-03" });
    const unknown = await add(elsewhere.cookie, "no-such-term", MID);
    expect([foreign.status, foreign.json.error.code]).toEqual([404, "NOT_FOUND"]);
    expect(unknown.status).toBe(404);
    for (const method of ["PATCH", "DELETE"] as const) {
      const res = await api(`/api/v1/academics/breaks/${id}`, { method, cookie: elsewhere.cookie, body: MID });
      expect([method, res.status]).toEqual([method, 404]);
    }
    expect(await db.academicBreak.count({ where: { periodId: s.periods[0].id, archivedAt: null } })).toBe(1);

    const boss = await asRole(Role.ADMIN, home.id, true);
    expect((await add(boss.cookie, s.periods[1].id, { label: "Half term", startDate: "2051-02-16", endDate: "2051-02-20" })).status).toBe(
      201,
    );
  });
});
