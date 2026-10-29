import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Who may READ a branch's fees and invoices (found by the browser security run, 2026-10-19): the list of invoices and of fee structures answered any signed-in
// staff member for ANY branch, and one invoice (and starting a payment on it) answered any signed-in account by id. It is an administrator of that branch's,
// or a superadmin's: nobody else sees pupils' names and what their families owe.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });
});

const as = async (role: Role, branchId: string, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const reads = (b: string) => [`/api/v1/finance/invoices?branchId=${b}`, `/api/v1/finance/fee-structures?branchId=${b}`];

test("a teacher or a non-teaching staff member cannot read fees or invoices, in any branch", async () => {
  for (const role of [Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF]) {
    const who = await as(role, home.id);
    for (const url of [...reads(home.id), ...reads(other.id), `/api/v1/finance/invoices/anything?branchId=${home.id}`]) {
      expect((await api(url, { cookie: who.cookie })).status, `${role} ${url}`).toBe(403);
    }
    const pay = await api(`/api/v1/finance/invoices/anything/pay?branchId=${home.id}`, {
      method: "POST",
      cookie: who.cookie,
      body: { email: "a@b.co" },
    });
    expect(pay.status).toBe(403);
  }
});

test("an administrator reads their own branch's fees and invoices and is refused another branch's", async () => {
  const admin = await as(Role.ADMIN, home.id);
  for (const url of reads(home.id)) expect((await api(url, { cookie: admin.cookie })).status, url).toBe(200);
  for (const url of reads(other.id)) expect((await api(url, { cookie: admin.cookie })).status, url).toBe(403);
  expect((await api(`/api/v1/finance/invoices/anything?branchId=${other.id}`, { cookie: admin.cookie })).status).toBe(404);
  const pay = await api(`/api/v1/finance/invoices/anything/pay?branchId=${other.id}`, {
    method: "POST",
    cookie: admin.cookie,
    body: { email: "a@b.co" },
  });
  expect(pay.status).toBe(404);
});

test("a superadmin reads any branch", async () => {
  const sup = await as(Role.ADMIN, home.id, true);
  for (const b of [home.id, other.id]) for (const url of reads(b)) expect((await api(url, { cookie: sup.cookie })).status, url).toBe(200);
});
