import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Terms or semesters, and the dates of each (task 0097), over real HTTP: a session is made with a kind, a number of periods and their dates, and PUT /sessions/[id]/schedule changes the
// dates of the session and of every period at once. The rules are checked as a whole (inside the session, in order, no overlap), nothing is partly saved, and only an administrator of
// the session's branch may do it (another branch's session is "not found", like an unknown id). Every change is audited.

let home: { id: string };
let other: { id: string };
test.beforeAll(async () => {
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const made: string[] = [];
test.afterEach(async () => {
  // Only what this spec made: other specs share the database.
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
const label = () => `2040/${Date.now()}-${++n}`.slice(0, 30);
const SESSIONS = "/api/v1/academics/sessions";
const day = (value: string | null) => (value ?? "").slice(0, 10);

type PeriodBody = { startDate: string; endDate: string };
const create = async (cookie: string, body: Record<string, unknown>) => {
  const res = await api(SESSIONS, {
    method: "POST",
    cookie,
    body: { branchId: home.id, label: label(), startDate: "2040-09-01", endDate: "2041-07-31", ...body },
  });
  if (res.status === 201) made.push(res.json.data.session.id);
  return res;
};
const THREE: PeriodBody[] = [
  { startDate: "2040-09-01", endDate: "2040-12-15" },
  { startDate: "2041-01-10", endDate: "2041-04-05" },
  { startDate: "2041-04-28", endDate: "2041-07-31" },
];

test.describe("creating a session with a kind and dates", () => {
  test("no kind and no dates: terms shared equally, as before (the first starts with the session, the last ends with it)", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const res = await create(cookie, { termsCount: 3 });
    expect(res.status).toBe(201);
    const periods = res.json.data.session.periods;
    expect(periods.map((p: { label: string; kind: string }) => [p.label, p.kind])).toEqual([
      ["1st Term", "TERM"],
      ["2nd Term", "TERM"],
      ["3rd Term", "TERM"],
    ]);
    expect(day(periods[0].startDate)).toBe("2040-09-01");
    expect(day(periods[2].endDate)).toBe("2041-07-31");
    // each starts after the one before it ends
    expect(day(periods[1].startDate) > day(periods[0].endDate)).toBe(true);
    expect(day(periods[2].startDate) > day(periods[1].endDate)).toBe(true);
  });

  test("terms with the dates the person chose: stored as given, in order, the first one current when the session is active", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const res = await create(cookie, { kind: "TERM", periods: THREE, status: "ACTIVE" });
    expect(res.status).toBe(201);
    const periods = res.json.data.session.periods;
    expect(periods.map((p: { startDate: string; endDate: string }) => [day(p.startDate), day(p.endDate)])).toEqual(
      THREE.map((p) => [p.startDate, p.endDate]),
    );
    expect(periods.map((p: { isCurrent: boolean }) => p.isCurrent)).toEqual([true, false, false]);
  });

  test("semesters: two, named 1st Semester and 2nd Semester, with their own dates", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const res = await create(cookie, {
      kind: "SEMESTER",
      periods: [
        { startDate: "2040-09-01", endDate: "2041-01-20" },
        { startDate: "2041-02-10", endDate: "2041-07-31" },
      ],
    });
    expect(res.status).toBe(201);
    const periods = res.json.data.session.periods;
    expect(periods.map((p: { label: string; kind: string }) => [p.label, p.kind])).toEqual([
      ["1st Semester", "SEMESTER"],
      ["2nd Semester", "SEMESTER"],
    ]);
    expect(day(periods[1].startDate)).toBe("2041-02-10");
  });

  test("semesters without dates are shared equally, and a session of semesters is never three", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const two = await create(cookie, { kind: "SEMESTER", termsCount: 2 });
    expect(two.status).toBe(201);
    expect(two.json.data.session.periods).toHaveLength(2);
    const three = await create(cookie, { kind: "SEMESTER", termsCount: 3 });
    expect([three.status, three.json.error.code]).toEqual([400, "SESSION_CREATE_FAILED"]);
    expect(three.json.error.message).toMatch(/two semesters/i);
  });

  test("dates that overlap, fall outside the session or run backwards are refused with the reason, and nothing is created", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const name = label();
    const cases: [string, PeriodBody[], RegExp][] = [
      [
        "overlap",
        [
          { startDate: "2040-09-01", endDate: "2041-01-31" },
          { startDate: "2041-01-15", endDate: "2041-07-31" },
        ],
        /must start after 1st Term ends/,
      ],
      [
        "outside the session",
        [
          { startDate: "2040-08-01", endDate: "2041-01-31" },
          { startDate: "2041-02-10", endDate: "2041-07-31" },
        ],
        /must sit inside the session/,
      ],
      [
        "backwards",
        [
          { startDate: "2041-01-31", endDate: "2040-09-01" },
          { startDate: "2041-02-10", endDate: "2041-07-31" },
        ],
        /must be after its first day/,
      ],
      [
        "not a day",
        [
          { startDate: "2040-09-31", endDate: "2041-01-31" },
          { startDate: "2041-02-10", endDate: "2041-07-31" },
        ],
        /Choose the first day/,
      ],
    ];
    for (const [why, periods, message] of cases) {
      const res = await create(cookie, { label: name, periods });
      expect([why, res.status, res.json.error.code]).toEqual([why, 400, "SESSION_CREATE_FAILED"]);
      expect(res.json.error.message, why).toMatch(message);
    }
    expect(await db.academicSession.count({ where: { label: name } })).toBe(0);
  });

  test("a number of terms that does not match the dates given, or too many dates, is refused", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const mismatch = await create(cookie, { termsCount: 2, periods: THREE });
    expect([mismatch.status, mismatch.json.error.code]).toEqual([400, "SESSION_CREATE_FAILED"]);
    const tooMany = await create(cookie, {
      periods: Array.from({ length: 5 }, (_, i) => ({ startDate: `2040-1${i}-01`, endDate: `2040-1${i}-20` })),
    });
    expect(tooMany.status).toBe(400);
    const stray = await create(cookie, { periods: [{ startDate: "2040-09-01", endDate: "2041-01-31", label: "Hacked" }] });
    expect(stray.status).toBe(400);
  });
});

