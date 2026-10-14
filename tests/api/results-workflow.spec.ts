import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";

// The results review workflow over real HTTP (Slice P2b): DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED -> LOCKED with the back-steps and the unlock. Who may do each
// step, no self-approval (except a superadmin), all-or-nothing batches, a verification token only while published, a history row for every step.

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
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const SHEETS = "/api/v1/academics/result-sheets";
const TRANSITION = "/api/v1/academics/results/transition";
type World = Awaited<ReturnType<typeof resultsWorld>>;
const sheet = (w: World, entries: object[]) => ({ periodId: w.period.id, classArmId: w.arm.id, subjectId: w.subject.id, entries });
const entry = (studentId: string, exam = 40) => ({ studentId, parts: { "Test 1": 15, "Test 2": 10 }, exam });
const go = (cookie: string, action: string, resultIds: string[], reason?: string) =>
  api(TRANSITION, { method: "POST", cookie, body: { action, resultIds, ...(reason ? { reason } : {}) } });
const statusOf = async (id: string) => (await db.result.findUniqueOrThrow({ where: { id } })).status;
const addStudent = async (w: World, n: number) => {
  const s = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: `Pupil${n}`,
      lastName: "Test",
      gender: "MALE",
      dateOfBirth: new Date("2012-01-01"),
      admissionNo: `ADM/W/${n}-${Math.random()}`,
    },
  });
  await db.studentEnrollment.create({
    data: { branchId: home.id, studentId: s.id, sessionId: w.session.id, className: w.group.name, arm: "A", classArmId: w.arm.id },
  });
  return s;
};
const assigned = async (w: World) => {
  const t = await asRole(Role.TEACHING_STAFF);
  const staff = await db.staffRecord.create({
    data: { branchId: home.id, userId: t.user.id, category: "TEACHING", firstName: "Tola", lastName: "Ade" },
  });
  await db.staffSubjectAssignment.create({
    data: { branchId: home.id, staffRecordId: staff.id, subjectId: w.subject.id, classArmId: w.arm.id },
  });
  return t;
};
/// Results entered by `cookie` for the world's students.
const enter = async (w: World, cookie: string, students: { id: string }[]) => {
  expect(
    (
      await api(SHEETS, {
        method: "PUT",
        cookie,
        body: sheet(
          w,
          students.map((s) => entry(s.id)),
        ),
      })
    ).status,
  ).toBe(200);
  return (await db.result.findMany({ where: { periodId: w.period.id }, orderBy: { id: "asc" } })).map((r) => r.id);
};

test.describe("the whole road", () => {
  test("a teacher enters and submits; a DIFFERENT administrator approves, publishes (token and hash), locks; unlock needs a reason and clears the token; every step is in the history", async () => {
    const w = await resultsWorld(home.id);
    const teacher = await assigned(w);
    const ids = await enter(w, teacher.cookie, [w.student]);
    const admin = await asRole(Role.ADMIN);

    expect((await go(teacher.cookie, "submit", ids)).json.data).toMatchObject({ count: 1, status: "SUBMITTED" });
    expect((await go(admin.cookie, "approve", ids)).status).toBe(200);
    const published = await go(admin.cookie, "publish", ids);
    expect(published.json.data.status).toBe("PUBLISHED");
    const row = await db.result.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(row.verificationToken).toHaveLength(43);
    expect(row.verificationHash).toMatch(/^[0-9a-f]{64}$/);
    expect([row.submittedByUserId, row.approvedByUserId]).toEqual([teacher.user.id, admin.user.id]);
    expect((await go(admin.cookie, "lock", ids)).status).toBe(200);
    expect(await statusOf(ids[0])).toBe("LOCKED");

    expect((await go(admin.cookie, "unlock", ids)).status).toBe(409); // a reason is required
    expect((await go(admin.cookie, "unlock", ids, "no")).status).toBe(409); // ... of a few words at least
    expect((await go(admin.cookie, "unlock", ids, "Exam mark mis-keyed for one pupil")).status).toBe(200);
    const unlocked = await db.result.findUniqueOrThrow({ where: { id: ids[0] } });
    expect([unlocked.status, unlocked.verificationToken, unlocked.verificationHash, unlocked.publishedAt, unlocked.lockedAt]).toEqual([
      "APPROVED",
      null,
      null,
      null,
      null,
    ]);

    const history = (await api(`/api/v1/academics/results/${ids[0]}/history`, { cookie: admin.cookie })).json.data.history;
    expect(history.map((h: { action: string }) => h.action)).toEqual(["ENTERED", "SUBMIT", "APPROVE", "PUBLISH", "LOCK", "UNLOCK"]);
    expect(history.at(-1)).toMatchObject({ fromStatus: "LOCKED", toStatus: "APPROVED", reason: "Exam mark mis-keyed for one pupil" });
  });

  test("two published results get different tokens; a returned result can be edited again, an approved one cannot", async () => {
    const w = await resultsWorld(home.id);
    const second = await addStudent(w, 2);
    const teacher = await assigned(w);
    const admin = await asRole(Role.ADMIN);
    const ids = await enter(w, teacher.cookie, [w.student, second]);
    await go(teacher.cookie, "submit", ids);
    await go(admin.cookie, "approve", ids);
    const edit = await api(SHEETS, { method: "PUT", cookie: teacher.cookie, body: sheet(w, [entry(w.student.id, 10)]) });
    expect(edit.status).toBe(409); // approved: content frozen
    await go(admin.cookie, "publish", ids);
    const tokens = (await db.result.findMany({ where: { id: { in: ids } } })).map((r) => r.verificationToken);
    expect(new Set(tokens).size).toBe(2);

    await go(admin.cookie, "unlock", ids, "Re-open for a correction");
    await go(admin.cookie, "revert", ids);
    await go(admin.cookie, "return", ids);
    expect(await statusOf(ids[0])).toBe("DRAFT");
    const row = await db.result.findUniqueOrThrow({ where: { id: ids[0] } });
    expect([row.submittedAt, row.submittedByUserId, row.approvedAt, row.approvedByUserId]).toEqual([null, null, null, null]);
    expect((await api(SHEETS, { method: "PUT", cookie: teacher.cookie, body: sheet(w, [entry(w.student.id, 10)]) })).status).toBe(200); // a draft again
  });
});

