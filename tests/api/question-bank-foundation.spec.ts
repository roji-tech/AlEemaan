import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { BANK_SETTING_KEYS, effectiveBankSettings, parseBankSetting } from "@/lib/question-bank/settings";

// Question bank foundation (Task 0032 slice 1): the settings and reviewers routes. For each: who may call (anonymous, student, teacher, a branch administrator of that
// branch, an administrator of ANOTHER branch, a superadmin), the rule that a branch may only narrow, the audit row every change leaves, and hostile input that must
// never be a 500 or leave a bad row behind.

const SETTINGS = "/api/v1/question-bank/settings";
const REVIEWERS = "/api/v1/question-bank/reviewers";

let home: { id: string };
let other: { id: string };
let superAdmin: TestUser;
let branchAdmin: TestUser; // ADMIN of `home` only
let otherAdmin: TestUser; // ADMIN of `other` only
let teacher: TestUser; // TEACHING_STAFF of `home`
let student: TestUser; // STUDENT of `home`
let ck: Record<"super" | "admin" | "otherAdmin" | "teacher" | "student", string> = {
  super: "",
  admin: "",
  otherAdmin: "",
  teacher: "",
  student: "",
};

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  superAdmin = await createUser({ role: Role.ADMIN }); // a superadmin by default, and ADMIN of `home`
  branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
  teacher = await createUser({ role: Role.TEACHING_STAFF });
  student = await createUser({ role: Role.STUDENT });
  otherAdmin = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: otherAdmin.id, branchId: other.id, role: Role.ADMIN } });
  ck = {
    super: await cookieFor(superAdmin),
    admin: await cookieFor(branchAdmin),
    otherAdmin: await cookieFor(otherAdmin),
    teacher: await cookieFor(teacher),
    student: await cookieFor(student),
  };
});

test.beforeEach(async () => {
  await db.settingValue.deleteMany({ where: { key: { startsWith: "bank." } } });
  await db.$executeRawUnsafe(`TRUNCATE "QuestionBankAudit", "QuestionBankReviewer" RESTART IDENTITY CASCADE`);
});

const getSettings = (cookie?: string, query = "") => api(`${SETTINGS}${query}`, { cookie });
const putSettings = (cookie: string | undefined, body: unknown) => api(SETTINGS, { method: "PUT", cookie, body });
const setting = (res: { json: { data: { settings: Array<{ key: string }> } } }, key: string) =>
  res.json.data.settings.find((s) => s.key === key) as {
    key: string;
    default: unknown;
    school: unknown;
    override: unknown;
    effective: unknown;
  };
const audits = () => db.questionBankAudit.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

test.describe("settings: who may read", () => {
  test("anonymous 401; student and teacher 403; a branch administrator reads their own branch; another branch's administrator gets a 404", async () => {
    expect((await getSettings(undefined, `?branchId=${home.id}`)).status).toBe(401);
    expect((await getSettings(ck.student, `?branchId=${home.id}`)).status).toBe(403);
    expect((await getSettings(ck.teacher, `?branchId=${home.id}`)).status).toBe(403);
    const own = await getSettings(ck.admin, `?branchId=${home.id}`);
    expect(own.status).toBe(200);
    expect(own.json.data.scope).toBe("BRANCH");
    expect(own.json.data.settings).toHaveLength(BANK_SETTING_KEYS.length);
    const elsewhere = await getSettings(ck.otherAdmin, `?branchId=${home.id}`);
    const unknown = await getSettings(ck.otherAdmin, `?branchId=no-such-branch`);
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.json).toEqual(unknown.json); // the same answer as for a branch that does not exist
  });

  test("with no branch named: a superadmin gets the school-wide values, everyone else a 400; an unknown branch is a 404 even for a superadmin", async () => {
    const school = await getSettings(ck.super);
    expect(school.status).toBe(200);
    expect(school.json.data.scope).toBe("GLOBAL");
    expect(school.json.data.branchId).toBeNull();
    expect((await getSettings(ck.admin)).status).toBe(400);
    expect((await getSettings(ck.super, "?branchId=no-such-branch")).status).toBe(404);
  });

  test("the view carries the default, the school value, the branch's own value and the effective one", async () => {
    await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.practice.maxQuestions": 60, "bank.practice.presets": [10, 20, 50] } });
    await putSettings(ck.admin, { scope: "BRANCH", branchId: home.id, changes: { "bank.practice.maxQuestions": 40 } });
    const view = await getSettings(ck.admin, `?branchId=${home.id}`);
    const max = setting(view, "bank.practice.maxQuestions");
    expect(max).toMatchObject({ default: 100, school: 60, override: 40, effective: 40 });
    expect(setting(view, "bank.practice.presets")).toMatchObject({ school: [10, 20, 50], override: null, effective: [10, 20] });
    // another branch sees the school's value and none of home's override
    const away = setting(await getSettings(ck.otherAdmin, `?branchId=${other.id}`), "bank.practice.maxQuestions");
    expect(away).toMatchObject({ school: 60, override: null, effective: 60 });
  });
});

