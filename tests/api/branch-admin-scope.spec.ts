import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Branch administrators outside the Users pages (plan S3, S7): students, academic sessions and periods follow the branch; branches and
// school settings are the superadmin's. For each: a branch administrator in their own branch, the same person in another branch, and a
// superadmin. An entity of another branch is "no such" (404) exactly like an unknown id; a branch named in the body that is not theirs is 403.

let primary: { id: string };
let secondary: { id: string };
let branchAdmin: TestUser; // ADMIN in the first seeded branch ("Secondary (English)" = `secondary`) only
let superAdmin: TestUser;
let cookie: Record<string, string> = {};
let foreign: { id: string }; // a student of another branch

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const student = (branchId: string, admissionNo: string, lastName: string) =>
  db.studentRecord.create({
    data: { branchId, admissionNo, firstName: "Test", lastName, gender: "FEMALE", dateOfBirth: new Date("2016-01-01T00:00:00Z") },
  });

test.beforeAll(async () => {
  await resetDatabase();
  const first = await seedInstance();
  secondary = first;
  primary = await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } });
  superAdmin = await createUser({ role: Role.ADMIN });
  branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false }); // membership in `first` (Secondary (English))
  cookie = { branch: await cookieFor(branchAdmin), super: await cookieFor(superAdmin) };
  foreign = await student(primary.id, "SCOPE-FOREIGN-1", "Otherbranch");
});

const body = (branchId: string, extra: object = {}) => ({
  branchId,
  firstName: "Zainab",
  lastName: `Scope${Math.random().toString(36).slice(2, 8)}`,
  gender: "FEMALE",
  dateOfBirth: "2016-05-10",
  ...extra,
});

test.describe("students", () => {
  test("a branch administrator creates a student in their own branch, not in another (403); a superadmin in either", async () => {
    expect((await api("/api/v1/students", { method: "POST", cookie: cookie.branch, body: body(secondary.id) })).status).toBe(201);
    const elsewhere = await api("/api/v1/students", { method: "POST", cookie: cookie.branch, body: body(primary.id) });
    expect(elsewhere.status).toBe(403);
    expect(elsewhere.json.error.code).toBe("FORBIDDEN");
    expect((await api("/api/v1/students", { method: "POST", cookie: cookie.super, body: body(primary.id) })).status).toBe(201);
  });

  test("update, archive and restore: own branch works; another branch's student is a 404, the same as an unknown id", async () => {
    const mine = await student(secondary.id, "SCOPE-OWN-2", "Editable");
    expect(
      (await api(`/api/v1/students/${mine.id}`, { method: "PATCH", cookie: cookie.branch, body: { firstName: "Changed" } })).status,
    ).toBe(200);
    expect((await api(`/api/v1/students/${mine.id}`, { method: "DELETE", cookie: cookie.branch })).status).toBe(200);
    expect((await api(`/api/v1/students/${mine.id}/restore`, { method: "POST", cookie: cookie.branch, body: {} })).status).toBe(200);

    const unknownPatch = await api("/api/v1/students/no-such-student", {
      method: "PATCH",
      cookie: cookie.branch,
      body: { firstName: "Xx" },
    });
    const unknownDelete = await api("/api/v1/students/no-such-student", { method: "DELETE", cookie: cookie.branch });
    const unknownRestore = await api("/api/v1/students/no-such-student/restore", { method: "POST", cookie: cookie.branch, body: {} });
    const patch = await api(`/api/v1/students/${foreign.id}`, { method: "PATCH", cookie: cookie.branch, body: { firstName: "Hacked" } });
    const del = await api(`/api/v1/students/${foreign.id}`, { method: "DELETE", cookie: cookie.branch });
    const restore = await api(`/api/v1/students/${foreign.id}/restore`, { method: "POST", cookie: cookie.branch, body: {} });
    expect([patch.status, del.status, restore.status]).toEqual([404, 404, 404]);
    expect(patch.json).toEqual(unknownPatch.json);
    expect(del.json).toEqual(unknownDelete.json);
    expect(restore.json).toEqual(unknownRestore.json);
    expect(await db.studentRecord.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ firstName: "Test", archivedAt: null });

    // a superadmin reaches it
    expect(
      (await api(`/api/v1/students/${foreign.id}`, { method: "PATCH", cookie: cookie.super, body: { firstName: "Changed" } })).status,
    ).toBe(200);
  });

  test("import: own branch only (403 for another); a superadmin anywhere", async () => {
    const rows = (n: string) => ({ rows: [{ firstName: "Imp", lastName: `Import${n}`, gender: "MALE", dateOfBirth: "2015-03-03" }] });
    expect(
      (await api("/api/v1/students/import", { method: "POST", cookie: cookie.branch, body: { branchId: primary.id, ...rows("a") } }))
        .status,
    ).toBe(403);
    expect(
      (await api("/api/v1/students/import", { method: "POST", cookie: cookie.branch, body: { branchId: secondary.id, ...rows("b") } }))
        .status,
    ).toBe(200);
    expect(
      (await api("/api/v1/students/import", { method: "POST", cookie: cookie.super, body: { branchId: primary.id, ...rows("c") } })).status,
    ).toBe(200);
  });
});

