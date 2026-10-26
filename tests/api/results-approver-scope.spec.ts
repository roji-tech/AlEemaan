import "../support/env";
import { test, expect } from "@playwright/test";
import { Permission } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";
import { UNSECTIONED_KEY, getUnsectionedClassApproval, setUnsectionedClassApproval } from "../../src/lib/academics/unsectioned-approval";

// Results are approved by assignment (task 0039, slice 1): an approver is a staff member who holds CAN_APPROVE_RESULTS and has been given somewhere to approve (the
// whole branch, a section, or a class). They act on the results in their scope, all of a batch or none of it, and never unlock. The review queue, a result's history and
// the sheet read by the review screen follow the same scope. An administrator is held to no scope.
//
// One branch, one term, three classes: JSS 1 and JSS 2 are in the section "Junior", SSS 1 is in none. Each class has one pupil with one SUBMITTED result.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});

const TRANSITION = "/api/v1/academics/results/transition";
const SHEETS = "/api/v1/academics/result-sheets";
const QUEUE = "/api/v1/academics/results/queue";

type Kind = "jss1" | "jss2" | "sss1";
type World = Awaited<ReturnType<typeof world>>;
let w: World;

/// Three classes of the home branch with a submitted result each. The first class comes from the shared builder; the others are added to the same term.
async function world() {
  const base = await resultsWorld(home.id, "ap");
  const admin = await actor(Role.ADMIN);
  const classes: Record<Kind, { groupId: string; armId: string; studentId: string; resultId: string }> = {} as never;
  classes.jss1 = { groupId: base.group.id, armId: base.arm.id, studentId: base.student.id, resultId: "" };
  for (const [kind, name] of [
    ["jss2", "JSS 2 ap"],
    ["sss1", "SSS 1 ap"],
  ] as const) {
    const group = await db.classGroup.create({ data: { branchId: home.id, name } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: group.id, subjectId: base.subject.id } });
    const student = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: kind,
        lastName: "Pupil",
        gender: "FEMALE",
        dateOfBirth: new Date("2012-05-01"),
        admissionNo: `ADM/ap/${kind}`,
      },
    });
    await db.studentEnrollment.create({
      data: { branchId: home.id, studentId: student.id, sessionId: base.session.id, className: group.name, arm: "A", classArmId: arm.id },
    });
    classes[kind] = { groupId: group.id, armId: arm.id, studentId: student.id, resultId: "" };
  }
  const section = await db.section.create({ data: { branchId: home.id, name: "Junior" } });
  await db.classGroup.updateMany({ where: { id: { in: [classes.jss1.groupId, classes.jss2.groupId] } }, data: { sectionId: section.id } });
  for (const kind of ["jss1", "jss2", "sss1"] as const) {
    const put = await api(SHEETS, {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        periodId: base.period.id,
        classArmId: classes[kind].armId,
        subjectId: base.subject.id,
        entries: [{ studentId: classes[kind].studentId, parts: { "Test 1": 15, "Test 2": 10 }, exam: 40 }],
      },
    });
    expect(put.status, put.text).toBe(200);
    classes[kind].resultId = (await db.result.findFirstOrThrow({ where: { classArmId: classes[kind].armId } })).id;
  }
  const ids = Object.values(classes).map((c) => c.resultId);
  expect((await go(admin.cookie, "submit", ids)).status).toBe(200);
  return { ...base, classes, section, admin };
}

async function actor(role: Role, branchId = home.id) {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
}

/// A staff member who holds the permission, with the scope rows given (none = nowhere yet).
async function approver(
  scope: ("GENERAL" | { section: string } | { group: string })[],
  opts: { role?: Role; branchId?: string; permission?: boolean } = {},
) {
  const branchId = opts.branchId ?? home.id;
  const user = await createUser();
  await db.membership.create({
    data: {
      userId: user.id,
      branchId,
      role: opts.role ?? Role.TEACHING_STAFF,
      permissions: opts.permission === false ? [] : [Permission.CAN_APPROVE_RESULTS],
    },
  });
  for (const entry of scope) {
    await db.resultApprovalScope.create({
      data:
        entry === "GENERAL"
          ? { branchId, userId: user.id, kind: "GENERAL" }
          : "section" in entry
            ? { branchId, userId: user.id, kind: "SECTION", sectionId: entry.section }
            : { branchId, userId: user.id, kind: "CLASS", classGroupId: entry.group },
    });
  }
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
}

