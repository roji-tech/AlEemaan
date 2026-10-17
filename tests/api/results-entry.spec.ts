import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";

// Entering results over real HTTP (Slice P2a). An administrator of the branch may enter for any subject and arm; a teacher only for a subject and arm they are ASSIGNED
// to (results only - attendance is unchanged); everyone else, and every other branch, is refused. The numbers come from the scheme and the grade scale, never from the
// client; a bad row refuses the whole sheet; the first result locks the scheme and scale; the history is written in the same transaction.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase(); // leave the database as found: a later screen spec expects an empty branch
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
type World = Awaited<ReturnType<typeof resultsWorld>>;
const at = (w: World) => `periodId=${w.period.id}&classArmId=${w.arm.id}&subjectId=${w.subject.id}`;
const body = (w: World, entries: object[], extra: object = {}) => ({
  periodId: w.period.id,
  classArmId: w.arm.id,
  subjectId: w.subject.id,
  entries,
  ...extra,
});
const entry = (w: World, over: object = {}) => ({ studentId: w.student.id, parts: { "Test 1": 15, "Test 2": 10 }, exam: 40, ...over });
/// A teacher assigned to teach the world's subject to its arm.
const assignedTeacher = async (w: World) => {
  const t = await asRole(Role.TEACHING_STAFF);
  const staff = await db.staffRecord.create({
    data: { branchId: home.id, userId: t.user.id, category: "TEACHING", firstName: "Tola", lastName: "Ade" },
  });
  await db.staffSubjectAssignment.create({
    data: { branchId: home.id, staffRecordId: staff.id, subjectId: w.subject.id, classArmId: w.arm.id },
  });
  return t;
};

test.describe("who may enter", () => {
  test("signed out 401; a parent and a non-teaching member 403; an UNassigned teacher 403; an assigned teacher and an administrator may; another branch is a 404", async () => {
    const w = await resultsWorld(home.id);
    expect((await api(`${SHEETS}?${at(w)}`)).status).toBe(401);
    const parent = await asRole(Role.PARENT);
    const clerk = await asRole(Role.NON_TEACHING_STAFF);
    const stranger = await asRole(Role.TEACHING_STAFF); // a teacher of the branch with no assignment
    for (const who of [parent, clerk, stranger]) {
      expect([
        (await api(`${SHEETS}?${at(w)}`, { cookie: who.cookie })).status,
        (await api(SHEETS, { method: "PUT", cookie: who.cookie, body: body(w, [entry(w)]) })).status,
      ]).toEqual([403, 403]);
    }
    const teacher = await assignedTeacher(w);
    expect((await api(`${SHEETS}?${at(w)}`, { cookie: teacher.cookie })).status).toBe(200);
    const admin = await asRole(Role.ADMIN);
    expect((await api(SHEETS, { method: "PUT", cookie: admin.cookie, body: body(w, [entry(w)]) })).status).toBe(200);
    const theirAdmin = await asRole(Role.ADMIN, other.id);
    expect((await api(`${SHEETS}?${at(w)}`, { cookie: theirAdmin.cookie })).status).toBe(404);
    expect((await api(SHEETS, { method: "PUT", cookie: theirAdmin.cookie, body: body(w, [entry(w)]) })).status).toBe(404);
    expect(await db.result.count()).toBe(1); // only the administrator's save wrote
  });

  test("a teacher assigned to a DIFFERENT subject or arm of the same branch is refused", async () => {
    const w = await resultsWorld(home.id);
    const second = await db.subject.create({ data: { branchId: home.id, name: "English" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: w.group.id, subjectId: second.id } });
    const t = await asRole(Role.TEACHING_STAFF);
    const staff = await db.staffRecord.create({
      data: { branchId: home.id, userId: t.user.id, category: "TEACHING", firstName: "Tola", lastName: "Ade" },
    });
    await db.staffSubjectAssignment.create({
      data: { branchId: home.id, staffRecordId: staff.id, subjectId: second.id, classArmId: w.arm.id },
    });
    expect((await api(SHEETS, { method: "PUT", cookie: t.cookie, body: body(w, [entry(w)]) })).status).toBe(403); // assigned to English, not Maths
    await db.staffRecord.update({ where: { id: staff.id }, data: { archivedAt: new Date() } });
    expect(
      (await api(`${SHEETS}?periodId=${w.period.id}&classArmId=${w.arm.id}&subjectId=${second.id}`, { cookie: t.cookie })).status,
    ).toBe(403); // an archived record no longer counts
  });
});