test.describe("settings: who may change", () => {
  const change = { scope: "GLOBAL", changes: { "bank.reports.pupils": false } };

  test("anonymous 401, student and teacher 403, a branch administrator 403 on the school-wide values, a superadmin 200", async () => {
    expect((await putSettings(undefined, change)).status).toBe(401);
    expect((await putSettings(ck.student, change)).status).toBe(403);
    expect((await putSettings(ck.teacher, change)).status).toBe(403);
    const admin = await putSettings(ck.admin, change);
    expect(admin.status).toBe(403);
    expect(admin.json.error.code).toBe("FORBIDDEN");
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
    expect((await putSettings(ck.super, change)).status).toBe(200);
  });

  test("a change is refused without the same-origin header, and a malformed or oversized body is a clean 400 or 413", async () => {
    expect((await api(SETTINGS, { method: "PUT", cookie: ck.super, body: change, origin: "https://evil.example" })).status).toBe(403);
    expect((await api(SETTINGS, { method: "PUT", cookie: ck.super, rawBody: "{not json" })).status).toBe(400);
    expect((await api(SETTINGS, { method: "PUT", cookie: ck.super, rawBody: "[]" })).status).toBe(400);
    expect((await api(SETTINGS, { method: "PUT", cookie: ck.super, rawBody: "null" })).status).toBe(400);
    expect(
      (
        await api(SETTINGS, {
          method: "PUT",
          cookie: ck.super,
          rawBody: JSON.stringify({ scope: "GLOBAL", changes: {}, pad: "x".repeat(2_000_000) }),
        })
      ).status,
    ).toBe(413);
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
  });

  test("a branch administrator changes their own branch; naming another branch is a 403 and writes nothing; a superadmin may change any", async () => {
    const mine = await putSettings(ck.admin, { scope: "BRANCH", branchId: home.id, changes: { "bank.access.pupils": false } });
    expect(mine.status).toBe(200);
    expect(mine.json.data.changed).toEqual(["bank.access.pupils"]);
    const away = await putSettings(ck.admin, { scope: "BRANCH", branchId: other.id, changes: { "bank.access.pupils": false } });
    expect(away.status).toBe(403);
    expect(away.json.error.code).toBe("FORBIDDEN");
    expect(await db.settingValue.count({ where: { branchId: other.id } })).toBe(0);
    const also = await putSettings(ck.otherAdmin, { scope: "BRANCH", branchId: home.id, changes: { "bank.access.pupils": false } });
    expect(also.status).toBe(403);
    expect((await putSettings(ck.super, { scope: "BRANCH", branchId: other.id, changes: { "bank.access.pupils": false } })).status).toBe(
      200,
    );
  });
});