const go = (cookie: string, action: string, resultIds: string[], reason?: string) =>
  api(TRANSITION, { method: "POST", cookie, body: { action, resultIds, ...(reason ? { reason } : {}) } });
const statusOf = async (id: string) => (await db.result.findUniqueOrThrow({ where: { id } })).status;
const allStatuses = async () => (await db.result.findMany({ orderBy: { id: "asc" }, select: { status: true } })).map((r) => r.status);

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  w = await world();
});

test.describe("what each scope reaches", () => {
  test("a General approver approves, returns, reverts, publishes and locks anywhere in the branch, and the history names them", async () => {
    const a = await approver(["GENERAL"]);
    const ids = Object.values(w.classes).map((c) => c.resultId);
    expect((await go(a.cookie, "approve", ids)).json.data).toMatchObject({ count: 3, status: "APPROVED" });
    expect((await go(a.cookie, "revert", ids)).status).toBe(200);
    expect((await go(a.cookie, "return", ids)).status).toBe(200);
    expect(await allStatuses()).toEqual(["DRAFT", "DRAFT", "DRAFT"]);
    expect((await go(w.admin.cookie, "submit", ids)).status).toBe(200);
    expect((await go(a.cookie, "approve", ids)).status).toBe(200);
    expect((await go(a.cookie, "publish", ids)).json.data.status).toBe("PUBLISHED");
    expect((await go(a.cookie, "lock", ids)).status).toBe(200);
    expect(await allStatuses()).toEqual(["LOCKED", "LOCKED", "LOCKED"]);
    const row = await db.result.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(row.approvedByUserId).toBe(a.user.id);
    const history = (await api(`/api/v1/academics/results/${ids[0]}/history`, { cookie: w.admin.cookie })).json.data.history;
    expect(history.map((h: { action: string }) => h.action)).toContain("APPROVE");
    expect(history.find((h: { action: string }) => h.action === "LOCK").actorUserId).toBe(a.user.id);
  });

  test("a Section approver acts on the classes of that section and on nothing else", async () => {
    const a = await approver([{ section: w.section.id }]);
    const { jss1, jss2, sss1 } = w.classes;
    expect((await go(a.cookie, "approve", [jss1.resultId, jss2.resultId])).status).toBe(200);
    expect([await statusOf(jss1.resultId), await statusOf(jss2.resultId), await statusOf(sss1.resultId)]).toEqual([
      "APPROVED",
      "APPROVED",
      "SUBMITTED",
    ]);
    const refused = await go(a.cookie, "approve", [sss1.resultId]);
    expect(refused.status).toBe(403);
    expect(await statusOf(sss1.resultId)).toBe("SUBMITTED");
  });

  test("a Class approver acts on that class only, and a batch with one result outside the scope changes nothing at all", async () => {
    const a = await approver([{ group: w.classes.jss2.groupId }]);
    const { jss1, jss2, sss1 } = w.classes;
    const mixed = await go(a.cookie, "approve", [jss2.resultId, jss1.resultId, sss1.resultId]);
    expect(mixed.status).toBe(403);
    expect(await allStatuses()).toEqual(["SUBMITTED", "SUBMITTED", "SUBMITTED"]); // all or nothing: the one in scope was not approved either
    expect((await go(a.cookie, "approve", [jss2.resultId])).status).toBe(200);
    expect(await statusOf(jss2.resultId)).toBe("APPROVED");
    expect(await statusOf(jss1.resultId)).toBe("SUBMITTED");
  });

  test("an approver of a section and of a class outside it has both", async () => {
    const a = await approver([{ section: w.section.id }, { group: w.classes.sss1.groupId }]);
    const ids = Object.values(w.classes).map((c) => c.resultId);
    expect((await go(a.cookie, "approve", ids)).status).toBe(200);
    expect(await allStatuses()).toEqual(["APPROVED", "APPROVED", "APPROVED"]);
  });

  test("archiving the section ends what it granted; restoring it brings the grant back", async () => {
    const a = await approver([{ section: w.section.id }]);
    await db.section.update({ where: { id: w.section.id }, data: { archivedAt: new Date() } });
    expect((await go(a.cookie, "approve", [w.classes.jss1.resultId])).status).toBe(403);
    await db.section.update({ where: { id: w.section.id }, data: { archivedAt: null } });
    expect((await go(a.cookie, "approve", [w.classes.jss1.resultId])).status).toBe(200);
  });

  test("a non-teaching staff member who is an approver can act, like a teacher can", async () => {
    const a = await approver(["GENERAL"], { role: Role.NON_TEACHING_STAFF });
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(200);
  });
});