test.describe("the sheet and saving", () => {
  test("the sheet lists the arm's students and the scheme's parts; saving computes the total and grade from the scheme and scale, writes the history, and locks both", async () => {
    const w = await resultsWorld(home.id);
    const { user, cookie } = await asRole(Role.ADMIN);
    const sheet = (await api(`${SHEETS}?${at(w)}`, { cookie })).json.data.sheet;
    expect(sheet.scheme.components).toEqual([
      { name: "Test 1", max: 20 },
      { name: "Test 2", max: 20 },
    ]);
    expect(sheet.students.map((s: { id: string; result: unknown }) => [s.id, s.result])).toEqual([[w.student.id, null]]);

    const saved = await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w)]) });
    expect(saved.json.data).toEqual({ created: 1, updated: 0, removed: 0 });
    const row = await db.result.findFirstOrThrow({ where: { studentId: w.student.id } });
    expect([Number(row.caTotal), Number(row.examScore), Number(row.total), row.gradeLetter, row.gradeRemark, row.status]).toEqual([
      25,
      40,
      65,
      "C",
      "Credit",
      "DRAFT",
    ]);
    expect([row.schemeId, row.scaleId, row.classArmId, row.enteredByUserId]).toEqual([w.scheme.id, w.scale.id, w.arm.id, user.id]);
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: w.scheme.id } })).lockedAt).not.toBeNull();
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: w.scale.id } })).lockedAt).not.toBeNull();
    const reread = (await api(`${SHEETS}?${at(w)}`, { cookie })).json.data.sheet.students[0].result;
    expect(reread).toMatchObject({ status: "DRAFT", exam: 40, total: 65, gradeLetter: "C" });

    // editing changes the numbers and the grade; saving the same numbers again writes nothing new
    await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w, { exam: 55 })]) });
    expect((await db.result.findFirstOrThrow({ where: { studentId: w.student.id } })).gradeLetter).toBe("A"); // 25 + 55 = 80
    await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w, { exam: 55 })]) });
    const history = await db.resultAudit.findMany({ where: { branchId: home.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => [h.action, h.actorUserId === user.id, Number(h.toTotal ?? 0)])).toEqual([
      ["ENTERED", true, 65],
      ["EDITED", true, 80],
    ]);

    // a locked scheme can no longer be edited in place (P1b) - the first result made it history
    const edit = await api(`/api/v1/academics/assessment-schemes/${w.scheme.id}`, { method: "PATCH", cookie, body: { name: "Changed" } });
    expect(edit.status).toBe(409);
  });

  test("an assigned teacher enters; their work is attributed to them; removing a draft deletes it but keeps the trail", async () => {
    const w = await resultsWorld(home.id);
    const teacher = await assignedTeacher(w);
    await api(SHEETS, { method: "PUT", cookie: teacher.cookie, body: body(w, [entry(w)]) });
    expect((await db.result.findFirstOrThrow({})).enteredByUserId).toBe(teacher.user.id);
    const removed = await api(SHEETS, { method: "PUT", cookie: teacher.cookie, body: body(w, [], { removeStudentIds: [w.student.id] }) });
    expect(removed.json.data).toEqual({ created: 0, updated: 0, removed: 1 });
    expect(await db.result.count()).toBe(0);
    expect((await db.resultAudit.findMany({ orderBy: { createdAt: "asc" } })).map((h) => h.action)).toEqual(["ENTERED", "REMOVED"]);
  });

  test("a class's own scheme wins over the branch default", async () => {
    const w = await resultsWorld(home.id);
    const own = await db.assessmentScheme.create({
      data: { branchId: home.id, classGroupId: w.group.id, name: "JSS only", totalMax: 100, examMax: 70 },
    });
    await db.assessmentComponent.create({ data: { branchId: home.id, schemeId: own.id, name: "CA", maxScore: 30, sortOrder: 0 } });
    const { cookie } = await asRole(Role.ADMIN);
    expect((await api(`${SHEETS}?${at(w)}`, { cookie })).json.data.sheet.scheme.components).toEqual([{ name: "CA", max: 30 }]);
    expect(
      (await api(SHEETS, { method: "PUT", cookie, body: body(w, [{ studentId: w.student.id, parts: { CA: 20 }, exam: 50 }]) })).status,
    ).toBe(200);
    expect((await db.result.findFirstOrThrow({})).schemeId).toBe(own.id);
  });
});