test.describe("settings: a branch may only narrow", () => {
  test("a school-wide off cannot be widened, a limit cannot be loosened; a stricter or equal value is fine; clearing is always allowed", async () => {
    expect(
      (
        await putSettings(ck.super, {
          scope: "GLOBAL",
          changes: {
            "bank.access.staff": false,
            "bank.practice.maxQuestions": 60,
            "bank.practice.presets": [10, 20, 50],
            "bank.smallSummary.min": 8,
          },
        })
      ).status,
    ).toBe(200);
    const branch = (changes: object) => putSettings(ck.admin, { scope: "BRANCH", branchId: home.id, changes });

    const widen = await branch({ "bank.access.staff": true });
    expect(widen.status).toBe(400);
    expect(widen.json.error.details[0].path).toBe("changes.bank.access.staff");
    expect((await branch({ "bank.practice.maxQuestions": 61 })).status).toBe(400); // higher is looser
    expect((await branch({ "bank.smallSummary.min": 7 })).status).toBe(400); // lower is looser
    expect((await branch({ "bank.practice.presets": [20, 30] })).status).toBe(400); // 30 is not one of the school's sizes
    expect(await db.settingValue.count({ where: { branchId: home.id } })).toBe(0);

    expect((await branch({ "bank.practice.maxQuestions": 60, "bank.smallSummary.min": 8 })).status).toBe(200); // equal is not wider
    expect(
      (await branch({ "bank.practice.maxQuestions": 30, "bank.smallSummary.min": 12, "bank.practice.presets": [20, 50] })).status,
    ).toBe(200);
    const view = await getSettings(ck.admin, `?branchId=${home.id}`);
    expect(setting(view, "bank.practice.maxQuestions").effective).toBe(30);
    expect(setting(view, "bank.practice.presets").effective).toEqual([20]); // 50 no longer fits inside 30
    expect(setting(view, "bank.access.staff").effective).toBe(false);

    const cleared = await branch({ "bank.practice.maxQuestions": null });
    expect(cleared.status).toBe(200);
    expect(setting(await getSettings(ck.admin, `?branchId=${home.id}`), "bank.practice.maxQuestions")).toMatchObject({
      override: null,
      effective: 60,
    });
  });

  test("a widening row that got into the database anyway (a hand edit) is ignored by what applies", async () => {
    await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.access.pupils": false } });
    await db.settingValue.create({ data: { scope: "BRANCH", branchId: home.id, key: "bank.access.pupils", value: true } });
    await db.settingValue.create({ data: { scope: "BRANCH", branchId: home.id, key: "bank.practice.maxQuestions", value: "plenty" } });
    const view = await getSettings(ck.admin, `?branchId=${home.id}`);
    expect(setting(view, "bank.access.pupils").effective).toBe(false);
    expect(setting(view, "bank.practice.maxQuestions")).toMatchObject({ override: null, effective: 100 });
  });

  test("a branch can narrow one number alone: the dependent numbers are made to fit, no second request needed", async () => {
    const res = await putSettings(ck.admin, { scope: "BRANCH", branchId: home.id, changes: { "bank.practice.maxQuestions": 15 } });
    expect(res.status).toBe(200);
    const view = await getSettings(ck.admin, `?branchId=${home.id}`);
    expect(setting(view, "bank.practice.defaultQuestions").effective).toBe(15);
    expect(setting(view, "bank.practice.presets").effective).toEqual([10]);
  });
});

