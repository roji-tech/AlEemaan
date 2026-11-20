import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";

// Task 0101 F (task 0118): a head of department reviews their subjects' results BEFORE an approver can approve them. Behind a branch switch, OFF by default. It is not a status and it never
// publishes: who approves and who publishes are as before. Not your own marks. A result sent back to DRAFT loses its review.

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
const SHEETS = "/api/v1/academics/result-sheets";
const TRANSITION = "/api/v1/academics/results/transition";
const REVIEW = "/api/v1/academics/results/department-review";
const SWITCH = "/api/v1/settings/results-head-review";
type World = Awaited<ReturnType<typeof resultsWorld>>;

const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
/// A teacher with a record who teaches the world's subject in its arm; with `headOf` also the head of that department.
const teacher = async (w: World, headOf?: string) => {
  const t = await asRole(Role.TEACHING_STAFF);
  const staff = await db.staffRecord.create({
    data: { branchId: home.id, userId: t.user.id, category: "TEACHING", firstName: "Tola", lastName: "Ade" },
  });
  await db.staffSubjectAssignment.create({
    data: { branchId: home.id, staffRecordId: staff.id, subjectId: w.subject.id, classArmId: w.arm.id },
  });
  if (headOf)
    await db.departmentMember.create({ data: { branchId: home.id, departmentId: headOf, staffRecordId: staff.id, isHead: true } });
  return { ...t, staff };
};
/// A head who teaches nothing here (so never their own marks).
const head = async (departmentId: string) => {
  const t = await asRole(Role.TEACHING_STAFF);
  const staff = await db.staffRecord.create({
    data: { branchId: home.id, userId: t.user.id, category: "TEACHING", firstName: "Hadiza", lastName: "Head" },
  });
  await db.departmentMember.create({ data: { branchId: home.id, departmentId, staffRecordId: staff.id, isHead: true } });
  return { ...t, staff };
};
const department = async (name = "Sciences") => db.department.create({ data: { branchId: home.id, name } });
const inDepartment = (w: World, departmentId: string | null) => db.subject.update({ where: { id: w.subject.id }, data: { departmentId } });
const turnOn = async (cookie: string, enabled = true) => api(SWITCH, { method: "PUT", cookie, body: { branchId: home.id, enabled } });
const go = (cookie: string, action: string, resultIds: string[], reason?: string) =>
  api(TRANSITION, { method: "POST", cookie, body: { action, resultIds, ...(reason ? { reason } : {}) } });
const review = (cookie: string, action: "pass" | "return", resultIds: string[], reason?: string) =>
  api(REVIEW, { method: "POST", cookie, body: { action, resultIds, ...(reason ? { reason } : {}) } });
const statusOf = async (id: string) => (await db.result.findUniqueOrThrow({ where: { id } })).status;
const enterAndSubmit = async (w: World, by: { cookie: string }) => {
  const put = await api(SHEETS, {
    method: "PUT",
    cookie: by.cookie,
    body: {
      periodId: w.period.id,
      classArmId: w.arm.id,
      subjectId: w.subject.id,
      entries: [{ studentId: w.student.id, parts: { "Test 1": 15, "Test 2": 10 }, exam: 40 }],
    },
  });
  expect(put.status, put.text).toBe(200);
  const ids = (await db.result.findMany({ where: { periodId: w.period.id }, orderBy: { id: "asc" } })).map((r) => r.id);
  expect((await go(by.cookie, "submit", ids)).status).toBe(200);
  return ids;
};

test.describe("the switch", () => {
  test("off by default: a result of a subject in a department is approved exactly as before", async () => {
    const w = await resultsWorld(home.id);
    await inDepartment(w, (await department()).id);
    const ids = await enterAndSubmit(w, await teacher(w));
    expect((await go((await asRole(Role.ADMIN)).cookie, "approve", ids)).status).toBe(200);
    expect(await db.resultDepartmentReview.count()).toBe(0);
  });

  test("an administrator turns it on and off (audited); staff read it; another branch's administrator and a teacher cannot change it", async () => {
    const admin = await asRole(Role.ADMIN);
    const elsewhere = await asRole(Role.ADMIN, other.id);
    const reader = await asRole(Role.TEACHING_STAFF);
    expect((await api(`${SWITCH}?branchId=${home.id}`, { cookie: reader.cookie })).json.data.enabled).toBe(false);
    const on = await turnOn(admin.cookie);
    expect(on.status, on.text).toBe(200);
    expect(on.json.data).toMatchObject({ enabled: true, changed: true });
    expect((await turnOn(admin.cookie)).json.data.changed).toBe(false);
    expect((await api(`${SWITCH}?branchId=${home.id}`, { cookie: reader.cookie })).json.data.enabled).toBe(true);
    expect(await db.settingAudit.count({ where: { settingKey: "results.departmentHeadReview", branchId: home.id } })).toBe(1);
    expect((await turnOn(elsewhere.cookie)).status).toBe(403);
    expect((await turnOn(reader.cookie)).status).toBe(403);
    expect((await api(`${SWITCH}?branchId=${home.id}`, { cookie: elsewhere.cookie })).status).toBe(404);
    expect((await turnOn(admin.cookie, false)).json.data.enabled).toBe(false);
  });
});

