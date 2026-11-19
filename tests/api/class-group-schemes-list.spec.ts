import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0112 (task 0108 D3): the Scheme levels section asked for each class's scheme one request at a time. GET /api/v1/academics/schemes/class-group?branchId= answers every live class of the
// branch with its scheme (or null) at once, to the same people who may read one class's scheme, and agrees with the one-class read.

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

const as = async (role: Role, branchId: string) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const list = (branchId: string) => `/api/v1/academics/schemes/class-group?branchId=${encodeURIComponent(branchId)}`;
const one = (id: string) => `/api/v1/academics/schemes/class-group/${id}`;

test("every live class in the list's order, each with its scheme or null, and the same as the one-class read", async () => {
  const jss1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 1 } });
  const jss2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2", sortOrder: 2 } });
  await db.classGroup.create({ data: { branchId: home.id, name: "Old class", sortOrder: 3, archivedAt: new Date() } });
  await db.classGroup.create({ data: { branchId: other.id, name: "Elsewhere", sortOrder: 0 } });
  const admin = await as(Role.ADMIN, home.id);
  const made = await api(one(jss2.id), {
    method: "POST",
    cookie: admin.cookie,
    body: { name: "JSS 2 Scheme", examMax: 60, components: [{ name: "CA", maxScore: 40 }] },
  });
  expect(made.status).toBe(201);

  for (const role of [Role.ADMIN, Role.TEACHING_STAFF]) {
    const who = role === Role.ADMIN ? admin : await as(role, home.id);
    const res = await api(list(home.id), { cookie: who.cookie });
    expect(res.status, role).toBe(200);
    const groups = res.json.data.classGroups as { id: string; name: string; scheme: { name: string; components: unknown[] } | null }[];
    expect(groups.map((g) => g.name)).toEqual(["JSS 1", "JSS 2"]);
    expect(groups[0].scheme).toBeNull();
    expect(groups[1].scheme?.name).toBe("JSS 2 Scheme");
    const single = await api(one(jss2.id), { cookie: who.cookie });
    expect(groups[1].scheme).toEqual(single.json.data.scheme);
    expect((await api(one(jss1.id), { cookie: who.cookie })).json.data.scheme).toBeNull();
  }
});

test("another branch is a 404 with nothing in it; no branch is a 400; nobody signed in is 401", async () => {
  await db.classGroup.create({ data: { branchId: other.id, name: "Elsewhere", sortOrder: 0 } });
  const admin = await as(Role.ADMIN, home.id);
  const foreign = await api(list(other.id), { cookie: admin.cookie });
  expect(foreign.status).toBe(404);
  expect(JSON.stringify(foreign.json)).not.toContain("Elsewhere");
  expect((await api("/api/v1/academics/schemes/class-group", { cookie: admin.cookie })).status).toBe(400);
  expect((await api(list(home.id))).status).toBe(401);
});
