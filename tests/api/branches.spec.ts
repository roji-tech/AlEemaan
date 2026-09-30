import "../support/env";
import { test, expect } from "@playwright/test";
import { BRANCH_NAMES, Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The one real consumer of `withAuth(handler, { roles: [Role.ADMIN] })` — it replaced
// `requireAdmin()`. The rule it keeps: any ADMIN membership crosses every branch.
const BRANCHES = "/api/v1/branches";

test.beforeAll(async () => {
  await seedInstance();
});

const asRole = async (role?: Role) => {
  const user = await createUser({ role });
  const { token } = await loginAs(user);
  return { user, cookie: cookieHeader(token!) };
};

test.describe("GET /api/v1/branches (admin only)", () => {
  test("not signed in: 401 UNAUTHENTICATED", async () => {
    const res = await api(BRANCHES);
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHENTICATED");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("signed in but not an admin: 403 FORBIDDEN (this used to be a 401 that conflated the two cases)", async () => {
    for (const role of [undefined, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT]) {
      const { cookie } = await asRole(role);
      const res = await api(BRANCHES, { cookie });
      expect(res.status, `role ${role ?? "none"}`).toBe(403);
      expect(res.json.error.code).toBe("FORBIDDEN");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.text).not.toContain("Secondary"); // no data leaks in the refusal
    }
  });

  test("an admin lists the four seeded branches", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const res = await api(BRANCHES, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const names = res.json.data.branches.map((b: { name: string }) => b.name);
    for (const name of BRANCH_NAMES) expect(names).toContain(name);
  });

  test("an admin whose membership is anchored to a DIFFERENT branch still has school-wide access", async () => {
    const admin = await createUser({ role: Role.ADMIN });
    const elsewhere = await db.branch.findFirstOrThrow({ where: { name: "Primary (Arabic)" } });
    await db.membership.updateMany({ where: { userId: admin.id }, data: { branchId: elsewhere.id } });
    const { token } = await loginAs(admin);
    expect((await api(BRANCHES, { cookie: cookieHeader(token!) })).status).toBe(200);
  });

  test("a revoked session stops working immediately", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    await db.session.deleteMany({ where: { userId: user.id } });
    expect((await api(BRANCHES, { cookie })).status).toBe(401);
  });

  test("demoting an admin takes effect on the very next request (the role is read live, not cached in the session)", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    expect((await api(BRANCHES, { cookie })).status).toBe(200);
    await db.membership.updateMany({ where: { userId: user.id }, data: { role: Role.PARENT } });
    expect((await api(BRANCHES, { cookie })).status).toBe(403);
  });
});

test.describe("POST /api/v1/branches (admin only, CSRF-protected, audited)", () => {
  const newName = () => `Test Branch ${Math.random().toString(36).slice(2, 8)}`;

  test("an admin creates a branch (201) and it is audit-logged with the actor", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const name = newName();
    const res = await api(BRANCHES, { method: "POST", body: { name }, cookie });

    expect(res.status).toBe(201);
    expect(res.json.data.branch.name).toBe(name);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "BRANCH_CREATED", targetId: res.json.data.branch.id } });
    expect(audit.actorUserId).toBe(user.id);
    expect(audit.afterValue).toEqual({ name });
  });

  test("a duplicate name is a 409, not a second row", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const res = await api(BRANCHES, { method: "POST", body: { name: BRANCH_NAMES[0] }, cookie });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DUPLICATE_NAME");
    expect(await db.branch.count({ where: { name: BRANCH_NAMES[0] } })).toBe(1);
  });

  test("validation: blank, over-long, or missing names are 400 with a reason", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    for (const body of [{ name: "   " }, { name: "x".repeat(101) }, {}, { name: 42 }]) {
      const res = await api(BRANCHES, { method: "POST", body, cookie });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
    }
    const bad = await api(BRANCHES, { method: "POST", rawBody: "{nope", cookie });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("INVALID_BODY");
  });

  test("CSRF: without a same-origin Origin the wrapper refuses — even for a signed-in admin — and nothing is created", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const name = newName();
    for (const origin of [null, "https://evil.example"]) {
      const res = await api(BRANCHES, { method: "POST", body: { name }, cookie, origin });
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe("CSRF");
    }
    expect(await db.branch.count({ where: { name } })).toBe(0);
  });

  test("a non-admin cannot create branches (403), and nothing is created", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const name = newName();
    const res = await api(BRANCHES, { method: "POST", body: { name }, cookie });
    expect(res.status).toBe(403);
    expect(await db.branch.count({ where: { name } })).toBe(0);
  });

  test("not signed in: 401", async () => {
    const res = await api(BRANCHES, { method: "POST", body: { name: newName() } });
    expect(res.status).toBe(401);
  });
});