test.describe("a bad sheet is refused whole", () => {
  test("out-of-range, missing, unknown and over-precise marks are 400 with the reason and write NOTHING", async () => {
    const w = await resultsWorld(home.id);
    const two = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Bola",
        lastName: "Ola",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
        admissionNo: "ADM/B/2",
      },
    });
    await db.studentEnrollment.create({
      data: { branchId: home.id, studentId: two.id, sessionId: w.session.id, className: w.group.name, arm: "A", classArmId: w.arm.id },
    });
    const { cookie } = await asRole(Role.ADMIN);
    const put = (entries: object[]) => api(SHEETS, { method: "PUT", cookie, body: body(w, entries) });
    for (const [bad, message] of [
      [entry(w, { exam: 61 }), /exam mark must be between 0 and 60/],
      [entry(w, { parts: { "Test 1": 21, "Test 2": 1 } }), /Test 1 must be between 0 and 20/],
      [entry(w, { parts: { "Test 1": 5 } }), /enter a mark for Test 2/],
      [entry(w, { parts: { "Test 1": 5, "Test 2": 5, Bonus: 1 } }), /"Bonus" is not a part/],
      [entry(w, { exam: 40.123 }), /at most two decimal places/],
      [entry(w, { exam: -1 }), /between 0 and 60/],
    ] as const) {
      const r = await put([entry(w, { studentId: two.id }), bad]); // the second row is bad; the first is fine and must not be saved
      expect([r.status, r.json.error.code]).toEqual([400, "VALIDATION"]);
      expect(r.json.error.message).toMatch(message);
      expect(await db.result.count()).toBe(0);
    }
    expect((await put([entry(w), entry(w)])).status).toBe(400); // the same student twice
    expect(await db.result.count()).toBe(0);
  });

  test("a student who is not in this arm this term, a missing scheme or scale, a closed session and an unoffered subject are 409", async () => {
    const w = await resultsWorld(home.id);
    const { cookie } = await asRole(Role.ADMIN);
    const lost = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Lost",
        lastName: "Boy",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
        admissionNo: "ADM/L/3",
      },
    });
    expect((await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w, { studentId: lost.id })]) })).status).toBe(409); // not enrolled in the arm

    const maths = await db.subject.create({ data: { branchId: home.id, name: "Unoffered" } });
    expect((await api(SHEETS, { method: "PUT", cookie, body: { ...body(w, [entry(w)]), subjectId: maths.id } })).status).toBe(409); // the class does not study it

    await db.gradeScale.update({ where: { id: w.scale.id }, data: { isDefault: false } });
    const noScale = await api(`${SHEETS}?${at(w)}`, { cookie });
    expect([noScale.status, noScale.json.error.message]).toEqual([
      409,
      "Set up a default grade scale for this branch first (Academics, Assessment and grading).",
    ]);
    await db.gradeScale.update({ where: { id: w.scale.id }, data: { isDefault: true } });

    await db.assessmentScheme.update({ where: { id: w.scheme.id }, data: { archivedAt: new Date() } });
    expect((await api(`${SHEETS}?${at(w)}`, { cookie })).json.error.message).toMatch(/Set up an assessment scheme/);
    await db.assessmentScheme.update({ where: { id: w.scheme.id }, data: { archivedAt: null } });

    await db.academicSession.update({ where: { id: w.session.id }, data: { status: "CLOSED" } });
    expect((await api(`${SHEETS}?${at(w)}`, { cookie })).json.error.message).toMatch(/active session/);
    expect(await db.result.count()).toBe(0);
  });

  test("a result that has left DRAFT cannot be edited or removed through the sheet", async () => {
    const w = await resultsWorld(home.id);
    const { user, cookie } = await asRole(Role.ADMIN);
    await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w)]) });
    await db.result.updateMany({ data: { status: "SUBMITTED", submittedAt: new Date(), submittedByUserId: user.id } });
    const edit = await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w, { exam: 10 })]) });
    expect([edit.status, edit.json.error.code]).toEqual([409, "CONFLICT"]);
    expect((await api(SHEETS, { method: "PUT", cookie, body: body(w, [], { removeStudentIds: [w.student.id] }) })).status).toBe(409);
    expect(Number((await db.result.findFirstOrThrow({})).examScore)).toBe(40);
  });

  test("CSRF still guards the write (a foreign origin saves nothing)", async () => {
    const w = await resultsWorld(home.id);
    const { cookie } = await asRole(Role.ADMIN);
    const noOrigin = await api(SHEETS, { method: "PUT", cookie, body: body(w, [entry(w)]), origin: "https://evil.example" });
    expect(noOrigin.status).toBeGreaterThanOrEqual(400);
    expect(await db.result.count()).toBe(0);
  });
});
