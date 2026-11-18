import "../support/env";
import { test, expect } from "@playwright/test";
import { PORTALS_PORT, PORTALS_URL } from "../support/env";
import {
  BRANCH_NAMES,
  DEFAULT_PASSWORD,
  Role,
  codeFor,
  createUser,
  db,
  enableMfa,
  manageLoginSwitches,
  seedInstance,
  uniqueEmail,
  uniqueIp,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs, parseSetCookie, sessionCookie, type ApiResponse } from "../support/http";
import { tokenFrom, waitForMail } from "../support/outbox";
import { LOGIN_CLOSED_MESSAGE, PORTAL_CLOSED_NOTICE } from "@/lib/auth/login-switch-rules";

// Student and parent sign-in switches, PER BRANCH (task 0091), over real HTTP. Every branch has two switches, OFF by default. A person whose only roles are student and/or parent signs in, and
// keeps a session, only through a membership in a branch whose switch for their role is ON; anyone with another active role and any superadmin is never affected. An administrator may change the
// switches of the branches where they hold an active ADMIN membership and no others; a superadmin of any branch, several, or all. A refusal BEFORE the password is proved is the one generic
// answer of a wrong password; once the credentials are right the person is told the plain reason.
//
// This file sets the switches itself, so it tells the shared helpers to leave them alone (`manageLoginSwitches`) and gives every other spec its ON back at the end. Nothing is remembered between
// requests (the session check reads the switches with the session), so a change made straight in the database is seen by every server on the very next request.

const LOGIN = "/api/v1/auth/login";
const MFA = "/api/v1/auth/login/mfa";
const ME = "/api/v1/auth/me";
const SWITCHES = "/api/v1/settings/login-switches";
const WRONG = "not-the-password-1";
const FRESH = "a-fresh-unseen-passphrase-9";
const AUDIT = "LOGIN_SWITCHES_CHANGED";
const GENERIC = "Invalid email or password";

/// What the caller can see of an answer, to compare two of them: status, body and every header that is not per-request.
const shape = (r: ApiResponse) => ({
  status: r.status,
  body: r.text,
  cookies: r.setCookies,
  cache: r.headers.get("cache-control"),
  type: r.headers.get("content-type"),
});

type Branch = { id: string; name: string };
let A: Branch; // where createUser puts a role: Secondary (English)
let B: Branch;
let C: Branch;
let D: Branch;
let superAdmin: TestUser;
let superCookie: string;

type Credentials = { email: string; password: string };
const signIn = (person: Credentials, password = person.password, extra: { ip?: string } = {}) =>
  api(LOGIN, { method: "POST", body: { email: person.email, password }, ...extra });
const cookieFor = async (person: Credentials) => {
  const res = await loginAs(person);
  expect(res.status, res.text).toBe(200);
  return cookieHeader(res.token!);
};
const canSignIn = async (person: Credentials) => (await signIn(person)).status === 200;
const me = (cookie: string) => api(ME, { cookie });

const closeAll = () => db.branch.updateMany({ data: { studentLoginEnabled: false, parentLoginEnabled: false } });
const openStudents = (...branches: Branch[]) =>
  db.branch.updateMany({ where: { id: { in: branches.map((b) => b.id) } }, data: { studentLoginEnabled: true } });
const openParents = (...branches: Branch[]) =>
  db.branch.updateMany({ where: { id: { in: branches.map((b) => b.id) } }, data: { parentLoginEnabled: true } });
const flags = async (branch: Branch) => {
  const row = await db.branch.findUniqueOrThrow({ where: { id: branch.id } });
  return [row.studentLoginEnabled, row.parentLoginEnabled];
};
/// The four seeded branches' switches by name (other specs leave branches of their own behind, so not every branch).
const allFlags = async () =>
  Object.fromEntries(
    (await db.branch.findMany({ where: { id: { in: [A.id, B.id, C.id, D.id] } } })).map((row) => [
      row.name,
      [row.studentLoginEnabled, row.parentLoginEnabled],
    ]),
  );
const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

/// A person with one membership of `role` in `branch` (createUser puts its role in the first branch only).
async function inBranch(branch: Branch, role: Role): Promise<TestUser> {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: branch.id, role } });
  return user;
}
const alsoIn = (user: TestUser, branch: Branch, role: Role, deactivatedAt: Date | null = null) =>
  db.membership.create({ data: { userId: user.id, branchId: branch.id, role, deactivatedAt } });

