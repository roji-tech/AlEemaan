import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueEmail, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Suspension, expulsion and termination on the school's own records (task 0045): who may do what, every effect, the history, the sign-in lift and the portal. Real HTTP against a
// production build, real database. The people: a super admin (sa), an administrator of branch A (adminA) and of branch B (adminB), teachers, and pupils in A and B.

const SWITCH = "/api/v1/settings/standing";
const DAY = 864e5;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

type Person = TestUser & { cookie: string };
let A: { id: string; name: string };
let B: { id: string; name: string };
let sa: Person;
let adminA: Person;
let adminB: Person;
let teacherA: Person;
let pupilA: { id: string };
let pupilA2: { id: string };
let pupilB: { id: string };
let sessionA: { id: string };

const login = async (user: TestUser): Promise<Person> => ({ ...user, cookie: cookieHeader((await loginAs(user)).token!) });
async function staffIn(branchId: string, role: Role, name: string): Promise<Person> {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W+/g, "-")) });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return login({ ...user, branchId });
}
const get = (path: string, who: Person) => api(path, { cookie: who.cookie });
const post = (path: string, who: Person, body: unknown) => api(path, { method: "POST", cookie: who.cookie, body });
const patch = (path: string, who: Person, body: unknown) => api(path, { method: "PATCH", cookie: who.cookie, body });

const studentStanding = (id: string, who: Person, body: Record<string, unknown>) => post(`/api/v1/students/${id}/standing`, who, body);
const memberStanding = (membershipId: string, who: Person, body: Record<string, unknown>) =>
  post(`/api/v1/members/${membershipId}/standing`, who, body);
const membershipOf = (userId: string, branchId: string) =>
  db.membership.findUniqueOrThrow({ where: { userId_branchId: { userId, branchId } } });
const REASON = "Fighting in the corridor";

async function makePupil(branchId: string, admissionNo: string, firstName: string, phone: string, sessionId: string, dob = "2013-05-10") {
  const group = await db.classGroup.findFirst({ where: { branchId, name: "JSS 1" } });
  const classGroup = group ?? (await db.classGroup.create({ data: { branchId, name: "JSS 1" } }));
  const arm =
    (await db.classArm.findFirst({ where: { classGroupId: classGroup.id, name: "Gold" } })) ??
    (await db.classArm.create({ data: { branchId, classGroupId: classGroup.id, name: "Gold" } }));
  const student = await db.studentRecord.create({
    data: {
      branchId,
      firstName,
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(dob),
      admissionNo,
      guardianPhone: phone,
      guardianEmail: `${admissionNo.replace("/", "")}@example.com`,
    },
  });
  await db.studentEnrollment.create({
    data: { studentId: student.id, branchId, sessionId, className: "JSS 1", arm: "Gold", classArmId: arm.id, status: "ACTIVE" },
  });
  return student;
}

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  [A, B] = [branches[0]!, branches[1]!];
  sa = await login(await createUser({ role: Role.ADMIN, name: "Super Admin" }));
  adminA = await login(await createUser({ role: Role.ADMIN, superAdmin: false, name: "Admin A" }));
  adminB = await staffIn(B.id, Role.ADMIN, "Admin B");
  teacherA = await staffIn(A.id, Role.TEACHING_STAFF, "Teacher A");
  sessionA = await db.academicSession.create({
    data: { branchId: A.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const sessionB = await db.academicSession.create({
    data: { branchId: B.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  pupilA = await makePupil(A.id, "2026/0001", "Amina", "+2348011110001", sessionA.id);
  pupilA2 = await makePupil(A.id, "2026/0002", "Binta", "+2348011110001", sessionA.id, "2015-02-03"); // a sibling
  pupilB = await makePupil(B.id, "2026/0003", "Cara", "+2348022220002", sessionB.id, "2012-01-01");
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("reaching the routes", () => {
  test("nobody signed out, and no teacher, can read or change a standing", async () => {
    const member = await membershipOf(teacherA.id, A.id);
    for (const [method, path] of [
      ["GET", `/api/v1/students/${pupilA.id}/standing`],
      ["POST", `/api/v1/students/${pupilA.id}/standing`],
      ["GET", `/api/v1/members/${member.id}/standing`],
      ["POST", `/api/v1/members/${member.id}/standing`],
      ["GET", SWITCH],
      ["PATCH", SWITCH],
    ] as const) {
      expect((await api(path, { method, body: method === "GET" ? undefined : {} })).status, `${method} ${path} signed out`).toBe(401);
      expect(
        (await api(path, { method, cookie: teacherA.cookie, body: method === "GET" ? undefined : {} })).status,
        `${method} ${path} teacher`,
      ).toBe(403);
    }
  });

  test("a body with a key the route does not know, or no reason, or a reason that is too short or long, is refused", async () => {
    const path = `/api/v1/students/${pupilA.id}/standing`;
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON, role: "ADMIN" })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend" })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: "no" })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: "x".repeat(501) })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: "bad\u0000reason" })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "terminate", reason: REASON })).status).toBe(400); // not a pupil's action
    const res = await studentStanding(pupilA.id, sa, { action: "suspend", reason: "no" });
    expect(res.json.error.details.some((d: { path: string }) => d.path === "body.reason")).toBe(true);
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupilA.id } })).standing).toBe("ACTIVE");
    expect(await db.standingEvent.count()).toBe(0);
    expect((await get(path, sa)).status).toBe(200);
  });

  test("an id that is not an id, or a pupil that does not exist, answers 404", async () => {
    for (const id of ["nope", "../../x", "c".repeat(25)])
      expect((await studentStanding(id, sa, { action: "suspend", reason: REASON })).status, id).toBe(404);
  });
});