test.describe("who is not an approver", () => {
  test("the permission with nowhere to approve approves nothing", async () => {
    const a = await approver([]);
    expect((await go(a.cookie, "approve", [w.classes.jss1.resultId])).status).toBe(403);
    expect(await allStatuses()).toEqual(["SUBMITTED", "SUBMITTED", "SUBMITTED"]);
  });

  test("scope rows without the permission give nothing, and a teacher with neither is refused as before", async () => {
    const noPermission = await approver(["GENERAL"], { permission: false });
    const plain = await actor(Role.TEACHING_STAFF);
    for (const who of [noPermission, plain]) {
      expect((await go(who.cookie, "approve", [w.classes.jss1.resultId])).status).toBe(403);
      expect((await go(who.cookie, "publish", [w.classes.jss1.resultId])).status).toBe(403);
    }
    expect(await allStatuses()).toEqual(["SUBMITTED", "SUBMITTED", "SUBMITTED"]);
  });

  test("taking the permission away ends the authority even though the scope rows remain", async () => {
    const a = await approver(["GENERAL"]);
    await db.membership.update({ where: { userId_branchId: { userId: a.user.id, branchId: home.id } }, data: { permissions: [] } });
    expect((await go(a.cookie, "approve", [w.classes.jss1.resultId])).status).toBe(403);
  });

  test("a deactivated approver can do nothing", async () => {
    const a = await approver(["GENERAL"]);
    await db.membership.update({
      where: { userId_branchId: { userId: a.user.id, branchId: home.id } },
      data: { deactivatedAt: new Date() },
    });
    const reply = await go(a.cookie, "approve", [w.classes.jss1.resultId]);
    expect([401, 403, 404]).toContain(reply.status);
    expect(await statusOf(w.classes.jss1.resultId)).toBe("SUBMITTED");
  });

  test("an approver of another branch cannot touch these results: the same 404 as an unknown id", async () => {
    const a = await approver(["GENERAL"], { branchId: other.id });
    const reply = await go(a.cookie, "approve", [w.classes.jss1.resultId]);
    expect(reply.status).toBe(404);
    expect(await statusOf(w.classes.jss1.resultId)).toBe("SUBMITTED");
  });

  test("an approver never unlocks: it is the administrator's, with a written reason", async () => {
    const a = await approver(["GENERAL"]);
    const ids = Object.values(w.classes).map((c) => c.resultId);
    for (const action of ["approve", "publish"]) expect((await go(a.cookie, action, ids)).status).toBe(200);
    const refused = await go(a.cookie, "unlock", ids, "Exam mark mis-keyed for one pupil");
    expect(refused.status).toBe(403);
    expect(await allStatuses()).toEqual(["PUBLISHED", "PUBLISHED", "PUBLISHED"]);
    expect((await go(w.admin.cookie, "unlock", ids, "Exam mark mis-keyed for one pupil")).status).toBe(200);
  });

  test("an approver cannot approve what they entered themselves", async () => {
    const a = await approver(["GENERAL"]);
    const id = w.classes.jss1.resultId;
    expect((await go(w.admin.cookie, "return", [id])).status).toBe(200); // back to a draft, where the author can still be set
    await db.result.update({ where: { id }, data: { enteredByUserId: a.user.id } });
    expect((await go(w.admin.cookie, "submit", [id])).status).toBe(200);
    const refused = await go(a.cookie, "approve", [w.classes.jss1.resultId]);
    expect(refused.status).toBe(403);
    expect(await statusOf(id)).toBe("SUBMITTED");
  });

  test("an approver submits only their own results, as any teacher does", async () => {
    const a = await approver(["GENERAL"]);
    const id = w.classes.jss1.resultId;
    expect((await go(w.admin.cookie, "return", [id])).status).toBe(200);
    expect((await go(a.cookie, "submit", [id])).status).toBe(403); // entered by the administrator, not by them
    expect(await statusOf(id)).toBe("DRAFT");
  });
});