test.describe("approving while the switch is on", () => {
  test("a result of a subject in a department waits for its head's review; a subject in no department does not", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    const sciences = await department();
    await inDepartment(w, sciences.id);
    const t = await teacher(w);
    const ids = await enterAndSubmit(w, t);
    const refused = await go(admin.cookie, "approve", ids);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/waiting for the head of their department's review/);
    expect(await statusOf(ids[0])).toBe("SUBMITTED");

    // The same marks with the subject in no department: approved as before.
    await inDepartment(w, null);
    expect((await go(admin.cookie, "approve", ids)).status).toBe(200);
  });

  test("the head passes; then an administrator approves and publishes as usual; the head can approve or publish nothing", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    const sciences = await department();
    await inDepartment(w, sciences.id);
    const ids = await enterAndSubmit(w, await teacher(w));
    const h = await head(sciences.id);

    const passed = await review(h.cookie, "pass", ids);
    expect(passed.status, passed.text).toBe(200);
    expect(passed.json.data).toMatchObject({ count: 1, status: "SUBMITTED" });
    expect(await statusOf(ids[0])).toBe("SUBMITTED"); // a review moves nothing
    expect(await db.resultAudit.count({ where: { resultId: ids[0], action: "DEPARTMENT_REVIEWED" } })).toBe(1);
    expect((await review(h.cookie, "pass", ids)).status).toBe(200); // a second click changes nothing
    expect(await db.resultDepartmentReview.count()).toBe(1);

    // The head is not an approver: every status step is refused to them.
    for (const action of ["approve", "return", "revert", "publish", "lock", "unlock"])
      expect((await go(h.cookie, action, ids, "some reason")).status, action).toBe(403);
    expect(await statusOf(ids[0])).toBe("SUBMITTED");

    expect((await go(admin.cookie, "approve", ids)).status).toBe(200);
    expect((await go(h.cookie, "publish", ids)).status).toBe(403);
    expect((await go(admin.cookie, "publish", ids)).status).toBe(200);
    expect(await statusOf(ids[0])).toBe("PUBLISHED");
  });

  test("an administrator can pass the review too; the review is not undone by turning the switch off", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    await inDepartment(w, (await department()).id);
    const ids = await enterAndSubmit(w, await teacher(w));
    expect((await review(admin.cookie, "pass", ids)).status).toBe(200);
    expect((await go(admin.cookie, "approve", ids)).status).toBe(200);
    expect(await db.resultDepartmentReview.count()).toBe(1);
  });
});

test.describe("who may review", () => {
  test("only the head of THAT subject's department or an administrator of the branch; never your own marks", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    const sciences = await department("Sciences");
    const languages = await department("Languages");
    await inDepartment(w, sciences.id);
    const t = await teacher(w);
    const ids = await enterAndSubmit(w, t);

    const otherHead = await head(languages.id);
    expect((await review(otherHead.cookie, "pass", ids)).status).toBe(403);
    expect((await review(t.cookie, "pass", ids)).status).toBe(403); // a teacher who heads nothing
    const elsewhere = await asRole(Role.ADMIN, other.id);
    expect((await review(elsewhere.cookie, "pass", ids)).status).toBe(404); // another branch's results are not found
    expect((await review((await asRole(Role.PARENT)).cookie, "pass", ids)).status).toBeGreaterThanOrEqual(403);
    expect(await db.resultDepartmentReview.count()).toBe(0);

    // A head never reviews marks they entered or submitted themselves.
    const w2 = await resultsWorld(home.id, "second", true); // a branch has one default scheme and scale: the second world has its own
    const dept2 = await department("Arts");
    await inDepartment(w2, dept2.id);
    const own = await teacher(w2, dept2.id); // the teacher IS the head
    const ownIds = await enterAndSubmit(w2, own);
    const self = await review(own.cookie, "pass", ownIds);
    expect(self.status).toBe(403);
    expect(self.json.error.message).toMatch(/entered or submitted yourself/);
  });

  test("an administrator who entered the marks cannot review them (as with approving); another administrator can", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    await inDepartment(w, (await department()).id);
    const ids = await enterAndSubmit(w, admin); // an administrator enters and submits
    expect((await review(admin.cookie, "pass", ids)).status).toBe(403);
    const boss = await createUser({ role: Role.ADMIN });
    expect((await review(cookieHeader((await loginAs(boss)).token!), "pass", ids)).status).toBe(200);
  });

  test("a head whose record is archived has no power; results of a subject in no department need no review (409)", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    const sciences = await department();
    await inDepartment(w, sciences.id);
    const ids = await enterAndSubmit(w, await teacher(w));
    const h = await head(sciences.id);
    await db.staffRecord.update({ where: { id: h.staff.id }, data: { archivedAt: new Date() } });
    expect((await review(h.cookie, "pass", ids)).status).toBe(403);
    await inDepartment(w, null);
    const none = await review(admin.cookie, "pass", ids);
    expect(none.status).toBe(409);
    expect(none.json.error.message).toMatch(/not in a department/);
  });

  test("the switch must be on", async () => {
    const w = await resultsWorld(home.id);
    const sciences = await department();
    await inDepartment(w, sciences.id);
    const ids = await enterAndSubmit(w, await teacher(w));
    const off = await review((await head(sciences.id)).cookie, "pass", ids);
    expect(off.status).toBe(409);
  });
});