test.describe("PUT /sessions/[id]/schedule", () => {
  const schedule = (session: { startDate: string; endDate: string; periods: { id: string }[] }, change: PeriodBody[], more = {}) => ({
    startDate: day(session.startDate),
    endDate: day(session.endDate),
    periods: session.periods.map((p, i) => ({ id: p.id, ...change[i] })),
    ...more,
  });
  const put = (cookie: string | undefined, id: string, body: unknown) => api(`${SESSIONS}/${id}/schedule`, { method: "PUT", cookie, body });

  test("an administrator moves the dates of the session and of every term; the audit entry has the before and after; labels and the current term are untouched", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const created = (await create(cookie, { periods: THREE, status: "ACTIVE" })).json.data.session;
    const res = await put(
      cookie,
      created.id,
      schedule(
        created,
        [
          { startDate: "2040-09-04", endDate: "2040-12-18" },
          { startDate: "2041-01-13", endDate: "2041-04-08" },
          { startDate: "2041-05-05", endDate: "2041-07-25" },
        ],
        { endDate: "2041-07-25" },
      ),
    );
    expect([res.status, res.json.error]).toEqual([200, null]);
    const saved = await db.academicSession.findUniqueOrThrow({
      where: { id: created.id },
      include: { periods: { orderBy: { ordinal: "asc" } } },
    });
    expect(day(saved.endDate.toISOString())).toBe("2041-07-25");
    expect(saved.periods.map((p) => [p.label, p.isCurrent, day(p.startDate.toISOString()), day(p.endDate?.toISOString() ?? null)])).toEqual(
      [
        ["1st Term", true, "2040-09-04", "2040-12-18"],
        ["2nd Term", false, "2041-01-13", "2041-04-08"],
        ["3rd Term", false, "2041-05-05", "2041-07-25"],
      ],
    );
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ACADEMIC_SESSION_SCHEDULE_UPDATED", targetId: created.id } });
    expect(audit.actorUserId).toBe(user.id);
    expect(JSON.stringify(audit.beforeValue)).toContain("2040-12-15");
    expect(JSON.stringify(audit.afterValue)).toContain("2040-12-18");
  });

  test("a schedule that overlaps, leaves the session, or runs backwards is a 400 with the reason, and nothing is changed", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const created = (await create(cookie, { periods: THREE })).json.data.session;
    const before = await db.academicPeriod.findMany({ where: { sessionId: created.id }, orderBy: { ordinal: "asc" } });
    const bad: [PeriodBody[], RegExp, Record<string, unknown>?][] = [
      [[THREE[0], { startDate: "2040-12-10", endDate: "2041-04-05" }, THREE[2]], /must start after 1st Term ends/],
      [[THREE[0], THREE[1], { startDate: "2041-04-28", endDate: "2041-08-30" }], /must sit inside the session/],
      [[{ startDate: "2040-12-15", endDate: "2040-09-01" }, THREE[1], THREE[2]], /must be after its first day/],
      [THREE, /last day of the session must be after/, { startDate: "2041-08-01", endDate: "2041-07-31" }],
    ];
    for (const [periods, message, session] of bad) {
      const res = await put(cookie, created.id, schedule(created, periods, session));
      expect([res.status, res.json.error.code]).toEqual([400, "VALIDATION"]);
      expect(res.json.error.message).toMatch(message);
    }
    const after = await db.academicPeriod.findMany({ where: { sessionId: created.id }, orderBy: { ordinal: "asc" } });
    expect(after.map((p) => [p.startDate.getTime(), p.endDate?.getTime()])).toEqual(
      before.map((p) => [p.startDate.getTime(), p.endDate?.getTime()]),
    );
    expect(await db.auditLog.count({ where: { action: "ACADEMIC_SESSION_SCHEDULE_UPDATED", targetId: created.id } })).toBe(0);
  });

  test("every term must be named once: a missing one, a repeated one, or one of another session is a 400, and unknown fields are refused", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const mine = (await create(cookie, { periods: THREE })).json.data.session;
    const theirs = (await create(cookie, { periods: THREE })).json.data.session;
    const full = schedule(mine, THREE);
    const missing = await put(cookie, mine.id, { ...full, periods: full.periods.slice(0, 2) });
    const repeated = await put(cookie, mine.id, { ...full, periods: [full.periods[0], full.periods[0], full.periods[2]] });
    const foreign = await put(cookie, mine.id, {
      ...full,
      periods: [full.periods[0], full.periods[1], { ...full.periods[2], id: theirs.periods[2].id }],
    });
    for (const res of [missing, repeated, foreign]) expect([res.status, res.json.error.code]).toEqual([400, "VALIDATION"]);
    expect((await put(cookie, mine.id, { ...full, label: "Hijack" })).status).toBe(400);
    expect(
      (await put(cookie, mine.id, { ...full, periods: [{ ...full.periods[0], isCurrent: true }, full.periods[1], full.periods[2]] }))
        .status,
    ).toBe(400);
    // the other session's term was not touched
    const untouched = await db.academicPeriod.findUniqueOrThrow({ where: { id: theirs.periods[2].id } });
    expect(day(untouched.startDate.toISOString())).toBe("2041-04-28");
  });

  test("who may: signed out 401; a teacher 403; an administrator of another branch gets the same 404 as an unknown id; a superadmin may", async () => {
    const admin = await asRole(Role.ADMIN);
    const created = (await create(admin.cookie, { periods: THREE })).json.data.session;
    const body = schedule(created, THREE);
    expect((await put(undefined, created.id, body)).status).toBe(401);
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await put(teacher.cookie, created.id, body)).status).toBe(403);
    const elsewhere = await asRole(Role.ADMIN, other.id);
    const foreign = await put(elsewhere.cookie, created.id, body);
    const unknown = await put(elsewhere.cookie, "no-such-session", body);
    expect([foreign.status, foreign.json.error.code]).toEqual([404, "NOT_FOUND"]);
    expect(unknown.status).toBe(404);
    const boss = await asRole(Role.ADMIN, home.id, true);
    expect((await put(boss.cookie, created.id, body)).status).toBe(200);
  });
});