test.describe("academic sessions and periods", () => {
  const session = (branchId: string, label: string) => ({ branchId, label, startDate: "2030-09-01", endDate: "2031-07-20" });

  test("a branch administrator creates and updates sessions of their own branch; another branch is 403 on create and 404 on update", async () => {
    const created = await api("/api/v1/academics/sessions", {
      method: "POST",
      cookie: cookie.branch,
      body: session(secondary.id, `2030/2031-${Date.now()}`),
    });
    expect(created.status).toBe(201);
    const id = created.json.data.session.id;
    expect(
      (await api(`/api/v1/academics/sessions/${id}`, { method: "PATCH", cookie: cookie.branch, body: { status: "ACTIVE" } })).status,
    ).toBe(200);

    expect(
      (
        await api("/api/v1/academics/sessions", {
          method: "POST",
          cookie: cookie.branch,
          body: session(primary.id, `2030/2031-${Date.now()}`),
        })
      ).status,
    ).toBe(403);

    const theirs = await api("/api/v1/academics/sessions", {
      method: "POST",
      cookie: cookie.super,
      body: session(primary.id, `2031/2032-${Date.now()}`),
    });
    expect(theirs.status).toBe(201);
    const theirId = theirs.json.data.session.id;
    const patched = await api(`/api/v1/academics/sessions/${theirId}`, {
      method: "PATCH",
      cookie: cookie.branch,
      body: { status: "ACTIVE" },
    });
    const unknown = await api("/api/v1/academics/sessions/no-such-session", {
      method: "PATCH",
      cookie: cookie.branch,
      body: { status: "ACTIVE" },
    });
    expect(patched.status).toBe(404);
    expect(patched.json.error.code).toBe(unknown.json.error.code);

    const period = theirs.json.data.session.periods[0].id;
    expect(
      (
        await api(`/api/v1/academics/periods/${period}`, {
          method: "PATCH",
          cookie: cookie.branch,
          body: { branchId: primary.id, isCurrent: true },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(`/api/v1/academics/periods/${period}`, {
          method: "PATCH",
          cookie: cookie.super,
          body: { branchId: primary.id, isCurrent: true },
        })
      ).status,
    ).toBe(200);
  });
});

test.describe("branches and school settings are the superadmin's", () => {
  test("a branch administrator lists only their own branch and cannot create one; a superadmin lists all and can", async () => {
    const mine = (await api("/api/v1/branches", { cookie: cookie.branch })).json.data.branches as { id: string }[];
    expect(mine.map((b) => b.id)).toEqual([secondary.id]);
    expect(((await api("/api/v1/branches", { cookie: cookie.super })).json.data.branches as unknown[]).length).toBeGreaterThanOrEqual(4);

    expect((await api("/api/v1/branches", { method: "POST", cookie: cookie.branch, body: { name: "Not Allowed Branch" } })).status).toBe(
      403,
    );
    expect(await db.branch.count({ where: { name: "Not Allowed Branch" } })).toBe(0);
    expect((await api("/api/v1/branches", { method: "POST", cookie: cookie.super, body: { name: "Allowed Branch" } })).status).toBe(201);
  });

  test("school settings can be changed by a superadmin only", async () => {
    const before = (await api("/api/v1/settings/school", { cookie: cookie.branch })).json.data.settings;
    const refused = await api("/api/v1/settings/school", { method: "PATCH", cookie: cookie.branch, body: { name: "Hijacked School" } });
    expect(refused.status).toBe(403);
    expect((await api("/api/v1/settings/school", { cookie: cookie.branch })).json.data.settings).toEqual(before);
    expect((await api("/api/v1/settings/school", { method: "PATCH", cookie: cookie.super, body: { name: "Scoped School" } })).status).toBe(
      200,
    );
  });
});