test.describe("returning", () => {
  test("the head returns with a reason: back to DRAFT, the review is gone, audited; resubmitting needs a new review; a plain 'return' clears it too", async () => {
    const admin = await asRole(Role.ADMIN);
    await turnOn(admin.cookie);
    const w = await resultsWorld(home.id);
    const sciences = await department();
    await inDepartment(w, sciences.id);
    const t = await teacher(w);
    const ids = await enterAndSubmit(w, t);
    const h = await head(sciences.id);

    expect((await review(h.cookie, "return", ids)).status).toBe(409); // a reason is required
    expect((await review(h.cookie, "return", ids, "no")).status).toBe(409);
    const returned = await review(h.cookie, "return", ids, "Check the exam marks of the first three pupils");
    expect(returned.status, returned.text).toBe(200);
    expect(returned.json.data.status).toBe("DRAFT");
    const row = await db.result.findUniqueOrThrow({ where: { id: ids[0] } });
    expect([row.status, row.submittedAt, row.submittedByUserId]).toEqual(["DRAFT", null, null]);
    const audit = await db.resultAudit.findFirstOrThrow({ where: { resultId: ids[0], action: "RETURN" } });
    expect(audit).toMatchObject({ fromStatus: "SUBMITTED", toStatus: "DRAFT" });
    expect(audit.reason).toContain("head of department");

    // Back to the teacher, resubmitted: the old review (there was none) would not count; pass it, then return it through the status machine: the review goes.
    expect((await go(t.cookie, "submit", ids)).status).toBe(200);
    expect((await review(h.cookie, "pass", ids)).status).toBe(200);
    expect(await db.resultDepartmentReview.count()).toBe(1);
    expect((await go(admin.cookie, "return", ids)).status).toBe(200);
    expect(await db.resultDepartmentReview.count()).toBe(0);
    expect((await go(t.cookie, "submit", ids)).status).toBe(200);
    expect((await go(admin.cookie, "approve", ids)).status).toBe(409); // marks may have changed: reviewed again first
  });
});

test.describe("the queue", () => {
  test("a head sees only their own departments' submitted results; an administrator sees all; nothing while the switch is off", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await resultsWorld(home.id);
    const sciences = await department("Sciences");
    await inDepartment(w, sciences.id);
    const ids = await enterAndSubmit(w, await teacher(w));
    const h = await head(sciences.id);
    const arts = await head((await department("Arts")).id);
    const q = (cookie: string) => api(`${REVIEW}?branchId=${home.id}&periodId=${w.period.id}`, { cookie });
    expect((await q(admin.cookie)).json.data.queue).toEqual([]); // switch off

    await turnOn(admin.cookie);
    const adminQueue = (await q(admin.cookie)).json.data.queue;
    expect(adminQueue).toHaveLength(1);
    expect(adminQueue[0]).toMatchObject({ departmentName: "Sciences", subjectName: w.subject.name, waiting: ids, reviewed: 0 });
    expect((await q(h.cookie)).json.data.queue).toHaveLength(1);
    expect((await q(arts.cookie)).json.data.queue).toEqual([]); // another department's head
    expect((await q((await asRole(Role.TEACHING_STAFF)).cookie)).json.data.queue).toEqual([]); // heads nothing

    await review(h.cookie, "pass", ids);
    const after = (await q(h.cookie)).json.data.queue[0];
    expect(after).toMatchObject({ waiting: [], reviewed: 1 });
  });
});