test.describe("what an approver sees", () => {
  const queueFor = async (cookie: string, branchId = home.id) => api(`${QUEUE}?branchId=${branchId}&periodId=${w.period.id}`, { cookie });
  const armsIn = (reply: { json: { data: { queue: { classArmId: string }[] } } }) => reply.json.data.queue.map((g) => g.classArmId).sort();

  test("the review queue: an administrator sees every class, an approver only the classes in their scope, and an approver with nowhere to approve sees an empty one", async () => {
    const { jss1, jss2, sss1 } = w.classes;
    const all = [jss1.armId, jss2.armId, sss1.armId].sort();
    expect(armsIn(await queueFor(w.admin.cookie))).toEqual(all);
    expect(armsIn(await queueFor((await approver(["GENERAL"])).cookie))).toEqual(all);
    expect(armsIn(await queueFor((await approver([{ section: w.section.id }])).cookie))).toEqual([jss1.armId, jss2.armId].sort());
    expect(armsIn(await queueFor((await approver([{ group: sss1.groupId }])).cookie))).toEqual([sss1.armId]);
    const nowhere = await queueFor((await approver([])).cookie);
    expect(nowhere.status).toBe(200);
    expect(nowhere.json.data.queue).toEqual([]);
  });

  test("the review queue is a 404 for a teacher who is not an approver and for an approver of another branch", async () => {
    expect((await queueFor((await actor(Role.TEACHING_STAFF)).cookie)).status).toBe(404);
    expect((await queueFor((await approver(["GENERAL"], { branchId: other.id })).cookie)).status).toBe(404);
    expect((await queueFor((await approver(["GENERAL"], { permission: false })).cookie)).status).toBe(404);
  });

  test("a result's history: an approver reads it for a result in their scope and gets the same 404 as anyone else for one outside it", async () => {
    const a = await approver([{ section: w.section.id }]);
    const inScope = await api(`/api/v1/academics/results/${w.classes.jss1.resultId}/history`, { cookie: a.cookie });
    expect(inScope.status).toBe(200);
    expect(inScope.json.data.history.length).toBeGreaterThan(0);
    expect((await api(`/api/v1/academics/results/${w.classes.sss1.resultId}/history`, { cookie: a.cookie })).status).toBe(404);
    const plain = await actor(Role.TEACHING_STAFF);
    expect((await api(`/api/v1/academics/results/${w.classes.jss1.resultId}/history`, { cookie: plain.cookie })).status).toBe(404);
  });

  test("the sheet of a class: an approver reads it without being assigned to teach it when it is in their scope, and cannot save it", async () => {
    const a = await approver([{ group: w.classes.jss1.groupId }]);
    const query = (kind: Kind) => `${SHEETS}?periodId=${w.period.id}&classArmId=${w.classes[kind].armId}&subjectId=${w.subject.id}`;
    const read = await api(query("jss1"), { cookie: a.cookie });
    expect(read.status, read.text).toBe(200);
    expect((await api(query("sss1"), { cookie: a.cookie })).status).toBe(403);
    const save = await api(SHEETS, {
      method: "PUT",
      cookie: a.cookie,
      body: {
        periodId: w.period.id,
        classArmId: w.classes.jss1.armId,
        subjectId: w.subject.id,
        entries: [{ studentId: w.classes.jss1.studentId, parts: { "Test 1": 1, "Test 2": 1 }, exam: 1 }],
      },
    });
    expect(save.status).toBe(403);
  });

  test("the terms for the review screen load for a non-teaching approver", async () => {
    const a = await approver(["GENERAL"], { role: Role.NON_TEACHING_STAFF });
    const reply = await api(`${SHEETS}/options?branchId=${home.id}`, { cookie: a.cookie });
    expect(reply.status, reply.text).toBe(200);
    expect(reply.json.data.periods.length).toBeGreaterThan(0);
    expect(reply.json.data.pairs ?? []).toEqual([]);
  });
});