const patch = (body: Record<string, unknown>, cookie = superCookie) => api(SWITCHES, { method: "PATCH", cookie, body });
/// A change that must be accepted.
async function flip(body: Record<string, unknown>, cookie = superCookie) {
  const res = await patch(body, cookie);
  expect(res.status, res.text).toBe(200);
  return res;
}
const auditRows = () => db.auditLog.findMany({ where: { action: AUDIT }, orderBy: { createdAt: "asc" } });
/// How many entries exist now: the audit table keeps every earlier test's rows, so a test compares with this mark, never with zero.
const auditMark = async () => (await auditRows()).length;

test.beforeAll(async () => {
  manageLoginSwitches(true);
  await seedInstance();
  const rows = await db.branch.findMany({ where: { name: { in: [...BRANCH_NAMES] } } });
  [A, B, C, D] = BRANCH_NAMES.map((name) => rows.find((row) => row.name === name)!);
  superAdmin = await createUser({ role: Role.ADMIN, name: "Super Admin" }); // a superadmin, as an ADMIN made by createUser is
  superCookie = await cookieFor(superAdmin);
});

test.beforeEach(async () => {
  await closeAll();
});

test.afterAll(async () => {
  manageLoginSwitches(false);
  await seedInstance(); // every branch ON again, for every spec that follows
});

