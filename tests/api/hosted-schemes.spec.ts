import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A school-wide scheme and an approved teacher's scheme live on a branch's AssessmentScheme row without being that branch's default. The "one live scheme per
// branch and class" rule used to count them, so each of these failed with a unique violation in a branch that already had its own default (found by the browser
// run, 2026-10-19). `hosted` marks them and the rule ignores them.

let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});

const as = async (role: Role, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const ownDefault = () => db.assessmentScheme.create({ data: { branchId: home.id, name: "Branch default", totalMax: 100, examMax: 60 } });
const body = (name: string) => ({ name, examMax: 70, components: [{ name: "CA", maxScore: 30 }] });

test("school-wide schemes can be created, twice, in a branch that already has its own default", async () => {
  await ownDefault();
  const sup = await as(Role.ADMIN, true);
  const first = await api("/api/v1/academics/schemes/global", {
    method: "POST",
    cookie: sup.cookie,
    body: { ...body("Global one"), branchId: home.id, isDefault: true },
  });
  expect(first.status).toBe(201);
  const second = await api("/api/v1/academics/schemes/global", {
    method: "POST",
    cookie: sup.cookie,
    body: { ...body("Global two"), branchId: home.id },
  });
  expect(second.status).toBe(201);
  expect(await db.assessmentScheme.count({ where: { branchId: home.id, hosted: true } })).toBe(2);
  expect(await db.assessmentScheme.count({ where: { branchId: home.id, hosted: false } })).toBe(1); // the branch's own default is untouched
});

test("a teacher's scheme can be approved in a branch that already has its own default, and the branch rule still holds", async () => {
  await ownDefault();
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Maths" } });
  const teacher = await as(Role.TEACHING_STAFF);
  const admin = await as(Role.ADMIN);
  const filed = await api("/api/v1/academics/schemes/teacher", {
    method: "POST",
    cookie: teacher.cookie,
    body: { branchId: home.id, subjectId: subject.id, ...body("Practical"), reason: "Practical work.", submitForApproval: true },
  });
  expect(filed.status).toBe(201);
  const pending = await db.settingApproval.findFirstOrThrow({ where: { branchId: home.id, status: "PENDING" } });
  const decided = await api(`/api/v1/settings/approval/${pending.id}`, {
    method: "PATCH",
    cookie: admin.cookie,
    body: { action: "APPROVE", decisionReason: "ok" },
  });
  expect(decided.status).toBe(200);
  expect(await db.assessmentScheme.count({ where: { branchId: home.id, hosted: true, name: "Practical" } })).toBe(1);
  // The rule that exists for a reason: a second live branch default is still refused by the database.
  await expect(
    db.assessmentScheme.create({ data: { branchId: home.id, name: "Second default", totalMax: 100, examMax: 60 } }),
  ).rejects.toThrow();
});
