import "../support/env";
import { test, expect } from "@playwright/test";
import { Permission, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// "Who can read form results?" on the Users page: the member list takes `readsFormResults=true` and returns only the people who hold CAN_VIEW_FORM_RESULTS, inside the caller's own scope
// (a superadmin: everyone; a branch administrator: the people of their own branches), together with the other filters. Until now the audit log was the only record of who holds the grant.

let home: { id: string };
let other: { id: string };
let superCookie: string;
let adminCookie: string;
let clerkCookie: string;
let people: { clerk: TestUser; teacher: TestUser; plain: TestUser; elsewhere: TestUser; former: TestUser };

const cookieFor = async (user: TestUser) => {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
};
const give = (userId: string, branchId: string) =>
  db.membership.updateMany({ where: { userId, branchId }, data: { permissions: [Permission.CAN_VIEW_FORM_RESULTS] } });
const list = (cookie: string, query = "") => api(`/api/v1/members?${query}`, { cookie });
const userIds = (res: { json: { data: { members: Array<{ userId: string }> } } }) => res.json.data.members.map((m) => m.userId).sort();

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  const superAdmin = await createUser({ role: Role.ADMIN });
  const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
  const clerk = await createUser({ role: Role.NON_TEACHING_STAFF, superAdmin: false });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false });
  const plain = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false });
  const former = await createUser({ role: Role.NON_TEACHING_STAFF, superAdmin: false });
  const elsewhere = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: elsewhere.id, branchId: other.id, role: Role.NON_TEACHING_STAFF } });
  people = { clerk, teacher, plain, elsewhere, former };

  await give(clerk.id, home.id);
  await give(teacher.id, home.id);
  await give(elsewhere.id, other.id);
  await give(former.id, home.id);
  await db.membership.updateMany({ where: { userId: former.id, branchId: home.id }, data: { deactivatedAt: new Date() } });

  superCookie = await cookieFor(superAdmin);
  adminCookie = await cookieFor(branchAdmin);
  clerkCookie = await cookieFor(clerk);
});
test.afterAll(async () => {
  await resetDatabase();
});

test.describe("GET /api/v1/members?readsFormResults=true", () => {
  test("returns only the people who hold the grant, and says so for each (a superadmin sees every branch)", async () => {
    const all = await list(superCookie, "limit=100");
    expect(all.status).toBe(200);
    expect(userIds(all)).toEqual(expect.arrayContaining([people.plain.id, people.clerk.id, people.teacher.id, people.elsewhere.id]));

    const res = await list(superCookie, "readsFormResults=true&limit=100");
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(userIds(res)).toEqual([people.clerk.id, people.teacher.id, people.elsewhere.id].sort());
    expect(res.json.meta.total).toBe(3);
    for (const m of res.json.data.members) expect(m.canViewFormResults).toBe(true);
  });

  test("a branch administrator sees the holders of their own branches only", async () => {
    const res = await list(adminCookie, "readsFormResults=true&limit=100");
    expect(res.status).toBe(200);
    expect(userIds(res)).toEqual([people.clerk.id, people.teacher.id].sort());
  });

  test("it combines with the other filters: role, branch and status (a deactivated holder is listed only when asked for)", async () => {
    expect(userIds(await list(superCookie, `readsFormResults=true&role=${Role.TEACHING_STAFF}`))).toEqual([people.teacher.id]);
    expect(userIds(await list(superCookie, `readsFormResults=true&branchId=${other.id}`))).toEqual([people.elsewhere.id]);
    expect(userIds(await list(superCookie, "readsFormResults=true&status=deactivated"))).toEqual([people.former.id]);
    expect(userIds(await list(superCookie, "readsFormResults=true&status=all&limit=100"))).toEqual(
      [people.clerk.id, people.teacher.id, people.elsewhere.id, people.former.id].sort(),
    );
  });

  test("only `true` is accepted: anything else is a 400 and nothing is listed", async () => {
    for (const value of ["false", "1", "yes", "TRUE", ""]) {
      const res = await list(superCookie, `readsFormResults=${value}`);
      expect(res.status, value).toBe(400);
      expect(res.json.error.code, value).toBe("VALIDATION");
    }
  });

  test("it is still the administrators' list: staff get a 403, with or without the filter", async () => {
    expect((await list(clerkCookie, "readsFormResults=true")).status).toBe(403);
    expect((await list(clerkCookie)).status).toBe(403);
  });
});
