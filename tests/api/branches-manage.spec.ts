import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The single-branch routes: GET one, PATCH (rename) and DELETE, superadmin only. The deletion is the dangerous one: nearly every table cascades from Branch, so the rule is
// that a branch holding people or history is refused and one holding only set-up (classes, invitations, ...) is deleted with it, after its exact name is typed back.
let counter = 0;
const unique = (label: string) => `${label} ${Date.now().toString(36)}-${++counter}`;
const newBranch = (label = "Managed") => db.branch.create({ data: { name: unique(label) } });
const as = async (opts: Parameters<typeof createUser>[0]) => {
  const user = await createUser(opts);
  const { token } = await loginAs(user);
  return { user, cookie: cookieHeader(token!) };
};
const one = (id: string) => `/api/v1/branches/${id}`;

test.beforeAll(async () => {
  await seedInstance();
});

test.describe("who may use them", () => {
  test("signed out is 401; a branch administrator, a teacher and a parent are 403, and nothing changes", async () => {
    const branch = await newBranch();
    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const body = method === "GET" ? undefined : method === "PATCH" ? { name: unique("Nope") } : { confirmName: branch.name };
      expect((await api(one(branch.id), { method, body })).status, `${method} signed out`).toBe(401);
      for (const who of [{ role: Role.ADMIN, superAdmin: false }, { role: Role.TEACHING_STAFF }, { role: Role.PARENT }]) {
        const { cookie } = await as(who);
        const res = await api(one(branch.id), { method, body, cookie });
        expect(res.status, `${method} as ${who.role}${who.superAdmin === false ? " (not super)" : ""}`).toBe(403);
        expect(res.text).not.toContain(branch.name);
      }
    }
    expect(await db.branch.findUnique({ where: { id: branch.id } })).toMatchObject({ name: branch.name });
  });

  test("a state-changing call without a same-origin Origin is refused", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    expect((await api(one(branch.id), { method: "DELETE", body: { confirmName: branch.name }, cookie, origin: null })).status).toBe(403);
    expect(await db.branch.count({ where: { id: branch.id } })).toBe(1);
  });
});

test.describe("GET one", () => {
  test("an empty branch: its name, code, nothing held, and it can be deleted", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    const res = await api(one(branch.id), { cookie });
    expect(res.status).toBe(200);
    expect(res.json.data.branch).toMatchObject({ id: branch.id, name: branch.name });
    expect(res.json.data.branch.code).toMatch(/^[A-Z0-9]{2,6}$/);
    expect(res.json.data).toMatchObject({ holdings: [], canDelete: true, onlyBranch: false });
  });

  test("people and history are counted and block; set-up is counted and does not", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    const member = await createUser({ role: Role.TEACHING_STAFF });
    await db.membership.updateMany({ where: { userId: member.id }, data: { branchId: branch.id } });
    await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "Amina",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2014-03-21"),
        admissionNo: unique("ADM"),
      },
    });
    await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
    await db.invitation.create({
      data: {
        email: `${unique("a").replaceAll(" ", "")}@test.example`,
        role: "PARENT",
        branchId: branch.id,
        tokenHash: unique("h").padEnd(64, "x"),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const { holdings, canDelete } = (await api(one(branch.id), { cookie })).json.data;
    expect(canDelete).toBe(false);
    expect(holdings).toEqual(
      expect.arrayContaining([
        { label: "active members", count: 1, blocks: true },
        { label: "pupils", count: 1, blocks: true },
        { label: "classes", count: 1, blocks: false },
        { label: "invitations", count: 1, blocks: false },
      ]),
    );
    // blocking ones come first
    expect(holdings.findIndex((h: { blocks: boolean }) => !h.blocks)).toBeGreaterThan(
      holdings.map((h: { blocks: boolean }) => h.blocks).lastIndexOf(true),
    );
  });

  test("an unknown id and a malformed one are the same 404", async () => {
    const { cookie } = await as({ role: Role.ADMIN });
    for (const id of ["does-not-exist", "x".repeat(200), "a%00b"]) {
      const res = await api(one(id), { cookie });
      expect(res.status, id).toBe(404);
      expect(res.json.error.code).toBe("NOT_FOUND");
    }
  });
});