test.describe("who may do what", () => {
  test("only the author (or an administrator) submits; a teacher cannot do an administrator's step; staff who are not teachers or administrators are refused", async () => {
    const w = await resultsWorld(home.id);
    const author = await assigned(w);
    const colleague = await assigned(w);
    const ids = await enter(w, author.cookie, [w.student]);
    const clerk = await asRole(Role.NON_TEACHING_STAFF);
    const parent = await asRole(Role.PARENT);
    expect((await go(colleague.cookie, "submit", ids)).status).toBe(403); // another teacher cannot submit your results
    expect((await go(clerk.cookie, "submit", ids)).status).toBe(403);
    expect((await go(parent.cookie, "submit", ids)).status).toBe(403);
    expect((await go("", "submit", ids)).status).toBe(401);
    expect(await statusOf(ids[0])).toBe("DRAFT");
    expect((await go(author.cookie, "submit", ids)).status).toBe(200);
    for (const action of ["approve", "return", "revert", "publish", "lock"])
      expect((await go(author.cookie, action, ids)).status).toBe(403); // not even your own
    expect((await go(author.cookie, "unlock", ids, "I would like to")).status).toBe(403);
    expect(await statusOf(ids[0])).toBe("SUBMITTED");
    const admin = await asRole(Role.ADMIN);
    expect((await go(admin.cookie, "return", ids)).status).toBe(200);
    expect((await go(admin.cookie, "submit", ids)).status).toBe(200); // an administrator may submit anyone's
  });

  test("no self-approval: an administrator cannot approve results they entered or submitted - another administrator or a superadmin can", async () => {
    const w = await resultsWorld(home.id);
    const mine = await asRole(Role.ADMIN);
    const ids = await enter(w, mine.cookie, [w.student]);
    await go(mine.cookie, "submit", ids);
    const refused = await go(mine.cookie, "approve", ids);
    expect([refused.status, refused.json.error.code]).toEqual([403, "FORBIDDEN"]);
    // entered by a TEACHER but submitted by this administrator: still not theirs to approve
    const second = await addStudent(w, 2);
    const teacher = await assigned(w);
    expect((await api(SHEETS, { method: "PUT", cookie: teacher.cookie, body: sheet(w, [entry(second.id)]) })).status).toBe(200);
    const secondId = (await db.result.findFirstOrThrow({ where: { studentId: second.id } })).id;
    expect((await go(mine.cookie, "submit", [secondId])).status).toBe(200);
    expect((await go(mine.cookie, "approve", [secondId])).status).toBe(403);
    const another = await asRole(Role.ADMIN);
    expect((await go(another.cookie, "approve", ids)).status).toBe(200);

    await go(another.cookie, "revert", ids);
    await db.user.update({ where: { id: mine.user.id }, data: { isSuperAdmin: true } });
    expect((await go(mine.cookie, "approve", ids)).status).toBe(200); // a superadmin may finish what they started
  });
});

