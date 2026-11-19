import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A class with no assessment scheme yet is a normal state. The class-group scheme GET answered 404 "Scheme not found" for it (seen on production, 2026-11-19): the Academics screen treated that as
// "none yet", but every such class showed a red 404 in the browser's network tab. It is now a 200 with `scheme: null`; a class that does not exist, or that is another branch's, is still a 404.

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
const url = (id: string) => `/api/v1/academics/schemes/class-group/${id}`;

test("a class of the branch with no scheme yet answers 200 and scheme null, to an administrator and to a teacher", async () => {
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 1 } });
  for (const role of [Role.ADMIN, Role.TEACHING_STAFF]) {
    const who = await as(role, home.id);
    const res = await api(url(group.id), { cookie: who.cookie });
    expect(res.status, role).toBe(200);
    expect(res.json.data).toEqual({ scheme: null });
    expect(res.json.error).toBeNull();
  }
});

test("once the administrator sets a scheme it is returned as before", async () => {
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2", sortOrder: 2 } });
  const admin = await as(Role.ADMIN, home.id);
  const made = await api(url(group.id), {
    method: "POST",
    cookie: admin.cookie,
    body: {
      name: "JSS 2 Scheme",
      examMax: 60,
      components: [
        { name: "CA", maxScore: 20 },
        { name: "Project", maxScore: 20 },
      ],
    },
  });
  expect(made.status).toBe(201);
  const res = await api(url(group.id), { cookie: admin.cookie });
  expect(res.status).toBe(200);
  expect(res.json.data.scheme.name).toBe("JSS 2 Scheme");
  expect(res.json.data.scheme.components).toHaveLength(2);
});

test("a class that does not exist, or belongs to another branch, is still a 404 and says nothing about a scheme", async () => {
  const group = await db.classGroup.create({ data: { branchId: other.id, name: "Elsewhere", sortOrder: 1 } });
  const admin = await as(Role.ADMIN, home.id);
  const foreign = await api(url(group.id), { cookie: admin.cookie });
  expect(foreign.status).toBe(404);
  expect(foreign.json.data).toBeNull();
  const nobody = await api(url("no-such-class"), { cookie: admin.cookie });
  expect(nobody.status).toBe(404);
  expect(JSON.stringify(nobody.json)).not.toContain("Scheme");
});

test("nobody signed in, or a pupil, gets no answer about it", async () => {
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 3", sortOrder: 3 } });
  expect((await api(url(group.id))).status).toBe(401);
  const pupil = await as(Role.STUDENT, home.id);
  expect([401, 403, 404]).toContain((await api(url(group.id), { cookie: pupil.cookie })).status);
});