test.describe("the default", () => {
  test("a branch made now has both switches off (the column default), and the API lists every branch with both values for a superadmin", async () => {
    const made = await db.branch.create({ data: { name: `Fresh ${Date.now().toString(36)}` } });
    const row = await db.branch.findUniqueOrThrow({ where: { id: made.id } });
    expect([row.studentLoginEnabled, row.parentLoginEnabled]).toEqual([false, false]);

    const res = await api(SWITCHES, { cookie: superCookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const all = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
    expect(res.json.data.canBulk).toBe(true);
    const listed = [...res.json.data.branches].sort((x: Branch, y: Branch) => x.id.localeCompare(y.id));
    expect(listed).toEqual(
      [...all]
        .sort((x, y) => x.id.localeCompare(y.id))
        .map((b) => ({ id: b.id, name: b.name, studentLoginEnabled: false, parentLoginEnabled: false })),
    );
    await db.branch.delete({ where: { id: made.id } });
  });
});

test.describe("sign-in", () => {
  test("a student and a parent in a closed branch with the RIGHT password are told it is closed, with no cookie, no session and no two-step challenge; staff are never affected", async () => {
    const student = await inBranch(A, Role.STUDENT);
    const parent = await inBranch(A, Role.PARENT);
    for (const [label, person] of [
      ["student", student],
      ["parent", parent],
    ] as const) {
      const res = await signIn(person);
      expect(res.status, label).toBe(403);
      expect(res.json.error.code).toBe("LOGIN_CLOSED");
      expect(res.json.error.message).toBe(LOGIN_CLOSED_MESSAGE);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.setCookies, `no cookie for the ${label}`).toEqual([]);
      expect(await db.session.count({ where: { userId: person.id } }), `no session for the ${label}`).toBe(0);
    }
    for (const role of [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF]) {
      const staff = await createUser({ role });
      const res = await signIn(staff);
      expect(res.status, role).toBe(200);
      expect(sessionCookie(res)?.value, role).toBeTruthy();
    }
    const closedWithMfa = await inBranch(A, Role.STUDENT);
    await enableMfa(closedWithMfa.id);
    expect((await signIn(closedWithMfa)).json.error.code).toBe("LOGIN_CLOSED"); // refused before any challenge is made
    expect(await db.mfaChallenge.count({ where: { userId: closedWithMfa.id } })).toBe(0);
  });

  test("before the password is proved every refusal is the one generic answer: a wrong password and no account at all look alike, and say nothing about the switches", async () => {
    const student = await inBranch(A, Role.STUDENT);
    const wrong = await signIn(student, WRONG);
    const ghost = await signIn({ email: uniqueEmail("ghost"), password: DEFAULT_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(wrong.json.error).toMatchObject({ code: "INVALID_CREDENTIALS", message: GENERIC });
    expect(shape(wrong)).toEqual(shape(ghost));
    expect(wrong.text).not.toMatch(/closed|switch|student|parent/i);
  });

  test("a closed answer is not a failed attempt: the same right password, over and over, is never rate limited, while wrong ones are", async () => {
    const closed = await inBranch(A, Role.STUDENT);
    const guessed = await inBranch(A, Role.STUDENT);
    const run = async (person: Credentials, password: string) => {
      const ip = uniqueIp();
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) statuses.push((await signIn(person, password, { ip })).status);
      return statuses;
    };
    expect(await run(closed, DEFAULT_PASSWORD)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(await run(guessed, WRONG)).toEqual([401, 401, 401, 401, 401, 429, 429]);
  });

  test("a student needs the STUDENT switch of THEIR branch: another branch's, or the parent switch, does not help", async () => {
    const student = await inBranch(A, Role.STUDENT);
    await openStudents(B, C, D);
    await openParents(A);
    expect(await canSignIn(student)).toBe(false);
    await openStudents(A);
    expect(await canSignIn(student)).toBe(true);
  });

  test("a parent needs the PARENT switch of THEIR branch, and turning each switch on lets in that role only; staff are in throughout", async () => {
    const student = await inBranch(A, Role.STUDENT);
    const parent = await inBranch(A, Role.PARENT);
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    const door = async () => [await canSignIn(student), await canSignIn(parent), await canSignIn(teacher)];
    expect(await door()).toEqual([false, false, true]);
    await openStudents(A);
    expect(await door()).toEqual([true, false, true]);
    await db.branch.update({ where: { id: A.id }, data: { studentLoginEnabled: false, parentLoginEnabled: true } });
    expect(await door()).toEqual([false, true, true]);
    await openStudents(A);
    expect(await door()).toEqual([true, true, true]);
  });

  test("a person attached to several branches gets in through the open ones and only those", async () => {
    const student = await inBranch(A, Role.STUDENT);
    await alsoIn(student, B, Role.STUDENT);
    expect(await canSignIn(student)).toBe(false); // both closed
    await openStudents(B);
    const cookie = await cookieFor(student);
    expect((await me(cookie)).status).toBe(200);
    await closeAll();
    const ended = await me(cookie); // B closed again: no branch of theirs is open
    expect(ended.status).toBe(401);
    expect(ended.json.error.code).toBe("LOGIN_CLOSED");
    await openStudents(A);
    expect((await me(cookie)).status).toBe(200); // A is open: the same cookie works again
  });

  test("a student in one branch and a parent in another: each membership needs its own branch's switch for its own role", async () => {
    const both = await inBranch(A, Role.STUDENT);
    await alsoIn(both, B, Role.PARENT);
    await db.branch.update({ where: { id: A.id }, data: { parentLoginEnabled: true } }); // the parent switch of the branch where they are a STUDENT
    await db.branch.update({ where: { id: B.id }, data: { studentLoginEnabled: true } }); // the student switch of the branch where they are a PARENT
    expect(await canSignIn(both)).toBe(false);
    await openParents(B);
    expect(await canSignIn(both)).toBe(true);
  });

  test("a person who is also a member of staff is never affected (a parent in a closed branch and a teacher in another), and a DEACTIVATED staff role does not count", async () => {
    const staffAndParent = await inBranch(A, Role.PARENT);
    await alsoIn(staffAndParent, B, Role.TEACHING_STAFF);
    const cookie = await cookieFor(staffAndParent);
    expect((await me(cookie)).status).toBe(200);

    const formerStaff = await inBranch(A, Role.PARENT);
    await alsoIn(formerStaff, B, Role.TEACHING_STAFF, new Date());
    expect(await canSignIn(formerStaff)).toBe(false);
  });

  test("a superadmin is never affected, even if the only role they hold is a parent's", async () => {
    const boss = await createUser({ role: Role.PARENT, superAdmin: true });
    expect(await canSignIn(boss)).toBe(true);
  });

  test("two-step verification: a branch closed between the password and the code refuses the code, with the plain reason and no session", async () => {
    await openStudents(A);
    const student = await inBranch(A, Role.STUDENT);
    const { secret } = await enableMfa(student.id);
    const step1 = await signIn(student);
    expect(step1.status).toBe(200);
    expect(step1.json.data.mfaRequired).toBe(true);
    await closeAll();
    const step2 = await api(MFA, { body: { challenge: step1.json.data.challenge, code: codeFor(secret) } });
    expect(step2.status).toBe(403);
    expect(step2.json.error.code).toBe("LOGIN_CLOSED");
    expect(step2.setCookies).toEqual([]);
    expect(await db.session.count({ where: { userId: student.id } })).toBe(0);
  });
});

test.describe("a session that is already open", () => {
  test("is ended on the very next request, API and page, when its branch is closed; nothing is deleted, so opening the branch again resumes it; staff are never ended", async () => {
    await openStudents(A);
    await openParents(A);
    const student = await inBranch(A, Role.STUDENT);
    const parent = await inBranch(A, Role.PARENT);
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    const [studentCookie, parentCookie, teacherCookie] = [await cookieFor(student), await cookieFor(parent), await cookieFor(teacher)];
    for (const cookie of [studentCookie, parentCookie, teacherCookie]) expect((await me(cookie)).status).toBe(200);

    await flip({ branchIds: [A.id], studentLoginEnabled: false }); // through the real API, as an administrator does
    const ended = await me(studentCookie);
    expect(ended.status).toBe(401);
    expect(ended.json.error).toMatchObject({ code: "LOGIN_CLOSED", message: LOGIN_CLOSED_MESSAGE });
    expect((await api("/api/v1/auth/sessions", { cookie: studentCookie })).status).toBe(401); // every route, not one
    const page = await api("/dashboard", { cookie: studentCookie });
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login?closed=1");
    expect((await me(parentCookie)).status).toBe(200); // the parent switch is still on
    expect((await me(teacherCookie)).status).toBe(200);
    expect(await db.session.count({ where: { userId: student.id } })).toBe(1);

    await flip({ branchIds: [A.id], studentLoginEnabled: true });
    expect((await me(studentCookie)).status).toBe(200); // the same cookie, again

    await flip({ branchIds: [A.id], studentLoginEnabled: false, parentLoginEnabled: false });
    expect((await me(parentCookie)).status).toBe(401);
    expect((await me(teacherCookie)).status).toBe(200);
  });

  test("the sign-in page says why, from fixed text, whatever the address says", async () => {
    const res = await api("/login?closed=1");
    expect(res.status).toBe(200);
    expect(res.text).toContain(LOGIN_CLOSED_MESSAGE);
    expect((await api("/login")).text).not.toContain(LOGIN_CLOSED_MESSAGE);
    expect((await api("/login?closed=%3Cb%3Ex")).text).not.toContain(LOGIN_CLOSED_MESSAGE);
  });
});

test.describe("who may change which branches", () => {
  test("an administrator of one branch reads only that branch, and changes it", async () => {
    const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false }); // administers A only
    const cookie = await cookieFor(branchAdmin);

    const read = await api(SWITCHES, { cookie });
    expect(read.status).toBe(200);
    expect(read.json.data).toEqual({
      canBulk: false,
      branches: [{ id: A.id, name: A.name, studentLoginEnabled: false, parentLoginEnabled: false }],
    });

    const res = await patch({ branchIds: [A.id], studentLoginEnabled: true }, cookie);
    expect(res.status, res.text).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.json.data.branches).toEqual([{ id: A.id, name: A.name, studentLoginEnabled: true, parentLoginEnabled: false }]);
    expect(res.json.data.changes).toEqual([
      {
        id: A.id,
        name: A.name,
        before: { studentLoginEnabled: false, parentLoginEnabled: false },
        after: { studentLoginEnabled: true, parentLoginEnabled: false },
      },
    ]);
    expect(await flags(A)).toEqual([true, false]);
  });

  test("an administrator naming a branch that is not theirs is refused with 403 and NOTHING changes, even when their own branch is named too; an unknown id gets the same answer", async () => {
    const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
    const cookie = await cookieFor(branchAdmin);
    const before = await allFlags();
    const mark = await auditMark();

    const other = await patch({ branchIds: [B.id], studentLoginEnabled: true }, cookie);
    expect(other.status).toBe(403);
    expect(other.json.error.code).toBe("FORBIDDEN");
    const mixed = await patch({ branchIds: [A.id, B.id], studentLoginEnabled: true }, cookie);
    expect(mixed.status).toBe(403);
    const unknown = await patch({ branchIds: ["no-such-branch-id"], studentLoginEnabled: true }, cookie);
    expect(shape(unknown)).toEqual(shape(other)); // whether the branch exists is not revealed
    expect(shape(mixed)).toEqual(shape(other));

    expect(await allFlags()).toEqual(before);
    expect(await auditMark()).toBe(mark);
  });

  test("allBranches for an administrator means all of THEIR own branches, never another", async () => {
    const two = await createUser({ role: Role.ADMIN, superAdmin: false });
    await alsoIn(two, B, Role.ADMIN);
    const cookie = await cookieFor(two);
    expect(ids((await api(SWITCHES, { cookie })).json.data.branches)).toEqual(ids([A, B]));

    const res = await patch({ allBranches: true, parentLoginEnabled: true }, cookie);
    expect(res.status, res.text).toBe(200);
    expect(ids(res.json.data.branches)).toEqual(ids([A, B]));
    expect(await flags(A)).toEqual([false, true]);
    expect(await flags(B)).toEqual([false, true]);
    expect(await flags(C)).toEqual([false, false]);
    expect(await flags(D)).toEqual([false, false]);
  });

  test("an administrator whose ADMIN membership was deactivated, a teacher, a member of staff, a student, a parent and a signed-out caller may not read or change anything, and nothing changes", async () => {
    await openStudents(A);
    await openParents(A);
    const former = await createUser({ role: Role.ADMIN, superAdmin: false });
    const formerCookie = await cookieFor(former); // signed in while the membership was active...
    await db.membership.updateMany({ where: { userId: former.id }, data: { deactivatedAt: new Date() } }); // ...and deactivated since
    const forbidden: [string, Credentials][] = [
      ["a teacher", await createUser({ role: Role.TEACHING_STAFF })],
      ["non-teaching staff", await createUser({ role: Role.NON_TEACHING_STAFF })],
      ["a student", await inBranch(A, Role.STUDENT)],
      ["a parent", await inBranch(A, Role.PARENT)],
    ];
    const before = await allFlags();
    const mark = await auditMark();
    const formerPatch = await patch({ branchIds: [A.id], studentLoginEnabled: false }, formerCookie);
    expect(formerPatch.status, "a deactivated administrator").toBe(403);
    expect((await api(SWITCHES, { cookie: formerCookie })).status).toBe(403);
    for (const [label, person] of forbidden) {
      const cookie = await cookieFor(person);
      const res = await patch({ branchIds: [A.id], studentLoginEnabled: false, parentLoginEnabled: false }, cookie);
      expect(res.status, `${label} changing`).toBe(403);
      expect(res.json.error.code).toBe("FORBIDDEN");
      expect((await api(SWITCHES, { cookie })).status, `${label} reading`).toBe(403);
    }
    const signedOut = await api(SWITCHES, { method: "PATCH", body: { branchIds: [A.id], studentLoginEnabled: false } });
    expect(signedOut.status).toBe(401);
    expect(signedOut.json.error.code).toBe("UNAUTHENTICATED");
    expect((await api(SWITCHES)).status).toBe(401);
    expect(await allFlags()).toEqual(before);
    expect(await auditMark()).toBe(mark);
  });

  test("a superadmin changes one branch, several chosen ones, or all, and reads every branch", async () => {
    const one = await flip({ branchIds: [C.id], studentLoginEnabled: true });
    expect(ids(one.json.data.branches)).toEqual(ids([C]));
    expect(await allFlags()).toEqual({
      [A.name]: [false, false],
      [B.name]: [false, false],
      [C.name]: [true, false],
      [D.name]: [false, false],
    });

    await flip({ branchIds: [D.id, A.id], parentLoginEnabled: true });
    expect(await allFlags()).toEqual({
      [A.name]: [false, true],
      [B.name]: [false, false],
      [C.name]: [true, false],
      [D.name]: [false, true],
    });

    const all = await flip({ allBranches: true, studentLoginEnabled: true, parentLoginEnabled: true });
    expect(all.json.data.branches).toHaveLength(await db.branch.count());
    expect(await allFlags()).toEqual({ [A.name]: [true, true], [B.name]: [true, true], [C.name]: [true, true], [D.name]: [true, true] });

    const off = await flip({ allBranches: true, studentLoginEnabled: false, parentLoginEnabled: false });
    expect(off.json.data.changes).toHaveLength(await db.branch.count());
    expect(await allFlags()).toEqual({
      [A.name]: [false, false],
      [B.name]: [false, false],
      [C.name]: [false, false],
      [D.name]: [false, false],
    });
  });

  test("a superadmin naming a branch that does not exist is refused with 404 and nothing changes, the real branches named beside it included", async () => {
    const before = await allFlags();
    const mark = await auditMark();
    const res = await patch({ branchIds: [A.id, "no-such-branch-id"], studentLoginEnabled: true, parentLoginEnabled: true });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("NOT_FOUND");
    expect(await allFlags()).toEqual(before);
    expect(await auditMark()).toBe(mark);
  });

  test("a request from another origin is refused, and the body must be right: branches (one way), at least one switch, real booleans, nothing else", async () => {
    const cross = await api(SWITCHES, {
      method: "PATCH",
      cookie: superCookie,
      body: { branchIds: [A.id], studentLoginEnabled: true },
      origin: "http://evil.example",
    });
    expect(cross.status).toBe(403);
    expect(cross.json.error.code).toBe("CSRF");

    const bodies: Record<string, unknown>[] = [
      {},
      { studentLoginEnabled: true },
      { branchIds: [A.id] },
      { allBranches: true },
      { branchIds: [A.id], allBranches: true, studentLoginEnabled: true },
      { branchIds: [], studentLoginEnabled: true },
      { branchIds: [A.id, A.id], studentLoginEnabled: true },
      { branchIds: A.id, studentLoginEnabled: true },
      { branchIds: [A.id], studentLoginEnabled: "true" },
      { branchIds: [A.id], studentLoginEnabled: null },
      { allBranches: false, studentLoginEnabled: true },
      { branchIds: [A.id], studentLoginEnabled: true, other: 1 },
      { branchIds: ["x y"], studentLoginEnabled: true },
    ];
    for (const body of bodies) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
    }
    expect(await allFlags()).toEqual({
      [A.name]: [false, false],
      [B.name]: [false, false],
      [C.name]: [false, false],
      [D.name]: [false, false],
    });
  });
});