test.describe("a pupil: who may, and what it does", () => {
  test("a super admin suspends with an end date; the list, the detail and the roll say so; the class list keeps the pupil", async () => {
    const until = day(5);
    const res = await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON, until });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toEqual({ standing: "SUSPENDED", until });

    const list = await get(`/api/v1/students?branchId=${A.id}`, sa);
    const row = list.json.data.students.find((s: { id: string }) => s.id === pupilA.id);
    expect(row).toMatchObject({ standing: "SUSPENDED", standingUntil: until });
    expect(list.json.data.students.find((s: { id: string }) => s.id === pupilA2.id)).toMatchObject({
      standing: "ACTIVE",
      standingUntil: null,
    });
    const detail = await get(`/api/v1/students/${pupilA.id}`, sa);
    expect(detail.json.data.student).toMatchObject({ standing: "SUSPENDED", standingUntil: until });

    // the filter
    const only = await get(`/api/v1/students?branchId=${A.id}&standing=suspended`, sa);
    expect(only.json.data.students.map((s: { id: string }) => s.id)).toEqual([pupilA.id]);
    expect((await get(`/api/v1/students?branchId=${A.id}&standing=expelled`, sa)).json.data.students).toEqual([]);

    // still on the class list, flagged
    const roll = await get(`/api/v1/attendance?branchId=${A.id}&className=${encodeURIComponent("JSS 1")}&arm=Gold&date=${day(0)}`, sa);
    expect(roll.status, roll.text).toBe(200);
    const entry = roll.json.data.students.find((s: { studentId: string }) => s.studentId === pupilA.id);
    expect(entry).toMatchObject({ suspended: true, suspendedUntil: until });
    expect(roll.json.data.students.find((s: { studentId: string }) => s.studentId === pupilA2.id).suspended).toBe(false);
    // the enrolment itself did not change
    expect((await db.studentEnrollment.findFirstOrThrow({ where: { studentId: pupilA.id } })).status).toBe("ACTIVE");
  });

  test("a suspension with no end date lasts until lifted; lifting clears it; lifting what is not suspended is refused", async () => {
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON })).json.data).toEqual({
      standing: "SUSPENDED",
      until: null,
    });
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON })).status).toBe(409); // already suspended
    const lifted = await studentStanding(pupilA.id, sa, { action: "lift", reason: "Back after the meeting" });
    expect(lifted.json.data).toEqual({ standing: "ACTIVE", until: null });
    const again = await studentStanding(pupilA.id, sa, { action: "lift", reason: "Back after the meeting" });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("NOT_APPLICABLE");
  });

  test("an end date in the past, or that is not a date, is refused", async () => {
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON, until: day(-1) })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON, until: "2026-02-30" })).status).toBe(400);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON, until: "next week" })).status).toBe(400);
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupilA.id } })).standing).toBe("ACTIVE");
  });

  test("a suspension whose last day has passed reads as in good standing, and can still be cleared", async () => {
    await db.studentRecord.update({
      where: { id: pupilA.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${day(-2)}T00:00:00Z`) },
    });
    const row = (await get(`/api/v1/students?branchId=${A.id}`, sa)).json.data.students.find((s: { id: string }) => s.id === pupilA.id);
    expect(row).toMatchObject({ standing: "ACTIVE", standingUntil: null });
    expect((await get(`/api/v1/students?branchId=${A.id}&standing=suspended`, sa)).json.data.students).toEqual([]);
    expect((await studentStanding(pupilA.id, sa, { action: "lift", reason: "Tidying up the record" })).status).toBe(200);
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupilA.id } })).standingUntil).toBeNull();
  });

  test("a branch administrator suspends and lifts in their own branch; never expels; never another branch's pupil", async () => {
    expect((await studentStanding(pupilA.id, adminA, { action: "suspend", reason: REASON })).status).toBe(200);
    expect((await studentStanding(pupilA.id, adminA, { action: "lift", reason: "Resolved with the parents" })).status).toBe(200);
    const expel = await studentStanding(pupilA.id, adminA, { action: "expel", reason: REASON });
    expect(expel.status).toBe(403);
    expect((await studentStanding(pupilA.id, adminA, { action: "reinstate", reason: REASON })).status).toBe(403);
    // another branch's pupil answers like one that does not exist
    expect((await studentStanding(pupilB.id, adminA, { action: "suspend", reason: REASON })).status).toBe(404);
    expect((await get(`/api/v1/students/${pupilB.id}/standing`, adminA)).status).toBe(404);
    expect((await studentStanding(pupilB.id, adminB, { action: "suspend", reason: REASON })).status).toBe(200);
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupilB.id } })).standing).toBe("SUSPENDED");
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupilA.id } })).standing).toBe("ACTIVE");
  });

  test("expelling comes off the rolls and the lists that select by active enrolment; reinstating puts the pupil back", async () => {
    const res = await studentStanding(pupilA.id, sa, { action: "expel", reason: "Serious misconduct" });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.standing).toBe("EXPELLED");
    expect((await db.studentEnrollment.findFirstOrThrow({ where: { studentId: pupilA.id } })).status).toBe("EXPELLED");

    const roll = await get(`/api/v1/attendance?branchId=${A.id}&className=${encodeURIComponent("JSS 1")}&arm=Gold&date=${day(0)}`, sa);
    expect(roll.json.data.students.map((s: { studentId: string }) => s.studentId)).toEqual([pupilA2.id]);
    expect(
      (await get(`/api/v1/students?branchId=${A.id}&standing=expelled`, sa)).json.data.students.map((s: { id: string }) => s.id),
    ).toEqual([pupilA.id]);
    expect((await studentStanding(pupilA.id, sa, { action: "expel", reason: "Serious misconduct" })).status).toBe(409);
    expect((await studentStanding(pupilA.id, sa, { action: "lift", reason: "Not a suspension" })).status).toBe(409);

    const back = await studentStanding(pupilA.id, sa, { action: "reinstate", reason: "Appeal upheld" });
    expect(back.json.data).toEqual({ standing: "ACTIVE", until: null });
    expect((await db.studentEnrollment.findFirstOrThrow({ where: { studentId: pupilA.id } })).status).toBe("ACTIVE");
    expect((await studentStanding(pupilA.id, sa, { action: "reinstate", reason: "Appeal upheld" })).status).toBe(409);
  });

  test("a suspended pupil can be expelled (their suspension ends with it); the history says every step, newest first", async () => {
    await studentStanding(pupilA.id, sa, { action: "suspend", reason: "First offence", until: day(3) });
    await studentStanding(pupilA.id, adminA, { action: "lift", reason: "Parents met the head" });
    await studentStanding(pupilA.id, sa, { action: "suspend", reason: "Second offence" });
    expect((await studentStanding(pupilA.id, sa, { action: "expel", reason: "Third offence" })).status).toBe(200);
    expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupilA.id } })).standingUntil).toBeNull();

    const history = await get(`/api/v1/students/${pupilA.id}/standing`, adminA);
    expect(history.status).toBe(200);
    expect(history.json.data.standing).toBe("EXPELLED");
    expect(history.json.data.events.map((e: { action: string }) => e.action)).toEqual(["EXPELLED", "SUSPENDED", "LIFTED", "SUSPENDED"]);
    expect(history.json.data.events[0]).toMatchObject({ reason: "Third offence", decidedBy: "Super Admin", scope: "BRANCH" });
    expect(history.json.data.events[2]).toMatchObject({ reason: "Parents met the head", decidedBy: "Admin A" });
    expect(history.json.data.events[3].endsOn).toBe(day(3)); // the first suspension had a last day ...
    expect(history.json.data.events[1].endsOn).toBeNull(); // ... the second had none
    expect(history.json.data.events[1].reason).toBe("Second offence");
    // each decision is also in the audit log, in the same transaction
    expect(await db.auditLog.count({ where: { targetId: pupilA.id } })).toBe(4);
  });

  test("an archived pupil's standing cannot change until restored", async () => {
    await db.studentRecord.update({ where: { id: pupilA.id }, data: { archivedAt: new Date() } });
    const res = await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("ARCHIVED");
  });

  test("two suspensions at the same moment: one wins, the other is told it already applies", async () => {
    const results = await Promise.all([1, 2, 3].map(() => studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await db.standingEvent.count({ where: { studentId: pupilA.id } })).toBe(1);
  });
});

test.describe("the history cannot be rewritten, and the database refuses a standing that makes no sense", () => {
  test("a history row cannot be updated or deleted, even by the database user", async () => {
    await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON });
    const event = await db.standingEvent.findFirstOrThrow();
    await expect(db.standingEvent.update({ where: { id: event.id }, data: { reason: "A different story" } })).rejects.toThrow();
    await expect(db.standingEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    expect((await db.standingEvent.findFirstOrThrow()).reason).toBe(REASON);
  });

  test("a pupil cannot be terminated, a member of staff cannot be expelled, and an end date needs a suspension", async () => {
    await expect(db.studentRecord.update({ where: { id: pupilA.id }, data: { standing: "TERMINATED" } })).rejects.toThrow();
    const member = await membershipOf(teacherA.id, A.id);
    await expect(db.membership.update({ where: { id: member.id }, data: { standing: "EXPELLED" } })).rejects.toThrow();
    await expect(
      db.studentRecord.update({ where: { id: pupilA.id }, data: { standing: "ACTIVE", standingUntil: new Date(`${day(3)}T00:00:00Z`) } }),
    ).rejects.toThrow();
    await expect(
      db.membership.update({ where: { id: member.id }, data: { standing: "TERMINATED", standingUntil: new Date(`${day(3)}T00:00:00Z`) } }),
    ).rejects.toThrow();
  });

  test("a history row needs a reason of 3 to 500 characters, and an action that fits its subject", async () => {
    const row = {
      subject: "STUDENT" as const,
      studentId: pupilA.id,
      branchId: A.id,
      action: "SUSPENDED" as const,
      startsOn: new Date(),
      decidedByUserId: sa.id,
    };
    await expect(db.standingEvent.create({ data: { ...row, reason: "no" } })).rejects.toThrow();
    await expect(db.standingEvent.create({ data: { ...row, reason: "x".repeat(501) } })).rejects.toThrow();
    await expect(db.standingEvent.create({ data: { ...row, reason: REASON, action: "TERMINATED" } })).rejects.toThrow();
    await expect(
      db.standingEvent.create({ data: { ...row, reason: REASON, subject: "STAFF", studentId: null, action: "EXPELLED" } }),
    ).rejects.toThrow();
    await expect(db.standingEvent.create({ data: { ...row, reason: REASON, studentId: null } })).rejects.toThrow();
  });
});

test.describe("the school's setting: may branch administrators suspend", () => {
  test("a super admin turns it off for the school: branch administrators are refused, the super admin is not", async () => {
    expect((await patch(SWITCH, sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    const refused = await studentStanding(pupilA.id, adminA, { action: "suspend", reason: REASON });
    expect(refused.status).toBe(403);
    expect((await studentStanding(pupilA.id, sa, { action: "suspend", reason: REASON })).status).toBe(200);
    expect((await studentStanding(pupilA.id, adminA, { action: "lift", reason: REASON })).status).toBe(403);
    // and a branch cannot turn it back on while the school has it off
    const widen = await patch(SWITCH, adminA, { scope: "BRANCH", branchId: A.id, enabled: true });
    expect(widen.status).toBe(400);
    expect(await db.auditLog.count({ where: { action: "STANDING_SETTING_CHANGED" } })).toBe(1);
  });

  test("a branch can turn it off for itself only; another branch is unaffected; removing the value turns it back to the default", async () => {
    expect((await patch(SWITCH, adminA, { scope: "BRANCH", branchId: A.id, enabled: false })).status).toBe(200);
    expect((await studentStanding(pupilA.id, adminA, { action: "suspend", reason: REASON })).status).toBe(403);
    expect((await studentStanding(pupilB.id, adminB, { action: "suspend", reason: REASON })).status).toBe(200);
    // not another branch's switch, not the school's
    expect((await patch(SWITCH, adminA, { scope: "BRANCH", branchId: B.id, enabled: false })).status).toBe(404);
    expect((await patch(SWITCH, adminA, { scope: "GLOBAL", enabled: false })).status).toBe(403);
    expect((await patch(SWITCH, adminA, { scope: "BRANCH", branchId: A.id, enabled: null })).status).toBe(200);
    expect((await studentStanding(pupilA.id, adminA, { action: "suspend", reason: REASON })).status).toBe(200);
    const view = await get(SWITCH, adminA);
    expect(view.json.data.canEditSchool).toBe(false);
    expect(view.json.data.branches.map((b: { id: string }) => b.id)).toEqual([A.id]);
  });

  test("a body that names a branch for the school, or no branch for a branch, or an unknown key, is refused", async () => {
    expect((await patch(SWITCH, sa, { scope: "GLOBAL", branchId: A.id, enabled: false })).status).toBe(400);
    expect((await patch(SWITCH, sa, { scope: "BRANCH", enabled: false })).status).toBe(400);
    expect((await patch(SWITCH, sa, { scope: "GLOBAL", enabled: false, extra: 1 })).status).toBe(400);
  });
});

test.describe("a member of staff", () => {
  test("a branch administrator suspends a teacher: the membership is deactivated, the teacher is signed out, and Reactivate is refused", async () => {
    const member = await membershipOf(teacherA.id, A.id);
    const until = day(7);
    const res = await memberStanding(member.id, adminA, { action: "suspend", reason: "Pending an inquiry", until });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.signedOut).toBe(true);

    const after = await membershipOf(teacherA.id, A.id);
    expect(after.standing).toBe("SUSPENDED");
    expect(after.deactivatedAt).not.toBeNull();
    expect(after.standingUntil?.toISOString().slice(0, 10)).toBe(until);
    expect(await db.session.count({ where: { userId: teacherA.id } })).toBe(0);
    expect((await get("/api/v1/students?branchId=" + A.id, teacherA)).status).toBe(401); // signed out

    const list = await get(`/api/v1/members?status=all&branchId=${A.id}`, adminA);
    const row = list.json.data.members.find((m: { id: string }) => m.id === member.id);
    expect(row).toMatchObject({ status: "deactivated", standing: "SUSPENDED", standingUntil: until });

    const reactivate = await post(`/api/v1/members/${member.id}/reactivate`, adminA, {});
    expect(reactivate.status).toBe(409);
    expect(reactivate.json.error.code).toBe("UNDER_STANDING");
    expect((await membershipOf(teacherA.id, A.id)).deactivatedAt).not.toBeNull();

    const lift = await memberStanding(member.id, adminA, { action: "lift", reason: "Cleared of the claim" });
    expect(lift.status).toBe(200);
    const restored = await membershipOf(teacherA.id, A.id);
    expect(restored).toMatchObject({ standing: "ACTIVE", standingUntil: null, deactivatedAt: null });
    expect((await loginAs(teacherA)).status).toBe(200);
  });

  test("a branch administrator can't terminate, go school-wide, touch an administrator or themselves or another branch", async () => {
    const teacher = await membershipOf(teacherA.id, A.id);
    const adminAMember = await membershipOf(adminA.id, A.id);
    const adminBMember = await membershipOf(adminB.id, B.id);
    expect((await memberStanding(teacher.id, adminA, { action: "terminate", reason: REASON })).status).toBe(403);
    expect((await memberStanding(teacher.id, adminA, { action: "suspend", reason: REASON, scope: "SCHOOL" })).status).toBe(403);
    expect((await memberStanding(adminAMember.id, adminA, { action: "suspend", reason: REASON })).status).toBe(409); // yourself
    expect((await memberStanding(adminBMember.id, adminA, { action: "suspend", reason: REASON })).status).toBe(404); // another branch
    const other = await staffIn(A.id, Role.ADMIN, "Second Admin A");
    const otherMember = await membershipOf(other.id, A.id);
    expect((await memberStanding(otherMember.id, adminA, { action: "suspend", reason: REASON })).status).toBe(403); // another administrator
    expect((await memberStanding(otherMember.id, sa, { action: "suspend", reason: REASON })).status).toBe(200); // a super admin may
    expect(await db.standingEvent.count()).toBe(1);
  });

  test("a super admin terminates: the record is archived, a plain restore is refused, reinstating gives everything back", async () => {
    const record = await db.staffRecord.create({
      data: { branchId: A.id, userId: teacherA.id, category: "TEACHING", firstName: "Teacher", lastName: "A" },
    });
    const member = await membershipOf(teacherA.id, A.id);
    const res = await memberStanding(member.id, sa, { action: "terminate", reason: "Contract ended after misconduct" });
    expect(res.status, res.text).toBe(200);
    const gone = await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(gone).toMatchObject({ standing: "TERMINATED" });
    expect(gone.archivedAt).not.toBeNull();
    expect(await membershipOf(teacherA.id, A.id)).toMatchObject({ standing: "TERMINATED" });

    const restore = await post(`/api/v1/staff/${record.id}/restore`, adminA, {});
    expect(restore.status).toBe(409);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } })).archivedAt).not.toBeNull();
    expect((await post(`/api/v1/members/${member.id}/reactivate`, sa, {})).json.error.code).toBe("UNDER_STANDING");

    expect((await memberStanding(member.id, adminA, { action: "reinstate", reason: "Appeal upheld" })).status).toBe(403);
    const back = await memberStanding(member.id, sa, { action: "reinstate", reason: "Appeal upheld" });
    expect(back.status, back.text).toBe(200);
    expect(await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ standing: "ACTIVE", archivedAt: null });
    expect(await membershipOf(teacherA.id, A.id)).toMatchObject({ standing: "ACTIVE", deactivatedAt: null });
  });

  test("a staff record with no sign-in is suspended and terminated by the staff route", async () => {
    const record = await db.staffRecord.create({
      data: { branchId: A.id, category: "NON_TEACHING", firstName: "Gate", lastName: "Keeper" },
    });
    const path = `/api/v1/staff/${record.id}/standing`;
    expect((await post(path, adminA, { action: "suspend", reason: REASON })).status).toBe(200);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } })).standing).toBe("SUSPENDED");
    expect((await post(path, adminA, { action: "terminate", reason: REASON })).status).toBe(403);
    expect((await post(path, sa, { action: "terminate", reason: REASON })).status).toBe(200);
    expect((await post(path, sa, { action: "suspend", reason: "school wide", scope: "SCHOOL" })).status).toBe(400); // no sign-in: nothing school-wide to do
    const history = await get(path, adminA);
    expect(history.json.data.events.map((e: { action: string }) => e.action)).toEqual(["TERMINATED", "SUSPENDED"]);
    const list = await get(`/api/v1/staff?branchId=${A.id}&status=archived`, adminA);
    expect(list.json.data.staff[0]).toMatchObject({ standing: "TERMINATED" });
  });

  test("school-wide: a super admin suspends a person in every branch they belong to, with a history row in each", async () => {
    const both = await staffIn(A.id, Role.TEACHING_STAFF, "Two Branch Teacher");
    await db.membership.create({ data: { userId: both.id, branchId: B.id, role: Role.TEACHING_STAFF } });
    const here = await membershipOf(both.id, A.id);
    const res = await memberStanding(here.id, sa, { action: "suspend", reason: "Under investigation", scope: "SCHOOL" });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.branches.map((b: { branchId: string }) => b.branchId).sort()).toEqual([A.id, B.id].sort());
    expect((await membershipOf(both.id, A.id)).standing).toBe("SUSPENDED");
    expect((await membershipOf(both.id, B.id)).standing).toBe("SUSPENDED");
    expect(await db.standingEvent.count({ where: { userId: both.id, scope: "SCHOOL" } })).toBe(2);
    expect(await db.session.count({ where: { userId: both.id } })).toBe(0);
  });

  test("a suspension in one branch leaves the person's other branch alone", async () => {
    const both = await staffIn(A.id, Role.TEACHING_STAFF, "Two Branch Teacher");
    await db.membership.create({ data: { userId: both.id, branchId: B.id, role: Role.TEACHING_STAFF } });
    expect(
      (await memberStanding((await membershipOf(both.id, A.id)).id, adminA, { action: "suspend", reason: REASON })).json.data.signedOut,
    ).toBe(false);
    expect((await membershipOf(both.id, B.id)).standing).toBe("ACTIVE");
    expect(await db.session.count({ where: { userId: both.id } })).toBe(1);
  });

  test("two super admins who suspend each other at the same moment: one is suspended, the school keeps the other", async () => {
    // An account that is a super admin only by flag and has no branch is not one (withAuth needs an active membership), so the guard is reached by a race: each of the two
    // sees "the other is still a super admin" unless the transaction takes the lock that makes the second one count again.
    await resetDatabase();
    await seedInstance();
    const first = await login(await createUser({ role: Role.ADMIN, name: "Super One" }));
    const second = await login(await createUser({ role: Role.ADMIN, name: "Super Two" }));
    const firstMember = await membershipOf(first.id, (await db.branch.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id);
    const secondMember = await membershipOf(second.id, firstMember.branchId);
    const results = await Promise.all([
      memberStanding(secondMember.id, first, { action: "suspend", reason: REASON }),
      memberStanding(firstMember.id, second, { action: "suspend", reason: REASON }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(
      statuses.filter((status) => status === 200),
      results.map((r) => r.text).join(" | "),
    ).toHaveLength(1);
    // The other one was refused: either by the guard (409 LAST_SUPERADMIN) or, when it arrived after the first had suspended them, because they are no longer a super admin (401, 403, or 404: the person is no longer one this caller administers).
    const refused = results.find((r) => r.status !== 200)!;
    expect([401, 403, 404, 409]).toContain(refused.status);
    if (refused.status === 409) expect(refused.json.error.code).toBe("LAST_SUPERADMIN");
    const standings = [
      (await membershipOf(first.id, firstMember.branchId)).standing,
      (await membershipOf(second.id, firstMember.branchId)).standing,
    ].sort();
    expect(standings).toEqual(["ACTIVE", "SUSPENDED"]);
  });

  test("a suspension that has ended lifts itself at the person's next sign-in, with a history row written by the school's records; a running one does not", async () => {
    const member = await membershipOf(teacherA.id, A.id);
    await db.membership.update({
      where: { id: member.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${day(-1)}T00:00:00Z`), deactivatedAt: new Date() },
    });
    const signIn = await loginAs(teacherA);
    expect(signIn.status, signIn.text).toBe(200);
    expect(await membershipOf(teacherA.id, A.id)).toMatchObject({ standing: "ACTIVE", standingUntil: null, deactivatedAt: null });
    const event = await db.standingEvent.findFirstOrThrow({ where: { membershipId: member.id } });
    expect(event).toMatchObject({ action: "LIFTED", decidedByUserId: "system" });
    const history = await get(`/api/v1/members/${member.id}/standing`, adminA);
    expect(history.json.data.events[0].decidedBy).toMatch(/school's records/i);

    // the last day itself is still a suspended day
    await db.membership.update({
      where: { id: member.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${day(0)}T00:00:00Z`), deactivatedAt: new Date() },
    });
    await loginAs(teacherA);
    expect((await membershipOf(teacherA.id, A.id)).standing).toBe("SUSPENDED");
  });
});

test.describe("the portal", () => {
  const DOB = "2013-05-10";
  const PHONE = "08011110001";
  const portal = (path: string, cookie?: string) => api(`/api/v1/portal${path}`, { cookie });
  const signIn = async (secret: string, admissionNo = "2026/0001") => {
    const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
    return { res, cookie: res.setCookies[0]?.split(";")[0] };
  };

  test("a suspended pupil can sign in and read, but can't hand in work, take quizzes or practise; their guardian is unchanged; the notice is today's standing without the reason", async () => {
    await studentStanding(pupilA.id, sa, { action: "suspend", reason: "A private reason", until: day(4) });
    const pupil = await signIn(DOB);
    expect(pupil.res.status, pupil.res.text).toBe(200);
    expect(pupil.res.json.data.student).toMatchObject({ standing: "SUSPENDED", standingUntil: day(4) });
    expect(JSON.stringify(pupil.res.json)).not.toContain("A private reason");
    const session = await portal("/session", pupil.cookie);
    const access = session.json.data.access[pupilA.id];
    expect(access).toMatchObject({ submitWork: false, takeQuizzes: false, practice: "NONE" });
    expect(access.overview).toBe(true);
    expect((await portal(`/students/${pupilA.id}/overview`, pupil.cookie)).status).toBe(200);

    const guardian = await signIn(PHONE);
    const guardianAccess = (await portal("/session", guardian.cookie)).json.data.access[pupilA.id];
    expect(guardianAccess.overview).toBe(true);
    expect((await portal("/session", guardian.cookie)).json.data.students.find((s: { id: string }) => s.id === pupilA.id)).toMatchObject({
      standing: "SUSPENDED",
    });
  });

  test("when the suspension ends the pupil has everything back, with no one doing anything", async () => {
    await db.studentRecord.update({
      where: { id: pupilA.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${day(-1)}T00:00:00Z`) },
    });
    const pupil = await signIn(DOB);
    expect(pupil.res.json.data.student).toMatchObject({ standing: "ACTIVE", standingUntil: null });
    expect((await portal("/session", pupil.cookie)).json.data.access[pupilA.id].submitWork).toBe(true);
  });

  test("an expelled pupil is refused at sign-in with the one generic sentence; the guardian keeps only the invoices; an open session is cut at once", async () => {
    const before = await signIn(DOB);
    const guardianBefore = await signIn(PHONE);
    expect(before.res.status).toBe(200);
    await studentStanding(pupilA.id, sa, { action: "expel", reason: "Serious misconduct" });

    // the open sessions
    expect((await portal("/session", before.cookie)).status).toBe(401);
    expect((await portal(`/students/${pupilA.id}/overview`, before.cookie)).status).toBe(403);
    const guardianSession = await portal("/session", guardianBefore.cookie);
    // the expelled child stays in the list (for the invoices) beside the sibling in good standing
    expect(guardianSession.json.data.students.map((s: { id: string }) => s.id).sort()).toEqual([pupilA.id, pupilA2.id].sort());
    expect(guardianSession.json.data.access[pupilA.id]).toMatchObject({ invoices: true, overview: false, results: false });
    expect(guardianSession.json.data.access[pupilA2.id].overview).toBe(true);
    expect((await portal(`/students/${pupilA.id}/overview`, guardianBefore.cookie)).status).toBe(403);
    expect((await portal(`/students/${pupilA.id}/results`, guardianBefore.cookie)).status).toBe(403);
    expect((await portal(`/students/${pupilA.id}/invoices`, guardianBefore.cookie)).status).toBe(200);

    // new sign-ins
    const refused = await signIn(DOB);
    expect(refused.res.status).toBe(401);
    const sibling = await signIn(PHONE);
    expect(sibling.res.status).toBe(200);
    const students = sibling.res.json.data.siblingStudents.map((s: { id: string }) => s.id);
    expect(students).toContain(pupilA.id); // the guardian still reaches the child for invoices
    expect(sibling.res.json.data.access[pupilA.id]).toMatchObject({
      invoices: true,
      overview: false,
      results: false,
      materials: false,
      submitWork: false,
    });
    expect(sibling.res.json.data.student).toBeDefined();
  });

  test("reinstating gives the portal back", async () => {
    await studentStanding(pupilA.id, sa, { action: "expel", reason: "Serious misconduct" });
    expect((await signIn(DOB)).res.status).toBe(401);
    await studentStanding(pupilA.id, sa, { action: "reinstate", reason: "Appeal upheld" });
    expect((await signIn(DOB)).res.status).toBe(200);
  });
});