test.describe("rules of the machine", () => {
  test("a step from the wrong status is a 409, and a batch is all or nothing", async () => {
    const w = await resultsWorld(home.id);
    const second = await addStudent(w, 2);
    const teacher = await assigned(w);
    const admin = await asRole(Role.ADMIN);
    const [a, b] = await enter(w, teacher.cookie, [w.student, second]);
    expect((await go(admin.cookie, "approve", [a])).status).toBe(409); // a draft cannot be approved
    expect((await go(admin.cookie, "publish", [a])).status).toBe(409);
    await go(teacher.cookie, "submit", [a]); // only one of the two is submitted
    const mixed = await go(admin.cookie, "approve", [a, b]);
    expect([mixed.status, mixed.json.error.code]).toEqual([409, "CONFLICT"]);
    expect([await statusOf(a), await statusOf(b)]).toEqual(["SUBMITTED", "DRAFT"]); // nothing moved
    expect(await db.resultAudit.count({ where: { action: "APPROVE" } })).toBe(0);
  });

  test("unknown ids, ids of another branch and ids of two branches are one and the same 404; another branch's administrator cannot read the history", async () => {
    const w = await resultsWorld(home.id);
    const admin = await asRole(Role.ADMIN);
    const ids = await enter(w, admin.cookie, [w.student]);
    const foreign = await asRole(Role.ADMIN, other.id);
    const theirs = await resultsWorld(other.id);
    const theirIds = await (async () => {
      expect((await api(SHEETS, { method: "PUT", cookie: foreign.cookie, body: sheet(theirs, [entry(theirs.student.id)]) })).status).toBe(
        200,
      );
      return (await db.result.findMany({ where: { branchId: other.id } })).map((r) => r.id);
    })();
    const a = await go(foreign.cookie, "submit", ids);
    const b = await go(admin.cookie, "submit", ["nope"]);
    const c = await go(admin.cookie, "submit", [...ids, ...theirIds]);
    expect([a.status, b.status, c.status]).toEqual([404, 404, 404]);
    expect(a.json).toEqual(b.json);
    expect(await statusOf(ids[0])).toBe("DRAFT");
    expect((await api(`/api/v1/academics/results/${ids[0]}/history`, { cookie: foreign.cookie })).status).toBe(404);
    const teacher = await assigned(w);
    expect((await api(`/api/v1/academics/results/${ids[0]}/history`, { cookie: teacher.cookie })).status).toBe(403); // administrators only: the role guard refuses a teacher at the door, like every admin route
  });

  test("validation: no ids, too many, an unknown action and extra fields are 400", async () => {
    const admin = await asRole(Role.ADMIN);
    for (const body of [
      { action: "submit", resultIds: [] },
      { action: "explode", resultIds: ["x"] },
      { action: "submit", resultIds: ["x"], extra: 1 },
      { resultIds: ["x"] },
    ]) {
      expect((await api(TRANSITION, { method: "POST", cookie: admin.cookie, body })).status).toBe(400);
    }
  });

  test("the review queue counts results by status for each arm and subject, for administrators of the branch only", async () => {
    const w = await resultsWorld(home.id);
    const second = await addStudent(w, 2);
    const teacher = await assigned(w);
    const admin = await asRole(Role.ADMIN);
    const [a] = await enter(w, teacher.cookie, [w.student, second]);
    await go(teacher.cookie, "submit", [a]);
    const queue = (await api(`/api/v1/academics/results/queue?branchId=${home.id}&periodId=${w.period.id}`, { cookie: admin.cookie })).json
      .data.queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ classArmId: w.arm.id, subjectId: w.subject.id, counts: { DRAFT: 1, SUBMITTED: 1 } });
    expect(
      (await api(`/api/v1/academics/results/queue?branchId=${home.id}&periodId=${w.period.id}`, { cookie: teacher.cookie })).status,
    ).toBe(403);
    const foreign = await asRole(Role.ADMIN, other.id);
    expect(
      (await api(`/api/v1/academics/results/queue?branchId=${home.id}&periodId=${w.period.id}`, { cookie: foreign.cookie })).status,
    ).toBe(404);
  });
});