test.describe("PATCH (rename)", () => {
  test("renames, keeps the code, and audits the before and after", async () => {
    const branch = await newBranch("Old name");
    const { user, cookie } = await as({ role: Role.ADMIN });
    const name = unique("New name");
    const res = await api(one(branch.id), { method: "PATCH", body: { name: `  ${name}  ` }, cookie });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ changed: true, branch: { id: branch.id, name, code: branch.code } });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "BRANCH_RENAMED", targetId: branch.id } });
    expect(audit).toMatchObject({ actorUserId: user.id, beforeValue: { name: branch.name }, afterValue: { name } });
    expect((await db.branch.findUniqueOrThrow({ where: { id: branch.id } })).code).toBe(branch.code);
  });

  test("the same name is a success that changed nothing (no audit row); a taken name is 409", async () => {
    const branch = await newBranch();
    const other = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    const same = await api(one(branch.id), { method: "PATCH", body: { name: branch.name }, cookie });
    expect(same.json.data.changed).toBe(false);
    expect(await db.auditLog.count({ where: { action: "BRANCH_RENAMED", targetId: branch.id } })).toBe(0);
    const taken = await api(one(branch.id), { method: "PATCH", body: { name: other.name }, cookie });
    expect(taken.status).toBe(409);
    expect(taken.json.error.code).toBe("DUPLICATE_NAME");
    expect((await db.branch.findUniqueOrThrow({ where: { id: branch.id } })).name).toBe(branch.name);
  });

  test("a blank, over-long, missing or extra field is refused; the code cannot be set; an unknown branch is 404", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    for (const body of [
      { name: "   " },
      { name: "x".repeat(101) },
      {},
      { name: 42 },
      { name: "Fine", code: "ABC" },
      { name: "Fine", id: "x" },
    ]) {
      const res = await api(one(branch.id), { method: "PATCH", body, cookie });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await db.branch.findUniqueOrThrow({ where: { id: branch.id } })).name).toBe(branch.name);
    expect((await api(one("nope"), { method: "PATCH", body: { name: "Fine" }, cookie })).status).toBe(404);
  });
});

test.describe("DELETE", () => {
  test("an empty branch is deleted after its exact name is typed, and the deletion is audited", async () => {
    const branch = await newBranch();
    const { user, cookie } = await as({ role: Role.ADMIN });
    const res = await api(one(branch.id), { method: "DELETE", body: { confirmName: `  ${branch.name} ` }, cookie });
    expect(res.status).toBe(200);
    expect(res.json.data.deleted).toEqual({ id: branch.id, name: branch.name });
    expect(await db.branch.count({ where: { id: branch.id } })).toBe(0);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "BRANCH_DELETED", targetId: branch.id } });
    expect(audit).toMatchObject({ actorUserId: user.id, beforeValue: { name: branch.name, code: branch.code } });
  });

  test("a wrong name, a missing name and an extra field delete nothing", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    for (const body of [
      { confirmName: "" },
      { confirmName: branch.name.toLowerCase() },
      { confirmName: "something else" },
      {},
      { confirmName: branch.name, force: true },
    ]) {
      const res = await api(one(branch.id), { method: "DELETE", body, cookie });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await db.branch.count({ where: { id: branch.id } })).toBe(1);
  });

  test("a branch with a pupil, a member or a result-bearing record is refused with what it holds, and nothing is removed", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "Musa",
        lastName: "Bello",
        gender: "MALE",
        dateOfBirth: new Date("2013-12-01"),
        admissionNo: unique("ADM"),
      },
    });
    await db.classGroup.create({ data: { branchId: branch.id, name: "Kept" } });
    const res = await api(one(branch.id), { method: "DELETE", body: { confirmName: branch.name }, cookie });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("BRANCH_NOT_EMPTY");
    expect(res.json.error.message).toContain("1 pupils");
    expect(await db.branch.count({ where: { id: branch.id } })).toBe(1);
    expect(await db.classGroup.count({ where: { branchId: branch.id } })).toBe(1);
    expect(await db.studentRecord.count({ where: { branchId: branch.id } })).toBe(1);
  });

  test("an active member blocks; once deactivated, the membership goes with the branch and the person's account stays", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    const member = await createUser({ role: Role.TEACHING_STAFF });
    await db.membership.updateMany({ where: { userId: member.id }, data: { branchId: branch.id } });
    expect((await api(one(branch.id), { method: "DELETE", body: { confirmName: branch.name }, cookie })).status).toBe(409);
    await db.membership.updateMany({ where: { userId: member.id }, data: { deactivatedAt: new Date() } });
    const res = await api(one(branch.id), { method: "DELETE", body: { confirmName: branch.name }, cookie });
    expect(res.status).toBe(200);
    expect(await db.membership.count({ where: { userId: member.id } })).toBe(0);
    expect(await db.user.count({ where: { id: member.id } })).toBe(1);
  });

  test("set-up goes with the branch and the answer lists it", async () => {
    const branch = await newBranch();
    const { cookie } = await as({ role: Role.ADMIN });
    await db.classGroup.createMany({
      data: [
        { branchId: branch.id, name: "A" },
        { branchId: branch.id, name: "B" },
      ],
    });
    const res = await api(one(branch.id), { method: "DELETE", body: { confirmName: branch.name }, cookie });
    expect(res.status).toBe(200);
    expect(res.json.data.removedWithIt).toEqual([{ label: "classes", count: 2, blocks: false }]);
    expect(await db.classGroup.count({ where: { branchId: branch.id } })).toBe(0);
  });

  test("an unknown branch is 404", async () => {
    const { cookie } = await as({ role: Role.ADMIN });
    expect((await api(one("nope"), { method: "DELETE", body: { confirmName: "x" }, cookie })).status).toBe(404);
  });
});