test.describe("the audit trail", () => {
  test("one entry per branch that changed, naming the branch with its before and after, in one go; branches already as asked, and refused requests, write nothing", async () => {
    await openStudents(B); // B already has the student switch on
    const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
    const mark = await auditMark();

    const res = await flip({ branchIds: [A.id, B.id, C.id], studentLoginEnabled: true });
    expect(res.json.data.changes.map((change: { id: string }) => change.id)).toEqual([A.id, C.id]); // B was already on
    const rows = (await auditRows()).slice(mark);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.targetId).sort()).toEqual([A.id, C.id].sort());
    for (const row of rows) {
      expect(row).toMatchObject({ actorUserId: superAdmin.id, targetType: "Branch" });
      const name = row.targetId === A.id ? A.name : C.name;
      expect(row.beforeValue).toEqual({ branchName: name, studentLoginEnabled: false, parentLoginEnabled: false });
      expect(row.afterValue).toEqual({ branchName: name, studentLoginEnabled: true, parentLoginEnabled: false });
    }

    await flip({ branchIds: [A.id, B.id, C.id], studentLoginEnabled: true }); // the same again
    expect(await auditMark()).toBe(mark + 2);
    expect((await patch({ branchIds: [B.id], parentLoginEnabled: true }, await cookieFor(branchAdmin))).status).toBe(403); // refused
    expect(await auditMark()).toBe(mark + 2);

    const own = await patch({ branchIds: [A.id], parentLoginEnabled: true }, await cookieFor(branchAdmin));
    expect(own.status).toBe(200);
    const last = (await auditRows()).at(-1)!;
    expect(last).toMatchObject({ actorUserId: branchAdmin.id, targetId: A.id });
    expect(last.beforeValue).toEqual({ branchName: A.name, studentLoginEnabled: true, parentLoginEnabled: false });
    expect(last.afterValue).toEqual({ branchName: A.name, studentLoginEnabled: true, parentLoginEnabled: true });
  });
});