// Slice 2a: the branch setting results.unsectionedClassApproval. SSS 1 is in no section; under ANY_SECTION_APPROVER a person with a live Section scope reaches it too.
test.describe("classes that belong to no section", () => {
  const setting = (branchId: string, value: unknown) =>
    db.settingValue.upsert({
      where: { scope_branchId_key: { scope: "BRANCH", branchId, key: UNSECTIONED_KEY } },
      create: { scope: "BRANCH", branchId, key: UNSECTIONED_KEY, value: value as never, status: "APPROVED" },
      update: { value: value as never },
    });
  const queueArms = async (cookie: string) =>
    (await api(`${QUEUE}?branchId=${home.id}&periodId=${w.period.id}`, { cookie })).json.data.queue.map((g: { classArmId: string }) => g.classArmId).sort();

  test("by default a Section approver does not reach a class in no section, with no row or with the default written out", async () => {
    const a = await approver([{ section: w.section.id }]);
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(403);
    await setting(home.id, "GENERAL_OR_CLASS_ONLY");
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(403);
    expect(await queueArms(a.cookie)).toEqual([w.classes.jss1.armId, w.classes.jss2.armId].sort());
  });

  test("under ANY_SECTION_APPROVER a Section approver also acts on, and sees in the queue, the classes in no section", async () => {
    await setting(home.id, "ANY_SECTION_APPROVER");
    const a = await approver([{ section: w.section.id }]);
    const { jss1, jss2, sss1 } = w.classes;
    expect(await queueArms(a.cookie)).toEqual([jss1.armId, jss2.armId, sss1.armId].sort());
    expect((await api(`/api/v1/academics/results/${sss1.resultId}/history`, { cookie: a.cookie })).status).toBe(200);
    expect((await go(a.cookie, "approve", Object.values(w.classes).map((c) => c.resultId))).status).toBe(200);
    expect(await allStatuses()).toEqual(["APPROVED", "APPROVED", "APPROVED"]);
  });

  test("it gives nothing to a person with no scope, with a Class scope only, or without the permission", async () => {
    await setting(home.id, "ANY_SECTION_APPROVER");
    const { jss1, sss1 } = w.classes;
    expect((await go((await approver([])).cookie, "approve", [sss1.resultId])).status).toBe(403);
    const classOnly = await approver([{ group: jss1.groupId }]);
    expect((await go(classOnly.cookie, "approve", [sss1.resultId])).status).toBe(403);
    expect((await go(classOnly.cookie, "approve", [jss1.resultId])).status).toBe(200);
    expect((await go((await approver([{ section: w.section.id }], { permission: false })).cookie, "approve", [sss1.resultId])).status).toBe(403);
    expect(await statusOf(sss1.resultId)).toBe("SUBMITTED");
  });

  test("an archived section grants nothing, so it widens nothing", async () => {
    await setting(home.id, "ANY_SECTION_APPROVER");
    const a = await approver([{ section: w.section.id }]);
    await db.section.update({ where: { id: w.section.id }, data: { archivedAt: new Date() } });
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(403);
    expect(await queueArms(a.cookie)).toEqual([]);
  });

  test("a branch's setting is that branch's: another branch's value changes nothing here", async () => {
    await setting(other.id, "ANY_SECTION_APPROVER");
    const a = await approver([{ section: w.section.id }]);
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(403);
  });

  test("a damaged stored value is the default, and putting the default back ends the widening", async () => {
    const a = await approver([{ section: w.section.id }]);
    for (const damaged of ["any_section_approver", true, { value: "ANY_SECTION_APPROVER" }, null]) {
      await setting(home.id, damaged);
      expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status, JSON.stringify(damaged)).toBe(403);
    }
    await setting(home.id, "ANY_SECTION_APPROVER");
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(200);
    expect((await go(w.admin.cookie, "revert", [w.classes.sss1.resultId])).status).toBe(200); // back to SUBMITTED, waiting for an approver again
    expect(await statusOf(w.classes.sss1.resultId)).toBe("SUBMITTED");
    await setting(home.id, "GENERAL_OR_CLASS_ONLY");
    expect((await go(a.cookie, "approve", [w.classes.sss1.resultId])).status).toBe(403);
  });

  test("a General approver and an administrator are not changed by the setting either way", async () => {
    const general = await approver(["GENERAL"]);
    for (const value of ["GENERAL_OR_CLASS_ONLY", "ANY_SECTION_APPROVER"]) {
      await setting(home.id, value);
      expect(await queueArms(general.cookie)).toHaveLength(3);
      expect(await queueArms(w.admin.cookie)).toHaveLength(3);
    }
  });
});

