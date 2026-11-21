import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0127 over real HTTP: the branch a person last chose is kept on their own record. Only a branch they belong to (a superadmin: any); another branch, an unknown id and a stranger's request
// give nothing away; signed out is 401; a strict body.

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
const asUser = async (branchIds: string[], superAdmin = false) => {
  const user = await createUser({ superAdmin });
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role: Role.TEACHING_STAFF } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const put = (cookie: string | undefined, body: unknown) => api("/api/v1/account/branch", { method: "PUT", cookie, body });
const stored = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).lastBranchId;

test("a person's choice is kept on their own record and changes only their own", async () => {
  const a = await asUser([home.id, other.id]);
  const b = await asUser([home.id]);
  expect((await put(a.cookie, { branchId: other.id })).status).toBe(200);
  expect(await stored(a.user.id)).toBe(other.id);
  expect(await stored(b.user.id)).toBeNull();
  expect((await put(a.cookie, { branchId: home.id })).json.data.branchId).toBe(home.id);
  expect(await stored(a.user.id)).toBe(home.id);
});

test("a branch the person does not belong to, an unknown id and a deactivated membership are 404 and change nothing; a superadmin may keep any branch", async () => {
  const a = await asUser([home.id]);
  expect((await put(a.cookie, { branchId: other.id })).status).toBe(404);
  expect((await put(a.cookie, { branchId: "nope" })).status).toBe(404);
  await db.membership.updateMany({ where: { userId: a.user.id }, data: { deactivatedAt: new Date() } });
  expect((await put(a.cookie, { branchId: home.id })).status).toBe(404);
  expect(await stored(a.user.id)).toBeNull();
  // A superadmin counts while they hold an active membership somewhere (as signing in does).
  const su = await asUser([home.id], true);
  expect((await put(su.cookie, { branchId: other.id })).status).toBe(200);
  expect(await stored(su.user.id)).toBe(other.id);
});

test("signed out is 401; a strict body: an extra key, an empty id and no body are 400", async () => {
  expect((await put(undefined, { branchId: home.id })).status).toBe(401);
  const a = await asUser([home.id]);
  expect((await put(a.cookie, { branchId: home.id, userId: "x" })).status).toBe(400);
  expect((await put(a.cookie, { branchId: "" })).status).toBe(400);
  expect((await put(a.cookie, {})).status).toBe(400);
});