test.describe("no back door", () => {
  test("a password reset and an accepted invitation sign nobody in, and a new password does not open a closed door", async () => {
    const student = await inBranch(A, Role.STUDENT);
    await api("/api/v1/auth/forgot-password", { body: { email: student.email } });
    const mail = await waitForMail(student.email);
    const reset = await api("/api/v1/auth/reset-password", { body: { token: tokenFrom(mail[mail.length - 1]), password: FRESH } });
    expect(reset.status).toBe(200);
    expect(reset.setCookies.map(parseSetCookie).find((cookie) => cookie.value)).toBeUndefined();
    const closed = await signIn({ email: student.email, password: FRESH });
    expect(closed.status).toBe(403);
    expect(closed.json.error.code).toBe("LOGIN_CLOSED");
    expect(await db.session.count({ where: { userId: student.id } })).toBe(0);

    const invitee = uniqueEmail("invitee");
    const invited = await api("/api/v1/invitations", {
      method: "POST",
      cookie: superCookie,
      body: { email: invitee, role: "PARENT", branchId: A.id },
    });
    expect(invited.status, invited.text).toBe(201);
    const inviteMail = await waitForMail(invitee);
    const accepted = await api("/api/v1/invitations/accept", {
      body: { token: tokenFrom(inviteMail[inviteMail.length - 1]), name: "New Parent", password: FRESH },
    });
    expect(accepted.status, accepted.text).toBe(200);
    expect(sessionCookie(accepted)).toBeUndefined();
    expect((await signIn({ email: invitee, password: FRESH })).json.error.code).toBe("LOGIN_CLOSED"); // A's parent switch is off
    await openParents(A);
    expect((await signIn({ email: invitee, password: FRESH })).status).toBe(200); // and on, the same person gets in
  });
});