test.describe("saving the setting", () => {
  const audit = () => db.settingAudit.findMany({ where: { settingKey: UNSECTIONED_KEY, branchId: home.id }, orderBy: { createdAt: "asc" } });

  test("the first read is the default; turning it on is audited as widening; turning it off is a plain change; saving the same value again writes nothing", async () => {
    const by = await actor(Role.ADMIN);
    expect(await getUnsectionedClassApproval(home.id)).toBe("GENERAL_OR_CLASS_ONLY");

    const on = await setUnsectionedClassApproval(home.id, "ANY_SECTION_APPROVER", by.user.id);
    expect(on).toEqual({ before: "GENERAL_OR_CLASS_ONLY", after: "ANY_SECTION_APPROVER", changed: true, widening: true });
    expect(await getUnsectionedClassApproval(home.id)).toBe("ANY_SECTION_APPROVER");

    expect(await setUnsectionedClassApproval(home.id, "ANY_SECTION_APPROVER", by.user.id)).toMatchObject({ changed: false, widening: false });
    const off = await setUnsectionedClassApproval(home.id, "GENERAL_OR_CLASS_ONLY", by.user.id);
    expect(off).toMatchObject({ changed: true, widening: false });

    expect((await audit()).map((row) => [row.action, row.oldValue, row.newValue, row.actorUserId])).toEqual([
      ["CHANGED_WIDENING", "GENERAL_OR_CLASS_ONLY", "ANY_SECTION_APPROVER", by.user.id],
      ["CHANGED", "ANY_SECTION_APPROVER", "GENERAL_OR_CLASS_ONLY", by.user.id],
    ]);
  });

  test("saving the default on a branch with no row creates the row and no audit line; the next branch is untouched", async () => {
    const by = await actor(Role.ADMIN);
    expect(await setUnsectionedClassApproval(home.id, "GENERAL_OR_CLASS_ONLY", by.user.id)).toMatchObject({ changed: false });
    expect(await db.settingValue.count({ where: { key: UNSECTIONED_KEY, branchId: home.id } })).toBe(1);
    expect(await audit()).toEqual([]);
    expect(await db.settingValue.count({ where: { key: UNSECTIONED_KEY, branchId: other.id } })).toBe(0);
  });
});