test.describe("settings: the school-wide values agree with each other", () => {
  test("a change that leaves the default size or a preset above the maximum, or the cap below it, is refused and writes nothing", async () => {
    const tooBig = await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.practice.maxQuestions": 30 } }); // the default presets reach 100
    expect(tooBig.status).toBe(400);
    expect(tooBig.json.error.message).toMatch(/preset/i);
    expect((await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.practice.defaultQuestions": 150 } })).status).toBe(400);
    expect((await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.practice.dailyCap": 50 } })).status).toBe(400);
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
    expect(await db.questionBankAudit.count()).toBe(0);
    // together, it is fine
    expect(
      (
        await putSettings(ck.super, {
          scope: "GLOBAL",
          changes: { "bank.practice.maxQuestions": 30, "bank.practice.presets": [10, 20, 30] },
        })
      ).status,
    ).toBe(200);
  });

  test("one bad value in a request means NOTHING in that request is applied", async () => {
    const res = await putSettings(ck.super, {
      scope: "GLOBAL",
      changes: { "bank.reports.pupils": false, "bank.practice.maxQuestions": "lots" },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.details.map((d: { path: string }) => d.path)).toEqual(["changes.bank.practice.maxQuestions"]);
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
  });
});

test.describe("settings: every change leaves an audit row", () => {
  test("set, change, clear: who, what, old and new value, the reason; a repeat of the same value changes and records nothing", async () => {
    const set = await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.images.max": 4 }, reason: "Diagrams need a fourth image" });
    expect(set.json.data.changed).toEqual(["bank.images.max"]);
    await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.images.max": 3 } });
    const repeat = await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.images.max": 3 } });
    expect(repeat.status).toBe(200);
    expect(repeat.json.data.changed).toEqual([]);
    await putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.images.max": null } });
    const rows = await audits();
    expect(rows.map((r) => [r.action, r.oldValue, r.newValue])).toEqual([
      ["SET", null, 4],
      ["CHANGED", 4, 3],
      ["CLEARED", 3, null],
    ]);
    for (const row of rows)
      expect(row).toMatchObject({ entity: "SETTING", ref: "bank.images.max", branchId: null, actorUserId: superAdmin.id });
    expect(rows[0].reason).toBe("Diagrams need a fourth image");
  });

  test("a branch change is recorded against that branch and that person", async () => {
    await putSettings(ck.admin, { scope: "BRANCH", branchId: home.id, changes: { "bank.reports.teachers": false } });
    const [row] = await audits();
    expect(row).toMatchObject({
      entity: "SETTING",
      action: "SET",
      ref: "bank.reports.teachers",
      branchId: home.id,
      actorUserId: branchAdmin.id,
      newValue: false,
    });
  });
});

test.describe("settings: hostile input is a clean refusal, never a 500", () => {
  test("branch ids that cannot be ids (NUL byte, control characters, 5 KB, SQL, path tricks) are refused for everyone", async () => {
    const junk = [
      "%00",
      "a%00b",
      "x".repeat(65),
      "x".repeat(5000),
      "'--",
      "%27%20OR%201%3D1",
      "..%2F..%2Fx",
      "%F0%9F%98%80",
      "%20",
      "%ff",
      "a%0Ab",
      "%5C",
    ];
    for (const raw of junk) {
      for (const cookie of [ck.super, ck.admin]) {
        const res = await getSettings(cookie, `?branchId=${raw}`);
        expect([400, 404], `${cookie === ck.super ? "super" : "admin"} ?branchId=${raw.slice(0, 20)} -> ${res.status}`).toContain(
          res.status,
        );
      }
    }
    for (const raw of ["\u0000", "a\u0000b", "x".repeat(65), "'--", "../x", "😀", "\ud800", " "]) {
      const res = await putSettings(ck.super, { scope: "BRANCH", branchId: raw, changes: { "bank.access.pupils": false } });
      expect([400, 403], `PUT branchId ${JSON.stringify(raw).slice(0, 20)} -> ${res.status}`).toContain(res.status);
    }
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
  });

  test("unknown keys (including prototype names), wrong types, bounds, and a setting the caller has no right to are 400 with the field named", async () => {
    const bad: Array<[string, unknown]> = [
      ["bank.nope", 1],
      ["__proto__", { polluted: true }],
      ["constructor", 1],
      ["bank.__proto__", 1],
      ["bank.practice.maxQuestions", "60"],
      ["bank.practice.maxQuestions", 60.5],
      ["bank.practice.maxQuestions", 0],
      ["bank.practice.maxQuestions", 501],
      ["bank.practice.maxQuestions", 1e308],
      ["bank.practice.maxQuestions", { $gt: 1 }],
      ["bank.practice.maxQuestions", [60]],
      ["bank.access.pupils", "false"],
      ["bank.access.pupils", 0],
      ["bank.images.max", 5],
      ["bank.practice.presets", [20, 10]],
      ["bank.practice.presets", []],
      ["bank.practice.presets", "10,20"],
    ];
    for (const [key, value] of bad) {
      const body = JSON.parse(`{"scope":"GLOBAL","changes":{${JSON.stringify(key)}:${JSON.stringify(value)}}}`);
      const res = await putSettings(ck.super, body);
      expect([res.status, key, JSON.stringify(value)]).toEqual([400, key, JSON.stringify(value)]);
      expect(res.json.error.code).toBe("VALIDATION");
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
  });

  test("shape problems: empty changes, too many, extra fields, a bad scope, a long reason, GLOBAL naming a branch, BRANCH naming none", async () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`bank.k${i}`, 1]));
    for (const body of [
      { scope: "GLOBAL", changes: {} },
      { scope: "GLOBAL", changes: many },
      { scope: "GLOBAL", changes: { "bank.reports.pupils": false }, extra: 1 },
      { scope: "SIDEWAYS", changes: { "bank.reports.pupils": false } },
      { scope: "GLOBAL", changes: { "bank.reports.pupils": false }, reason: "x".repeat(501) },
      { scope: "GLOBAL", changes: { "bank.reports.pupils": false }, branchId: home.id },
      { scope: "BRANCH", changes: { "bank.reports.pupils": false } },
      { changes: { "bank.reports.pupils": false } },
      { scope: "GLOBAL" },
    ]) {
      expect((await putSettings(ck.super, body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
  });

  test("seeded random bodies, 150 requests: never a 500, and every stored row is valid and every effective value consistent", async () => {
    let seed = 99;
    const next = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const junk: unknown[] = [
      true,
      false,
      0,
      1,
      3,
      4,
      5,
      10,
      20,
      100,
      500,
      1e9,
      -1,
      0.5,
      "x",
      "",
      "5",
      null,
      [],
      [10],
      [10, 20],
      [20, 10],
      [0],
      {},
      { a: 1 },
      [[1]],
      "\u0000",
      "😀",
    ];
    const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
    const statuses: number[] = [];
    for (let i = 0; i < 150; i++) {
      const changes: Record<string, unknown> = {};
      for (let j = 0; j < 1 + Math.floor(next() * 4); j++)
        changes[next() < 0.1 ? pick(["bank.nope", "x", "__proto__"]) : pick(BANK_SETTING_KEYS)] = pick(junk);
      const branch = next() < 0.5;
      const res = await putSettings(next() < 0.7 ? ck.super : ck.admin, {
        scope: branch ? "BRANCH" : "GLOBAL",
        ...(branch ? { branchId: next() < 0.9 ? home.id : pick(["", "\u0000", other.id]) } : {}),
        changes,
      });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
    expect(statuses.some((s) => s === 200)).toBe(true);
    const rows = await db.settingValue.findMany({ where: { key: { startsWith: "bank." } } });
    for (const row of rows)
      expect(parseBankSetting(row.key as never, row.value).ok, `${row.scope} ${row.key} ${JSON.stringify(row.value)}`).toBe(true);
    const grouped = new Set(rows.filter((r) => r.scope === "GLOBAL").map((r) => r.key));
    expect(grouped.size).toBe(rows.filter((r) => r.scope === "GLOBAL").length); // no key stored twice school-wide
    const global = Object.fromEntries(rows.filter((r) => r.scope === "GLOBAL").map((r) => [r.key, r.value]));
    const branchRows = Object.fromEntries(rows.filter((r) => r.scope === "BRANCH" && r.branchId === home.id).map((r) => [r.key, r.value]));
    const s = effectiveBankSettings(global, branchRows);
    expect(s["bank.practice.defaultQuestions"]).toBeLessThanOrEqual(s["bank.practice.maxQuestions"]);
    expect(Math.max(...s["bank.practice.presets"])).toBeLessThanOrEqual(
      Math.min(s["bank.practice.maxQuestions"], s["bank.practice.dailyCap"]),
    );
  });

  test("two changes at once cannot store a school-wide key twice", async () => {
    const results = await Promise.all([
      putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.reports.pupils": false } }),
      putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.reports.pupils": true } }),
      putSettings(ck.super, { scope: "GLOBAL", changes: { "bank.reports.pupils": false } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.settingValue.count({ where: { scope: "GLOBAL", key: "bank.reports.pupils" } })).toBe(1);
  });
});

test.describe("reviewers", () => {
  let colleague: TestUser; // TEACHING_STAFF of home
  let visitor: TestUser; // TEACHING_STAFF of `other` only
  test.beforeAll(async () => {
    colleague = await createUser({ role: Role.TEACHING_STAFF });
    visitor = await createUser({ superAdmin: false });
    await db.membership.create({ data: { userId: visitor.id, branchId: other.id, role: Role.TEACHING_STAFF } });
  });
  const add = (cookie: string | undefined, body: unknown) => api(REVIEWERS, { method: "POST", cookie, body });
  const general = (userId: string, over: Record<string, unknown> = {}) => ({ branchId: home.id, userId, scope: "GENERAL", ...over });

  test("who may list: anonymous 401, student and teacher 403, a branch administrator their branch (with the every-branch rows marked inherited), another branch's administrator 404", async () => {
    await add(ck.super, general(colleague.id, { branchId: null }));
    await add(ck.admin, general(teacher.id));
    expect((await api(`${REVIEWERS}?branchId=${home.id}`)).status).toBe(401);
    expect((await api(`${REVIEWERS}?branchId=${home.id}`, { cookie: ck.student })).status).toBe(403);
    expect((await api(`${REVIEWERS}?branchId=${home.id}`, { cookie: ck.teacher })).status).toBe(403);
    expect((await api(`${REVIEWERS}?branchId=${home.id}`, { cookie: ck.otherAdmin })).status).toBe(404);
    const own = await api(`${REVIEWERS}?branchId=${home.id}`, { cookie: ck.admin });
    expect(own.status).toBe(200);
    expect(own.json.data.reviewers).toHaveLength(2);
    expect(own.json.data.reviewers.map((r: { inherited: boolean }) => r.inherited).sort()).toEqual([false, true]);
    expect(JSON.stringify(own.json)).not.toMatch(/passwordHash/i);
    expect((await api(REVIEWERS, { cookie: ck.admin })).status).toBe(400);
    expect((await api(REVIEWERS, { cookie: ck.super })).json.data.reviewers).toHaveLength(2);
    // the other branch's administrator sees the every-branch row, not home's own
    expect((await api(`${REVIEWERS}?branchId=${other.id}`, { cookie: ck.otherAdmin })).json.data.reviewers).toHaveLength(1);
  });

  test("a branch administrator assigns active staff of their own branch; it is audited; a repeat is a 409", async () => {
    const res = await add(ck.admin, general(teacher.id, { isExamApprover: true }));
    expect(res.status).toBe(201);
    expect(res.json.data.reviewer).toMatchObject({
      userId: teacher.id,
      branchId: home.id,
      scope: "GENERAL",
      subjectLabel: null,
      isExamApprover: true,
      inherited: false,
    });
    const dup = await add(ck.admin, general(teacher.id));
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("CONFLICT");
    const [row] = await audits();
    expect(row).toMatchObject({
      entity: "REVIEWER",
      action: "ASSIGNED",
      ref: res.json.data.reviewer.id,
      branchId: home.id,
      actorUserId: branchAdmin.id,
    });
    expect(await audits()).toHaveLength(1);
  });

  test("a subject reviewer keeps the subject as typed and a normalised key; the same subject typed another way is the same reviewer", async () => {
    const res = await add(ck.admin, general(teacher.id, { scope: "SUBJECT", subjectLabel: "  Mathematics  " }));
    expect(res.status).toBe(201);
    expect(res.json.data.reviewer.subjectLabel).toBe("Mathematics");
    expect((await db.questionBankReviewer.findFirstOrThrow({ where: { userId: teacher.id } })).subjectKey).toBe("mathematics");
    expect((await add(ck.admin, general(teacher.id, { scope: "SUBJECT", subjectLabel: "MATHEMATICS" }))).status).toBe(409);
    expect((await add(ck.admin, general(teacher.id, { scope: "SUBJECT", subjectLabel: "Further Maths" }))).status).toBe(201);
    expect((await add(ck.admin, general(teacher.id, { scope: "SUBJECT", subjectLabel: "الرياضيات" }))).status).toBe(201);
  });

  test("a subject needs letters or digits and no hidden characters; a general reviewer names none", async () => {
    for (const body of [
      general(teacher.id, { scope: "SUBJECT" }),
      general(teacher.id, { scope: "SUBJECT", subjectLabel: "" }),
      general(teacher.id, { scope: "SUBJECT", subjectLabel: "---" }),
      general(teacher.id, { scope: "SUBJECT", subjectLabel: "Maths\u0000" }),
      general(teacher.id, { scope: "SUBJECT", subjectLabel: "Ma\u200bths" }),
      general(teacher.id, { scope: "SUBJECT", subjectLabel: "Maths\ud800" }),
      general(teacher.id, { scope: "SUBJECT", subjectLabel: "x".repeat(81) }),
      general(teacher.id, { scope: "GENERAL", subjectLabel: "Maths" }),
    ]) {
      const res = await add(ck.admin, body);
      expect([res.status, JSON.stringify(body).slice(60, 110)]).toEqual([400, JSON.stringify(body).slice(60, 110)]);
    }
    expect(await db.questionBankReviewer.count()).toBe(0);
  });

  test("only ACTIVE STAFF of that branch can be a reviewer: not a pupil, not someone deactivated, not staff of another branch, not a stranger", async () => {
    const gone = await createUser({ role: Role.TEACHING_STAFF });
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    for (const userId of [student.id, gone.id, visitor.id, "no-such-user"]) {
      const res = await add(ck.admin, general(userId));
      expect([res.status, userId]).toEqual([400, userId]);
    }
    expect((await add(ck.admin, general(branchAdmin.id))).status).toBe(201); // an administrator is staff too
    expect(await db.questionBankReviewer.count()).toBe(1);
  });

  test("every-branch reviewers: only a superadmin assigns one, and the person must be active staff somewhere", async () => {
    const refused = await add(ck.admin, general(teacher.id, { branchId: null }));
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("FORBIDDEN");
    expect((await add(ck.super, general(student.id, { branchId: null }))).status).toBe(400);
    expect((await add(ck.super, general(visitor.id, { branchId: null }))).status).toBe(201); // staff of another branch counts for "any branch"
    expect(await db.questionBankReviewer.count()).toBe(1);
  });

  test("a branch administrator cannot assign for another branch (403, nothing written); a superadmin can; the branch must be named explicitly", async () => {
    const away = await add(ck.admin, general(visitor.id, { branchId: other.id }));
    expect(away.status).toBe(403);
    expect(away.json.error.code).toBe("FORBIDDEN");
    expect((await add(ck.otherAdmin, general(teacher.id))).status).toBe(403);
    expect(await db.questionBankReviewer.count()).toBe(0);
    expect((await add(ck.super, general(visitor.id, { branchId: other.id }))).status).toBe(201);
    const withoutBranch: Record<string, unknown> = { ...general(teacher.id) };
    delete withoutBranch.branchId;
    expect((await add(ck.admin, withoutBranch)).status).toBe(400);
  });

  test("who may assign: anonymous 401, student and teacher 403", async () => {
    expect((await add(undefined, general(teacher.id))).status).toBe(401);
    expect((await add(ck.student, general(teacher.id))).status).toBe(403);
    expect((await add(ck.teacher, general(teacher.id))).status).toBe(403);
    expect(
      (await api(REVIEWERS, { method: "POST", cookie: ck.admin, body: general(teacher.id), origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(await db.questionBankReviewer.count()).toBe(0);
  });

  test("hostile input: bad ids, extra fields, wrong types; never a 500, never a row", async () => {
    const hostile: unknown[] = [
      general("\u0000"),
      general("a\u0000b"),
      general("x".repeat(65)),
      general('\'; DROP TABLE "User";--'),
      general(teacher.id, { branchId: "\u0000" }),
      general(teacher.id, { branchId: 5 }),
      general(teacher.id, { scope: "ADMIN" }),
      general(teacher.id, { isExamApprover: "yes" }),
      general(teacher.id, { isAdmin: true }),
      { ...general(teacher.id), userId: { $ne: null } },
      { ...general(teacher.id), userId: [teacher.id] },
      [],
      null,
      "text",
    ];
    for (const body of hostile) {
      const res = await api(REVIEWERS, { method: "POST", cookie: ck.super, rawBody: JSON.stringify(body) });
      expect([400, 403], `${JSON.stringify(body)?.slice(0, 70)} -> ${res.status}`).toContain(res.status);
    }
    expect(await db.questionBankReviewer.count()).toBe(0);
    expect(await db.user.count({ where: { id: teacher.id } })).toBe(1);
  });

  test("two identical assignments at once: one 201, one 409, one row, one audit row", async () => {
    const results = await Promise.all([
      add(ck.admin, general(teacher.id)),
      add(ck.admin, general(teacher.id)),
      add(ck.admin, general(teacher.id)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await db.questionBankReviewer.count()).toBe(1);
    expect(await audits()).toHaveLength(1);
  });

  test("removing: own branch's row works once and is audited; another branch's row and an every-branch row are the same 404 as an unknown id", async () => {
    const mine = (await add(ck.admin, general(teacher.id))).json.data.reviewer.id as string;
    const everywhere = (await add(ck.super, general(colleague.id, { branchId: null }))).json.data.reviewer.id as string;
    const theirs = (await add(ck.super, general(visitor.id, { branchId: other.id }))).json.data.reviewer.id as string;
    const remove = (cookie: string | undefined, id: string) => api(`${REVIEWERS}/${id}`, { method: "DELETE", cookie });

    expect((await remove(undefined, mine)).status).toBe(401);
    expect((await remove(ck.student, mine)).status).toBe(403);
    expect((await remove(ck.teacher, mine)).status).toBe(403);
    const unknown = await remove(ck.admin, "no-such-row");
    for (const id of [theirs, everywhere]) {
      const res = await remove(ck.admin, id);
      expect(res.status).toBe(404);
      expect(res.json).toEqual(unknown.json);
    }
    expect((await remove(ck.otherAdmin, mine)).status).toBe(404);
    expect(await db.questionBankReviewer.count()).toBe(3);

    expect((await remove(ck.admin, mine)).status).toBe(200);
    expect((await remove(ck.admin, mine)).status).toBe(404);
    expect((await remove(ck.super, everywhere)).status).toBe(200);
    expect((await remove(ck.super, theirs)).status).toBe(200);
    expect(await db.questionBankReviewer.count()).toBe(0);
    const removed = (await audits()).filter((a) => a.action === "REMOVED");
    expect(removed.map((a) => a.ref).sort()).toEqual([everywhere, mine, theirs].sort());
    expect(removed.find((a) => a.ref === mine)).toMatchObject({
      entity: "REVIEWER",
      branchId: home.id,
      actorUserId: branchAdmin.id,
      oldValue: { userId: teacher.id, scope: "GENERAL" },
    });
  });

  test("removing with an id that cannot be an id is a 404, not a 500", async () => {
    for (const raw of ["%00", "a%00b", "x".repeat(65), "x".repeat(5000), "'--", "..%2F..", "%F0%9F%98%80", "%20"]) {
      const res = await api(`${REVIEWERS}/${raw}`, { method: "DELETE", cookie: ck.super });
      expect([res.status, raw.slice(0, 20)]).toEqual([404, raw.slice(0, 20)]);
    }
  });

  test("two removals of the same row at once: one 200, one 404, one audit row", async () => {
    const id = (await add(ck.admin, general(teacher.id))).json.data.reviewer.id as string;
    const results = await Promise.all([1, 2, 3].map(() => api(`${REVIEWERS}/${id}`, { method: "DELETE", cookie: ck.admin })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 404, 404]);
    expect((await audits()).filter((a) => a.action === "REMOVED")).toHaveLength(1);
  });
});

test.describe("the branch gate refuses ids that cannot be ids on routes that already existed", () => {
  // Found by fuzzing this slice: withAuthGated passed ?branchId= straight to a query, and a NUL byte there is a Postgres error, so the request ended as a 500.
  test("six existing gated routes answer 404 (never 500) for a NUL byte or an oversized branch id, for an administrator and a superadmin (a teacher is refused earlier, 403 or 404)", async () => {
    const paths = [
      "/api/v1/communication/templates",
      "/api/v1/communication/dispatches",
      "/api/v1/lms/quizzes",
      "/api/v1/timetable",
      "/api/v1/announcements",
      "/api/v1/academics/promotion/batches",
    ];
    for (const path of paths) {
      for (const raw of ["%00", "a%00b", "x".repeat(65)]) {
        for (const cookie of [ck.teacher, ck.admin, ck.super]) {
          const res = await api(`${path}?branchId=${raw}`, { cookie });
          // A teacher on a route whose roles exclude them is refused (403) before the branch id is looked at; an administrator and a superadmin always reach the gate.
          const allowed = cookie === ck.teacher ? [403, 404] : [404];
          const who = cookie === ck.teacher ? "teacher" : cookie === ck.admin ? "admin" : "super";
          expect(allowed, `${who} ${path}?branchId=${raw.slice(0, 12)} -> ${res.status}`).toContain(res.status);
        }
      }
    }
  });
});