test.describe("the sign-in portals", () => {
  const host = (portal: string) => `${portal}.localhost:${PORTALS_PORT}`;
  const at = (portal: string) => ({
    baseUrl: PORTALS_URL,
    origin: `http://${host(portal)}`,
    headers: { "x-forwarded-host": host(portal) },
  });
  const page = async (portal: string) => {
    const res = await api("/login", at(portal));
    expect(res.status, portal).toBe(200);
    return res.text;
  };

  test("a portal's page says it is closed only when NO branch at all has its switch on; the staff and administrator portals never do", async () => {
    expect(await page("student")).toContain(PORTAL_CLOSED_NOTICE.student);
    expect(await page("parent")).toContain(PORTAL_CLOSED_NOTICE.parent);

    await openStudents(C); // one branch is enough, whichever it is
    expect(await page("student")).not.toContain("is closed at the moment");
    expect(await page("parent")).toContain(PORTAL_CLOSED_NOTICE.parent);
    await openParents(D);
    expect(await page("parent")).not.toContain("is closed at the moment");

    await closeAll();
    for (const portal of ["admin", "staff"]) expect(await page(portal), portal).not.toContain("is closed at the moment");
  });

  test("on its own portal a closed student with the right password is told so, a wrong password is the generic answer, and a student on the parent portal is the wrong-portal answer", async () => {
    const student = await inBranch(A, Role.STUDENT);
    const closed = await api(LOGIN, { method: "POST", body: { email: student.email, password: DEFAULT_PASSWORD }, ...at("student") });
    expect(closed.status).toBe(403);
    expect(closed.json.error.code).toBe("LOGIN_CLOSED");
    const wrong = await api(LOGIN, { method: "POST", body: { email: student.email, password: WRONG }, ...at("student") });
    expect(wrong.status).toBe(401);
    expect(wrong.json.error.message).toBe(GENERIC);
    const wrongPortal = await api(LOGIN, { method: "POST", body: { email: student.email, password: DEFAULT_PASSWORD }, ...at("parent") });
    expect(shape(wrongPortal)).toEqual(
      shape(await api(LOGIN, { method: "POST", body: { email: student.email, password: WRONG }, ...at("parent") })),
    );

    await openStudents(A);
    expect(
      (await api(LOGIN, { method: "POST", body: { email: student.email, password: DEFAULT_PASSWORD }, ...at("student") })).status,
    ).toBe(200);
  });
});
