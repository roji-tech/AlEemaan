import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueEmail, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Programs, slice P2 (task 0043, design note section 9): the people of a program. Who may add, see, move, withdraw and discipline whom; each kind of person; the state of a place read
// from the school's own records; the guards around groups and branches; the checks of the database. Real HTTP against a production build, real database.
// The people: a super admin (sa), an administrator of branch A (adminA), of branch B (adminB), a teacher of A, and a teacher of A who is named program admin (progAdmin).
// The program runs in A and B (not C); its groups are "Juz A" with "Group 1" and "Group 2" inside it, and "Juz B".

const PROGRAMS = "/api/v1/programs";
const SWITCH = "/api/v1/settings/standing";
const REASON = "Left to join another course";
const DAY = 864e5;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

type Person = TestUser & { cookie: string };
let A: { id: string; name: string };
let B: { id: string; name: string };
let C: { id: string; name: string };
let sa: Person;
let adminA: Person;
let adminB: Person;
let teacherA: Person;
let progAdmin: Person;
let program: string;
let juzA: string;
let group1: string;
let group2: string;
let juzB: string;
let pupilA: { id: string };
let pupilA2: { id: string };
let pupilB: { id: string };
let pupilC: { id: string };
let armA: { id: string; name: string };

const login = async (user: TestUser): Promise<Person> => ({ ...user, cookie: cookieHeader((await loginAs(user)).token!) });
async function staffIn(branchId: string, role: Role, name: string): Promise<Person> {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W+/g, "-")) });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return login({ ...user, branchId });
}
const get = (path: string, who: Person) => api(path, { cookie: who.cookie });
const send = (method: string, path: string, who: Person, body?: unknown) => api(path, { method, cookie: who.cookie, body });
const post = (path: string, who: Person, body?: unknown) => send("POST", path, who, body ?? {});

const people = (who: Person, qs = "", id = program) => get(`${PROGRAMS}/${id}/people${qs ? `?${qs}` : ""}`, who);
const add = (who: Person, body: Record<string, unknown>, id = program) => post(`${PROGRAMS}/${id}/people`, who, body);
const addPupil = (who: Person, studentId: string, groupId = group1) => add(who, { kind: "STUDENT", studentId, groupId });
const one = (who: Person, personId: string, id = program) => get(`${PROGRAMS}/${id}/people/${personId}`, who);
const move = (who: Person, personId: string, groupId: string) => post(`${PROGRAMS}/${program}/people/${personId}/move`, who, { groupId });
const place = (who: Person, personId: string, body: Record<string, unknown>) =>
  post(`${PROGRAMS}/${program}/people/${personId}/place`, who, body);
const standing = (who: Person, personId: string, body: Record<string, unknown>) =>
  post(`${PROGRAMS}/${program}/people/${personId}/standing`, who, body);

const adult = (over: Record<string, unknown> = {}) => ({
  kind: "ADULT",
  firstName: "Hauwa",
  lastName: "Bello",
  branchId: A.id,
  groupId: group1,
  phone: "08031234567",
  ...over,
});

async function makePupil(
  branchId: string,
  admissionNo: string,
  firstName: string,
  sessionId: string,
  dob = "2013-05-10",
  arm?: { id: string; name: string },
) {
  const group =
    (await db.classGroup.findFirst({ where: { branchId, name: "JSS 1" } })) ??
    (await db.classGroup.create({ data: { branchId, name: "JSS 1" } }));
  const theArm =
    arm ??
    (await db.classArm.findFirst({ where: { classGroupId: group.id, name: "Gold" } })) ??
    (await db.classArm.create({ data: { branchId, classGroupId: group.id, name: "Gold" } }));
  const student = await db.studentRecord.create({
    data: {
      branchId,
      firstName,
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(dob),
      admissionNo,
      guardianPhone: "+2348011110001",
    },
  });
  await db.studentEnrollment.create({
    data: { studentId: student.id, branchId, sessionId, className: "JSS 1", arm: "Gold", classArmId: theArm.id, status: "ACTIVE" },
  });
  return { student, arm: theArm };
}

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  [A, B, C] = [branches[0]!, branches[1]!, branches[2]!];
  sa = await login(await createUser({ role: Role.ADMIN, name: "Super Admin" }));
  adminA = await login(await createUser({ role: Role.ADMIN, superAdmin: false, name: "Admin A" }));
  adminB = await staffIn(B.id, Role.ADMIN, "Admin B");
  teacherA = await staffIn(A.id, Role.TEACHING_STAFF, "Teacher A");
  progAdmin = await staffIn(A.id, Role.TEACHING_STAFF, "Program Admin");

  const created = await post(PROGRAMS, sa, {
    name: "Quran memorisation",
    kind: "ONGOING",
    branchIds: [A.id, B.id],
    levelLabels: ["Juz", "Group"],
  });
  expect(created.status, created.text).toBe(201);
  program = created.json.data.id;
  const g = async (name: string, parentId: string | null) =>
    (await post(`${PROGRAMS}/${program}/groups`, sa, { name, parentId })).json.data.id as string;
  juzA = await g("Juz A", null);
  group1 = await g("Group 1", juzA);
  group2 = await g("Group 2", juzA);
  juzB = await g("Juz B", null);
  expect((await post(`${PROGRAMS}/${program}/status`, sa, { action: "activate" })).status).toBe(200);
  const named = await post(`${PROGRAMS}/${program}/staff`, sa, { userId: progAdmin.id, branchId: A.id });
  expect(named.status, named.text).toBe(201);

  const sessionA = await db.academicSession.create({
    data: { branchId: A.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const sessionB = await db.academicSession.create({
    data: { branchId: B.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const sessionC = await db.academicSession.create({
    data: { branchId: C.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const a1 = await makePupil(A.id, "2026/0001", "Amina", sessionA.id);
  const a2 = await makePupil(A.id, "2026/0002", "Binta", sessionA.id, "2015-02-03", a1.arm);
  pupilA = a1.student;
  pupilA2 = a2.student;
  armA = a1.arm;
  pupilB = (await makePupil(B.id, "2026/0003", "Cara", sessionB.id, "2012-01-01")).student;
  pupilC = (await makePupil(C.id, "2026/0004", "Dara", sessionC.id, "2011-01-01")).student;
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("reaching the routes", () => {
  test("nobody signed out can read or change anything; a teacher with no place in the program finds no program", async () => {
    const id = pupilA.id;
    for (const [method, path] of [
      ["GET", `${PROGRAMS}/${program}/people`],
      ["POST", `${PROGRAMS}/${program}/people`],
      ["GET", `${PROGRAMS}/${program}/people/candidates?kind=STUDENT&q=am`],
      ["GET", `${PROGRAMS}/${program}/people/classes`],
      ["POST", `${PROGRAMS}/${program}/people/class`],
      ["GET", `${PROGRAMS}/${program}/people/${id}`],
      ["PATCH", `${PROGRAMS}/${program}/people/${id}`],
      ["POST", `${PROGRAMS}/${program}/people/${id}/move`],
      ["POST", `${PROGRAMS}/${program}/people/${id}/place`],
      ["GET", `${PROGRAMS}/${program}/people/${id}/standing`],
      ["POST", `${PROGRAMS}/${program}/people/${id}/standing`],
    ] as const) {
      expect((await api(path, { method, body: method === "GET" ? undefined : {} })).status, `${method} ${path} signed out`).toBe(401);
    }
    // a teacher who is not named in the program, and no branch administrator of it: 404, as for a program that does not exist
    expect((await people(teacherA)).status).toBe(404);
    expect((await addPupil(teacherA, pupilA.id)).status).toBe(404);
    expect((await people(sa, "", "cnotaprogramid00000000000")).status).toBe(404);
  });

  test("a body with a key the route does not know, or a malformed one, is refused", async () => {
    expect((await add(sa, { kind: "STUDENT", studentId: pupilA.id, groupId: group1, role: "ADMIN" })).status).toBe(400);
    expect((await add(sa, { kind: "NOPE", groupId: group1 })).status).toBe(400);
    expect((await add(sa, { kind: "STUDENT", studentId: "../x", groupId: group1 })).status).toBe(400);
    expect((await add(sa, adult({ phone: "abc" }))).status).toBe(400);
    expect((await add(sa, adult({ email: "not an email" }))).status).toBe(400);
    expect((await add(sa, adult({ dateOfBirth: "2999-01-01" }))).status).toBe(400);
    expect((await add(sa, adult({ firstName: "x".repeat(61) }))).status).toBe(400);
    expect((await people(sa, "kind=NOPE")).status).toBe(400);
    expect((await people(sa, "page=0")).status).toBe(400);
    expect(await db.programParticipant.count()).toBe(0);
  });
});

test.describe("adding a pupil or a member of staff (the school's record is linked)", () => {
  test("a super admin adds a pupil: the branch is the record's, the details are read from it, and the list says where they are", async () => {
    const res = await addPupil(sa, pupilA.id);
    expect(res.status, res.text).toBe(201);
    const row = await db.programParticipant.findUniqueOrThrow({ where: { id: res.json.data.id } });
    expect(row).toMatchObject({
      kind: "STUDENT",
      studentId: pupilA.id,
      branchId: A.id,
      groupId: group1,
      status: "ACTIVE",
      standing: "ACTIVE",
      firstName: null,
      lastName: null,
    });
    const list = await people(sa);
    expect(list.json.meta).toMatchObject({ total: 1, page: 1, hasNext: false });
    expect(list.json.data.people[0]).toMatchObject({
      name: "Amina Pupil",
      kind: "STUDENT",
      admissionNo: "2026/0001",
      groupPath: "Juz A–Group 1",
      branchName: A.name,
      status: "ACTIVE",
      state: "ACTIVE",
      linked: true,
    });
    // each addition is in the program's history
    const audit = await db.programAudit.findFirst({ where: { programId: program, action: "PERSON_ADDED" } });
    expect(audit).toMatchObject({ targetType: "Participant", targetId: res.json.data.id });
  });

  test("a pupil is in a program once; a pupil of a branch the program does not run in, an archived or an unknown one is 'not found'", async () => {
    expect((await addPupil(sa, pupilA.id)).status).toBe(201);
    const again = await addPupil(sa, pupilA.id, group2);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("ALREADY_IN");
    expect((await addPupil(sa, pupilC.id)).status).toBe(404); // branch C is not one of the program's
    await db.studentRecord.update({ where: { id: pupilA2.id }, data: { archivedAt: new Date() } });
    expect((await addPupil(sa, pupilA2.id)).status).toBe(404);
    expect((await addPupil(sa, "cnotapupilid000000000000")).status).toBe(404);
    expect(await db.programParticipant.count()).toBe(1);
  });

  test("a group of another program, an archived group and an unknown one are 'not found'", async () => {
    const other = await post(PROGRAMS, sa, { name: "Other", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    const foreign = (await post(`${PROGRAMS}/${other.json.data.id}/groups`, sa, { name: "Foreign" })).json.data.id;
    expect((await addPupil(sa, pupilA.id, foreign)).status).toBe(404);
    expect((await addPupil(sa, pupilA.id, "cnotagroupid0000000000000")).status).toBe(404);
    await send("PATCH", `${PROGRAMS}/${program}/groups/${juzB}`, sa, { archived: true });
    expect((await addPupil(sa, pupilA.id, juzB)).status).toBe(404);
    expect(await db.programParticipant.count()).toBe(0);
  });

  test("a member of staff is added the same way, through the branch of their record", async () => {
    const record = await db.staffRecord.create({
      data: { branchId: B.id, userId: adminB.id, category: "TEACHING", firstName: "Admin", lastName: "B" },
    });
    const res = await add(sa, { kind: "STAFF", staffRecordId: record.id, groupId: group2 });
    expect(res.status, res.text).toBe(201);
    expect(await db.programParticipant.findUniqueOrThrow({ where: { id: res.json.data.id } })).toMatchObject({
      kind: "STAFF",
      staffRecordId: record.id,
      branchId: B.id,
    });
    expect((await add(sa, { kind: "STAFF", staffRecordId: record.id, groupId: group2 })).json.error.code).toBe("ALREADY_IN");
    await db.staffRecord.update({ where: { id: record.id }, data: { archivedAt: new Date() } });
    const gone = await db.staffRecord.create({
      data: { branchId: A.id, category: "NON_TEACHING", firstName: "Left", lastName: "School", archivedAt: new Date() },
    });
    expect((await add(sa, { kind: "STAFF", staffRecordId: gone.id, groupId: group1 })).status).toBe(404);
  });

  test("the program admin and an administrator of a branch may add; a teacher may not", async () => {
    expect((await addPupil(progAdmin, pupilA.id)).status).toBe(201);
    expect((await addPupil(progAdmin, pupilB.id)).status).toBe(201); // a program admin reaches every branch of the program
    expect((await addPupil(adminA, pupilA2.id)).status).toBe(201);
    expect((await addPupil(teacherA, pupilA.id)).status).toBe(404);
  });
});

test.describe("what a branch administrator reaches", () => {
  test("only the people through their own branch: to see, to add and to change", async () => {
    const a = (await addPupil(sa, pupilA.id)).json.data.id;
    const b = (await addPupil(sa, pupilB.id)).json.data.id;
    const mine = await people(adminA);
    expect(mine.json.data.people.map((p: { id: string }) => p.id)).toEqual([a]);
    expect(mine.json.meta.total).toBe(1);
    expect((await one(adminA, b)).status).toBe(404);
    expect((await one(adminA, a)).status).toBe(200);
    expect((await addPupil(adminA, pupilB.id)).status).toBe(404); // a pupil of branch B is not theirs to add
    expect((await move(adminA, b, group2)).status).toBe(404);
    expect((await place(adminA, b, { action: "withdraw", reason: REASON })).status).toBe(404);
    expect((await standing(adminA, b, { action: "suspend", reason: REASON })).status).toBe(404);
    expect((await move(adminA, a, group2)).status).toBe(200);
    // the other branch's administrator sees theirs and not this one
    expect((await people(adminB)).json.data.people.map((p: { id: string }) => p.id)).toEqual([b]);
    // filtering by another branch finds nothing for them, not an error that says it exists
    expect((await people(adminA, `branchId=${B.id}`)).json.data.people).toEqual([]);
  });

  test("a person typed in goes through a branch the program runs in and the person adding manages", async () => {
    expect((await add(adminA, adult({ branchId: A.id }))).status).toBe(201);
    expect((await add(adminA, adult({ firstName: "Zainab", phone: "08099990000", branchId: B.id }))).status).toBe(404);
    expect((await add(sa, adult({ firstName: "Yusuf", phone: "08088880000", branchId: C.id }))).status).toBe(404); // C is not a branch of the program
    expect((await add(progAdmin, adult({ firstName: "Musa", phone: "08077770000", branchId: B.id }))).status).toBe(201);
  });

  test("the program's page counts the people of a group and of what is inside it, and only the ones the viewer may see", async () => {
    await addPupil(sa, pupilA.id, group1);
    await addPupil(sa, pupilA2.id, group2);
    await addPupil(sa, pupilB.id, juzB);
    const full = (await get(`${PROGRAMS}/${program}`, sa)).json.data;
    const count = (id: string) => full.groups.find((g: { id: string }) => g.id === id).people;
    expect([count(juzA), count(group1), count(group2), count(juzB)]).toEqual([2, 1, 1, 1]);
    expect(full.manageBranchIds.sort()).toEqual([A.id, B.id].sort());
    expect(full.can.people).toBe(true);
    const mine = (await get(`${PROGRAMS}/${program}`, adminA)).json.data;
    expect(mine.groups.find((g: { id: string }) => g.id === juzB).people).toBe(0);
    expect(mine.groups.find((g: { id: string }) => g.id === juzA).people).toBe(2);
    expect(mine.manageBranchIds).toEqual([A.id]);
  });
});

test.describe("a person typed in: adult, guardian, child", () => {
  test("an adult and a guardian need names and nothing else; a child also needs a birth date and a guardian's name and phone", async () => {
    expect((await add(sa, adult())).status).toBe(201);
    expect((await add(sa, adult({ kind: "GUARDIAN", firstName: "Maryam", lastName: "Aliyu", phone: undefined }))).status).toBe(201);
    const bare = await add(sa, { kind: "CHILD", firstName: "Binta", lastName: "Musa", branchId: A.id, groupId: group1 });
    expect(bare.status).toBe(400);
    expect(bare.json.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      "body.dateOfBirth",
      "body.guardianName",
      "body.guardianPhone",
    ]);
    const child = await add(sa, {
      kind: "CHILD",
      firstName: "Binta",
      lastName: "Musa",
      branchId: A.id,
      groupId: group1,
      dateOfBirth: "2020-03-04",
      guardianName: "Hauwa Musa",
      guardianPhone: "+2348011110001",
    });
    expect(child.status, child.text).toBe(201);
    const noNames = await add(sa, adult({ firstName: " ", lastName: "" }));
    expect(noNames.status).toBe(400);
  });

  test("a namesake (same name and birth date, or the same phone written another way) is refused until confirmed, and the confirmation is in the history", async () => {
    expect((await add(sa, adult({ dateOfBirth: "1990-04-04" }))).status).toBe(201);
    const same = await add(sa, adult({ phone: "08000000001", dateOfBirth: "1990-04-04" }));
    expect(same.status).toBe(409);
    expect(same.json.error.code).toBe("POSSIBLE_DUPLICATE");
    const phone = await add(sa, adult({ firstName: "Different", lastName: "Name", phone: "+234 803 123 4567" }));
    expect(phone.json.error.code).toBe("POSSIBLE_DUPLICATE");
    expect(await db.programParticipant.count()).toBe(1);
    const sure = await add(sa, adult({ phone: "08000000001", dateOfBirth: "1990-04-04", confirmNamesake: true }));
    expect(sure.status, sure.text).toBe(201);
    const audit = await db.programAudit.findFirst({ where: { targetId: sure.json.data.id, action: "PERSON_ADDED" } });
    expect(audit?.afterValue).toMatchObject({ namesakeConfirmed: true });
    // the same name with nothing else in common is not a namesake
    expect((await add(sa, adult({ phone: "08011112222", dateOfBirth: "1975-01-01" }))).status).toBe(201);
  });

  test("details are edited; a child keeps what a child needs; a linked person's details are the school's record", async () => {
    const child = (
      await add(sa, {
        kind: "CHILD",
        firstName: "Binta",
        lastName: "Musa",
        branchId: A.id,
        groupId: group1,
        dateOfBirth: "2020-03-04",
        guardianName: "Hauwa Musa",
        guardianPhone: "+2348011110001",
      })
    ).json.data.id;
    const edit = (who: Person, id: string, body: unknown) => send("PATCH", `${PROGRAMS}/${program}/people/${id}`, who, body);
    expect((await edit(sa, child, { lastName: "Abubakar", phone: "08055550000" })).status).toBe(200);
    expect(await db.programParticipant.findUniqueOrThrow({ where: { id: child } })).toMatchObject({
      lastName: "Abubakar",
      phone: "08055550000",
    });
    expect((await edit(sa, child, { guardianName: null })).status).toBe(400);
    expect((await edit(sa, child, {})).status).toBe(400);
    expect((await edit(sa, child, { kind: "ADULT" })).status).toBe(400);
    expect((await edit(adminB, child, { lastName: "Nope" })).status).toBe(404);
    const linked = (await addPupil(sa, pupilA.id)).json.data.id;
    const refused = await edit(sa, linked, { lastName: "Changed" });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("LINKED");
  });
});

test.describe("the state of a place is read from the school's own records", () => {
  const stateOf = async (id: string) => (await one(sa, id)).json.data.person.state as string;

  test("a pupil: suspended, lifted, expelled, reinstated and archived on the Students page change the place, with no step in between", async () => {
    const id = (await addPupil(sa, pupilA.id)).json.data.id;
    const std = (action: string, extra: Record<string, unknown> = {}) =>
      post(`/api/v1/students/${pupilA.id}/standing`, sa, { action, reason: "A reason that is long enough", ...extra });
    expect(await stateOf(id)).toBe("ACTIVE");
    expect((await std("suspend")).status).toBe(200);
    expect(await stateOf(id)).toBe("SUSPENDED");
    expect((await people(sa, "state=SUSPENDED")).json.data.people.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await people(sa, "state=ACTIVE")).json.data.people).toEqual([]);
    expect((await std("lift")).status).toBe(200);
    expect(await stateOf(id)).toBe("ACTIVE");
    expect((await std("expel")).status).toBe(200);
    expect(await stateOf(id)).toBe("EXPELLED");
    expect((await std("reinstate")).status).toBe(200);
    expect(await stateOf(id)).toBe("ACTIVE");
    await db.studentRecord.update({ where: { id: pupilA.id }, data: { archivedAt: new Date() } });
    expect(await stateOf(id)).toBe("ENDED_BY_SCHOOL");
    await db.studentRecord.update({ where: { id: pupilA.id }, data: { archivedAt: null } });
    expect(await stateOf(id)).toBe("ACTIVE");
  });

  test("a suspension that has run out is no longer one, with nothing run to end it", async () => {
    const id = (await addPupil(sa, pupilA.id)).json.data.id;
    await db.studentRecord.update({
      where: { id: pupilA.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${day(-1)}T00:00:00Z`) },
    });
    expect(await stateOf(id)).toBe("ACTIVE");
    await db.studentRecord.update({
      where: { id: pupilA.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${day(0)}T00:00:00Z`) },
    });
    expect(await stateOf(id)).toBe("SUSPENDED"); // its last day is still a day of suspension
  });

  test("a member of staff: a branch suspension touches only the place through that branch; a school-wide one reaches every place of the person", async () => {
    const both = await staffIn(A.id, Role.TEACHING_STAFF, "Two Branch Teacher");
    await db.membership.create({ data: { userId: both.id, branchId: B.id, role: Role.TEACHING_STAFF } });
    const recA = await db.staffRecord.create({
      data: { branchId: A.id, userId: both.id, category: "TEACHING", firstName: "Two", lastName: "Branch" },
    });
    const recB = await db.staffRecord.create({
      data: { branchId: B.id, userId: both.id, category: "TEACHING", firstName: "Two", lastName: "Branch" },
    });
    const placeA = (await add(sa, { kind: "STAFF", staffRecordId: recA.id, groupId: group1 })).json.data.id;
    const placeB = (await add(sa, { kind: "STAFF", staffRecordId: recB.id, groupId: group2 })).json.data.id;
    const memberA = await db.membership.findUniqueOrThrow({ where: { userId_branchId: { userId: both.id, branchId: A.id } } });
    expect((await post(`/api/v1/members/${memberA.id}/standing`, sa, { action: "suspend", reason: "Under investigation" })).status).toBe(
      200,
    );
    expect([await stateOf(placeA), await stateOf(placeB)]).toEqual(["SUSPENDED", "ACTIVE"]);
    expect((await post(`/api/v1/members/${memberA.id}/standing`, sa, { action: "lift", reason: "Cleared of the claim" })).status).toBe(200);
    expect(
      (await post(`/api/v1/members/${memberA.id}/standing`, sa, { action: "suspend", reason: "Under investigation", scope: "SCHOOL" }))
        .status,
    ).toBe(200);
    expect([await stateOf(placeA), await stateOf(placeB)]).toEqual(["SUSPENDED", "SUSPENDED"]);
    expect(
      (await post(`/api/v1/members/${memberA.id}/standing`, sa, { action: "lift", reason: "Cleared of the claim", scope: "SCHOOL" }))
        .status,
    ).toBe(200);
    expect([await stateOf(placeA), await stateOf(placeB)]).toEqual(["ACTIVE", "ACTIVE"]);
    // terminated, then reinstated
    expect(
      (await post(`/api/v1/members/${memberA.id}/standing`, sa, { action: "terminate", reason: "Contract ended after misconduct" })).status,
    ).toBe(200);
    expect(await stateOf(placeA)).toBe("TERMINATED");
    expect(
      (await post(`/api/v1/members/${memberA.id}/standing`, sa, { action: "reinstate", reason: "Appeal upheld by the board" })).status,
    ).toBe(200);
    expect(await stateOf(placeA)).toBe("ACTIVE");
    // deactivated with no standing behind it is the school's doing
    await db.membership.update({ where: { id: memberA.id }, data: { deactivatedAt: new Date() } });
    expect(await stateOf(placeA)).toBe("ENDED_BY_SCHOOL");
  });
});

test.describe("suspending and expelling a person who has no school record", () => {
  test("a super admin suspends with a last day, lifts, expels and reinstates; every step is in a history nobody can rewrite", async () => {
    const id = (await add(sa, adult())).json.data.id;
    const until = day(5);
    const s = await standing(sa, id, { action: "suspend", reason: "Disturbing the class", until });
    expect(s.status, s.text).toBe(200);
    expect(s.json.data).toEqual({ standing: "SUSPENDED", until });
    expect((await one(sa, id)).json.data.person).toMatchObject({ state: "SUSPENDED", standing: "SUSPENDED", standingUntil: until });
    expect((await standing(sa, id, { action: "suspend", reason: "Disturbing the class" })).json.error.code).toBe("NOT_APPLICABLE");
    expect((await standing(sa, id, { action: "lift", reason: "Apologised in front of the group" })).status).toBe(200);
    expect((await standing(sa, id, { action: "expel", reason: "Repeated offence after a warning" })).status).toBe(200);
    expect((await one(sa, id)).json.data.person.state).toBe("EXPELLED");
    expect((await standing(sa, id, { action: "lift", reason: "Not a suspension at all" })).json.error.code).toBe("NOT_APPLICABLE");
    expect((await standing(sa, id, { action: "reinstate", reason: "Appeal upheld by the head" })).status).toBe(200);
    const history = await get(`${PROGRAMS}/${program}/people/${id}/standing`, sa);
    expect(history.status).toBe(200);
    expect(history.json.data.standing).toBe("ACTIVE");
    expect(history.json.data.events.map((e: { action: string }) => e.action)).toEqual(["REINSTATED", "EXPELLED", "LIFTED", "SUSPENDED"]);
    expect(history.json.data.events[0]).toMatchObject({ decidedBy: "Super Admin", reason: "Appeal upheld by the head" });
    const event = await db.standingEvent.findFirstOrThrow({ where: { participantId: id } });
    await expect(db.standingEvent.update({ where: { id: event.id }, data: { reason: "A different story" } })).rejects.toThrow();
    await expect(db.standingEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    // the place's own history says the same, with who and why
    const place = (await one(sa, id)).json.data.history as { action: string; reason: string | null }[];
    expect(place.map((h) => h.action)).toEqual(
      expect.arrayContaining(["PERSON_SUSPEND", "PERSON_EXPEL", "PERSON_REINSTATE", "PERSON_ADDED"]),
    );
  });

  test("who may: a program admin and a branch administrator suspend and lift but never expel; another branch's administrator finds no one", async () => {
    const id = (await add(sa, adult({ branchId: A.id }))).json.data.id;
    for (const who of [progAdmin, adminA]) {
      expect((await standing(who, id, { action: "suspend", reason: "Disturbing the class" })).status).toBe(200);
      expect((await standing(who, id, { action: "expel", reason: "Not for me to decide" })).status).toBe(403);
      expect((await standing(who, id, { action: "lift", reason: "Apologised in front of the group" })).status).toBe(200);
    }
    expect((await standing(adminB, id, { action: "suspend", reason: "Disturbing the class" })).status).toBe(404);
    expect((await standing(teacherA, id, { action: "suspend", reason: "Disturbing the class" })).status).toBe(404);
    expect((await standing(adminA, id, { action: "reinstate", reason: "Not for me to decide" })).status).toBe(403);
    expect((await one(sa, id)).json.data.person.state).toBe("ACTIVE");
  });

  test("the school's switch holds program admins and branch administrators alike, and never a super admin", async () => {
    const id = (await add(sa, adult({ branchId: A.id }))).json.data.id;
    expect((await api(SWITCH, { method: "PATCH", cookie: sa.cookie, body: { scope: "GLOBAL", enabled: false } })).status).toBe(200);
    expect((await standing(progAdmin, id, { action: "suspend", reason: "Disturbing the class" })).status).toBe(403);
    expect((await standing(adminA, id, { action: "suspend", reason: "Disturbing the class" })).status).toBe(403);
    const shown = (await people(progAdmin)).json.data.people[0];
    expect(shown.can).toEqual({ suspend: false, remove: false });
    expect((await standing(sa, id, { action: "suspend", reason: "Disturbing the class" })).status).toBe(200);
    expect((await people(sa)).json.data.people[0].can).toEqual({ suspend: true, remove: true });
  });

  test("a pupil's or a member of staff's standing is the school's: it is refused here and says where to change it", async () => {
    const pupil = (await addPupil(sa, pupilA.id)).json.data.id;
    const refused = await standing(sa, pupil, { action: "suspend", reason: "Fighting in the corridor" });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("LINKED");
    expect(refused.json.error.message).toMatch(/Students page/);
    const record = await db.staffRecord.create({
      data: { branchId: A.id, category: "NON_TEACHING", firstName: "Gate", lastName: "Keeper" },
    });
    const staff = (await add(sa, { kind: "STAFF", staffRecordId: record.id, groupId: group1 })).json.data.id;
    expect((await standing(sa, staff, { action: "suspend", reason: "Fighting in the corridor" })).json.error.message).toMatch(/Users page/);
  });

  test("a reason of 3 to 500 characters is required; an unknown key, a past end date and a made-up action are refused; nothing is written", async () => {
    const id = (await add(sa, adult())).json.data.id;
    expect((await standing(sa, id, { action: "suspend" })).status).toBe(400);
    expect((await standing(sa, id, { action: "suspend", reason: "no" })).status).toBe(400);
    expect((await standing(sa, id, { action: "suspend", reason: "x".repeat(501) })).status).toBe(400);
    expect((await standing(sa, id, { action: "terminate", reason: "A pupil is not terminated" })).status).toBe(400);
    expect((await standing(sa, id, { action: "suspend", reason: "Disturbing the class", until: day(-2) })).status).toBe(400);
    expect((await standing(sa, id, { action: "suspend", reason: "Disturbing the class", role: "ADMIN" })).status).toBe(400);
    expect(await db.standingEvent.count()).toBe(0);
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id } })).standing).toBe("ACTIVE");
  });
});

test.describe("moving, leaving and coming back", () => {
  test("a place moves to another live group of the same program and its branch does not change", async () => {
    const id = (await addPupil(sa, pupilA.id, group1)).json.data.id;
    expect((await move(sa, id, group2)).status).toBe(200);
    expect(await db.programParticipant.findUniqueOrThrow({ where: { id } })).toMatchObject({ groupId: group2, branchId: A.id });
    expect((await move(sa, id, group2)).status).toBe(200); // already there: nothing to do
    expect((await move(sa, id, "cnotagroupid0000000000000")).status).toBe(404);
    const audit = await db.programAudit.findFirst({ where: { action: "PERSON_MOVED", targetId: id } });
    expect(audit).toMatchObject({ beforeValue: { groupId: group1 } });
  });

  test("withdrawing needs a reason and ends the place today without deleting anything; coming back opens the same place", async () => {
    const id = (await addPupil(sa, pupilA.id)).json.data.id;
    expect((await place(sa, id, { action: "withdraw" })).status).toBe(400);
    expect((await place(sa, id, { action: "withdraw", reason: "ab" })).status).toBe(400);
    const left = await place(sa, id, { action: "withdraw", reason: REASON });
    expect(left.status, left.text).toBe(200);
    const row = await db.programParticipant.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "WITHDRAWN", endedReason: REASON });
    expect(row.endedOn?.toISOString().slice(0, 10)).toBe(day(0));
    expect((await one(sa, id)).json.data.person).toMatchObject({ state: "WITHDRAWN", status: "WITHDRAWN" });
    expect((await place(sa, id, { action: "withdraw", reason: REASON })).json.error.code).toBe("NOT_APPLICABLE");
    expect((await move(sa, id, group2)).json.error.code).toBe("NOT_ACTIVE");
    // the pupil cannot be added a second time; they are re-enrolled
    expect((await addPupil(sa, pupilA.id)).json.error.code).toBe("LEFT_ALREADY");
    const back = await place(sa, id, { action: "reenrol", reason: "Came back after the break", groupId: group2 });
    expect(back.status, back.text).toBe(200);
    expect(await db.programParticipant.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "ACTIVE",
      endedOn: null,
      endedReason: null,
      groupId: group2,
    });
    expect((await place(sa, id, { action: "reenrol", reason: "Already back in" })).json.error.code).toBe("NOT_APPLICABLE");
    expect(await db.programParticipant.count()).toBe(1); // one row all along
  });

  test("a group that was archived meanwhile has to be replaced before someone comes back to it", async () => {
    const id = (await addPupil(sa, pupilA.id, juzB)).json.data.id;
    await place(sa, id, { action: "withdraw", reason: REASON });
    expect((await send("PATCH", `${PROGRAMS}/${program}/groups/${juzB}`, sa, { archived: true })).status).toBe(200);
    const stuck = await place(sa, id, { action: "reenrol", reason: "Came back after the break" });
    expect(stuck.status).toBe(409);
    expect(stuck.json.error.code).toBe("GROUP_ARCHIVED");
    expect((await place(sa, id, { action: "reenrol", reason: "Came back after the break", groupId: group1 })).status).toBe(200);
  });
});

test.describe("the guards around groups and branches", () => {
  test("a group with people in it cannot be archived until they have moved or left", async () => {
    const id = (await addPupil(sa, pupilA.id, juzB)).json.data.id;
    const blocked = await send("PATCH", `${PROGRAMS}/${program}/groups/${juzB}`, sa, { archived: true });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("HAS_PEOPLE");
    await move(sa, id, group1);
    expect((await send("PATCH", `${PROGRAMS}/${program}/groups/${juzB}`, sa, { archived: true })).status).toBe(200);
    // a group that holds the people of a group inside it is blocked by the inner group first
    expect((await send("PATCH", `${PROGRAMS}/${program}/groups/${juzA}`, sa, { archived: true })).json.error.code).toBe("HAS_GROUPS");
    await place(sa, id, { action: "withdraw", reason: REASON });
    expect((await send("PATCH", `${PROGRAMS}/${program}/groups/${group1}`, sa, { archived: true })).status).toBe(200); // the person left, the group may go
  });

  test("a branch cannot leave the program while people are, or were, in it through that branch; the database refuses too", async () => {
    const id = (await addPupil(sa, pupilB.id)).json.data.id;
    const blocked = await send("DELETE", `${PROGRAMS}/${program}/branches/${B.id}`, sa);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("BRANCH_HAS_PEOPLE");
    await place(sa, id, { action: "withdraw", reason: REASON });
    expect((await send("DELETE", `${PROGRAMS}/${program}/branches/${B.id}`, sa)).json.error.code).toBe("BRANCH_HAS_PEOPLE"); // a person who left still counts
    await expect(db.programBranch.delete({ where: { programId_branchId: { programId: program, branchId: B.id } } })).rejects.toThrow();
    // a branch with nobody (and no program admin serving through it) can go
    expect((await post(`${PROGRAMS}/${program}/branches`, sa, { branchId: C.id })).status).toBe(201);
    expect((await send("DELETE", `${PROGRAMS}/${program}/branches/${C.id}`, sa)).status).toBe(200);
  });

  test("an archived program and a program switched off are read only; a branch with programs switched off takes no one new", async () => {
    await addPupil(sa, pupilA.id);
    const list = await people(sa);
    expect(list.status).toBe(200);
    // a branch that switched programs off: the settings route says so
    expect(
      (
        await api("/api/v1/settings/programs", {
          method: "PATCH",
          cookie: adminB.cookie,
          body: { scope: "BRANCH", branchId: B.id, enabled: false },
        })
      ).status,
    ).toBe(200);
    const off = await addPupil(sa, pupilB.id);
    expect(off.status).toBe(409);
    expect(off.json.error.code).toBe("BRANCH_PROGRAMS_OFF");
    expect(
      (
        await api("/api/v1/settings/programs", {
          method: "PATCH",
          cookie: adminB.cookie,
          body: { scope: "BRANCH", branchId: B.id, enabled: null },
        })
      ).status,
    ).toBe(200);
    // the whole school off
    expect(
      (await api("/api/v1/settings/programs", { method: "PATCH", cookie: sa.cookie, body: { scope: "GLOBAL", enabled: false } })).status,
    ).toBe(200);
    expect((await addPupil(sa, pupilA2.id)).json.error.code).toBe("PROGRAMS_OFF");
    expect((await people(sa)).status).toBe(200); // still readable
    expect((await get(`${PROGRAMS}/${program}`, sa)).json.data.can.people).toBe(false);
    expect(
      (await api("/api/v1/settings/programs", { method: "PATCH", cookie: sa.cookie, body: { scope: "GLOBAL", enabled: null } })).status,
    ).toBe(200);
    // archived
    expect((await post(`${PROGRAMS}/${program}/status`, sa, { action: "archive" })).status).toBe(200);
    expect((await addPupil(sa, pupilA2.id)).json.error.code).toBe("PROGRAM_READ_ONLY");
    expect((await people(sa)).status).toBe(200);
  });
});

test.describe("adding a whole class, and finding records to add", () => {
  test("the classes on offer are the ones of the branches the viewer manages", async () => {
    const all = (await get(`${PROGRAMS}/${program}/people/classes`, sa)).json.data as {
      id: string;
      branchId: string;
      pupils: number;
      label: string;
    }[];
    expect(all.map((c) => c.branchId).sort()).toEqual([A.id, B.id].sort());
    expect(all.find((c) => c.id === armA.id)).toMatchObject({ label: "JSS 1 Gold", pupils: 2 });
    const mine = (await get(`${PROGRAMS}/${program}/people/classes`, adminA)).json.data as { branchId: string }[];
    expect(mine.every((c) => c.branchId === A.id)).toBe(true);
  });

  test("without 'confirm' it only says who would be added and who skipped; with it, one step adds them and the history says so", async () => {
    const already = await addPupil(sa, pupilA2.id, group2);
    expect(already.status).toBe(201);
    await db.studentRecord.update({ where: { id: pupilA.id }, data: { standing: "SUSPENDED" } });
    const extra = await makePupil(
      A.id,
      "2026/0009",
      "Eze",
      (await db.academicSession.findFirstOrThrow({ where: { branchId: A.id } })).id,
      "2014-01-01",
      armA,
    );
    await db.studentRecord.update({ where: { id: extra.student.id }, data: { standing: "EXPELLED" } });
    const preview = await post(`${PROGRAMS}/${program}/people/class`, sa, { classArmId: armA.id, groupId: group1 });
    expect(preview.status, preview.text).toBe(200);
    expect(preview.json.data.willAdd.map((p: { name: string }) => p.name)).toEqual(["Amina Pupil"]);
    expect(preview.json.data.willAdd[0].note).toBe("Suspended");
    expect(preview.json.data.skipped.map((s: { reason: string }) => s.reason).sort()).toEqual(["ALREADY_IN", "EXPELLED"]);
    expect(preview.json.data.added).toBe(0);
    expect(await db.programParticipant.count()).toBe(1); // nothing happened
    const done = await post(`${PROGRAMS}/${program}/people/class`, sa, { classArmId: armA.id, groupId: group1, confirm: true });
    expect(done.status).toBe(200);
    expect(done.json.data.added).toBe(1);
    expect(await db.programParticipant.count()).toBe(2);
    expect(await db.programAudit.count({ where: { action: "CLASS_ADDED" } })).toBe(1);
    // doing it again adds nobody
    const again = await post(`${PROGRAMS}/${program}/people/class`, sa, { classArmId: armA.id, groupId: group1, confirm: true });
    expect(again.json.data.added).toBe(0);
  });

  test("a branch administrator adds the classes of their own branch only; a class of a branch the program does not run in is not found", async () => {
    expect(
      (await post(`${PROGRAMS}/${program}/people/class`, adminB, { classArmId: armA.id, groupId: group1, confirm: true })).status,
    ).toBe(404);
    expect(
      (await post(`${PROGRAMS}/${program}/people/class`, adminA, { classArmId: armA.id, groupId: group1, confirm: true })).status,
    ).toBe(200);
    const armC = await db.classArm.create({
      data: { branchId: C.id, classGroupId: (await db.classGroup.create({ data: { branchId: C.id, name: "JSS 3" } })).id, name: "Red" },
    });
    expect((await post(`${PROGRAMS}/${program}/people/class`, sa, { classArmId: armC.id, groupId: group1, confirm: true })).status).toBe(
      404,
    );
  });

  test("a search finds records in branches the viewer manages, says who is already in, and answers nothing to a search that is too short", async () => {
    await addPupil(sa, pupilA.id);
    const find = (who: Person, q: string, kind = "STUDENT") =>
      get(`${PROGRAMS}/${program}/people/candidates?kind=${kind}&q=${encodeURIComponent(q)}`, who);
    const found = (await find(sa, "pupil")).json.data as { name: string; note: string | null; branchId: string }[];
    expect(found.map((c) => c.name).sort()).toEqual(["Amina Pupil", "Binta Pupil", "Cara Pupil"]); // not Dara, in branch C
    expect(found.find((c) => c.name === "Amina Pupil")?.note).toBe("Already in this program");
    expect((await find(adminA, "pupil")).json.data.map((c: { name: string }) => c.name).sort()).toEqual(["Amina Pupil", "Binta Pupil"]);
    expect((await find(sa, "a")).json.data).toEqual([]);
    expect((await find(sa, "2026/0003")).json.data.map((c: { name: string }) => c.name)).toEqual(["Cara Pupil"]);
    expect((await get(`${PROGRAMS}/${program}/people/candidates?kind=STAFF&q=zz`, sa)).json.data).toEqual([]);
  });
});

test.describe("the list", () => {
  test("search, group, kind and state filters; 50 to a page; a group includes what is inside it", async () => {
    await addPupil(sa, pupilA.id, group1);
    await addPupil(sa, pupilB.id, juzB);
    await add(sa, adult({ firstName: "Hauwa", lastName: "Bello", branchId: A.id, groupId: group2 }));
    expect((await people(sa)).json.meta.total).toBe(3);
    expect((await people(sa, "q=hauwa")).json.data.people.map((p: { name: string }) => p.name)).toEqual(["Hauwa Bello"]);
    expect((await people(sa, "q=2026/0003")).json.data.people.map((p: { name: string }) => p.name)).toEqual(["Cara Pupil"]);
    expect((await people(sa, `groupId=${juzA}`)).json.meta.total).toBe(2); // Group 1 and Group 2 are inside Juz A
    expect((await people(sa, `groupId=${group2}`)).json.meta.total).toBe(1);
    expect((await people(sa, "kind=ADULT")).json.meta.total).toBe(1);
    expect((await people(sa, "kind=STUDENT")).json.meta.total).toBe(2);
    expect((await people(sa, `branchId=${B.id}`)).json.meta.total).toBe(1);
    expect((await people(sa, "q=nobody")).json.data.people).toEqual([]);
    expect((await people(sa, "q=%25")).json.data.people).toEqual([]); // a wildcard is text
  });

  test("a second page is a second page", async () => {
    const group = await db.programGroup.findFirstOrThrow({ where: { id: group1 } });
    await db.programParticipant.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        programId: program,
        kind: "ADULT" as const,
        firstName: `Person${i}`,
        lastName: "Many",
        groupId: group.id,
        branchId: A.id,
        joinedOn: new Date(`2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
        createdByUserId: sa.id,
      })),
    });
    const first = await people(sa);
    expect(first.json.data.people).toHaveLength(50);
    expect(first.json.meta).toMatchObject({ total: 55, hasNext: true });
    const second = await people(sa, "page=2");
    expect(second.json.data.people).toHaveLength(5);
    expect(second.json.meta.hasNext).toBe(false);
    const ids = new Set([...first.json.data.people, ...second.json.data.people].map((p: { id: string }) => p.id));
    expect(ids.size).toBe(55); // no one twice, no one missing
  });
});

test.describe("races", () => {
  test("the same pupil added twice at the same moment: one place", async () => {
    const results = await Promise.all([1, 2, 3].map(() => addPupil(sa, pupilA.id)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await db.programParticipant.count()).toBe(1);
  });

  test("a group is archived while someone is being added to it: either the person is in and the group stays, or the group is gone and they are told", async () => {
    const [added, archived] = await Promise.all([
      addPupil(sa, pupilA.id, juzB),
      send("PATCH", `${PROGRAMS}/${program}/groups/${juzB}`, sa, { archived: true }),
    ]);
    const inside = await db.programParticipant.count({ where: { groupId: juzB, status: "ACTIVE" } });
    const group = await db.programGroup.findUniqueOrThrow({ where: { id: juzB } });
    // never a live place in an archived group
    expect(inside > 0 && group.archivedAt !== null).toBe(false);
    expect([added.status, archived.status].some((status) => status === 201 || status === 200)).toBe(true);
  });
});

test.describe("what the database refuses even if a caller forgets", () => {
  const base = () => ({
    programId: program,
    groupId: group1,
    branchId: A.id,
    joinedOn: new Date("2026-11-01T00:00:00Z"),
    createdByUserId: "x",
  });

  test("a linked person keeps no details here, a typed-in one needs names, a child needs a birth date and a guardian", async () => {
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: pupilA.id, firstName: "Copied" } }),
    ).rejects.toThrow();
    await expect(db.programParticipant.create({ data: { ...base(), kind: "STUDENT" } })).rejects.toThrow(); // no record
    await expect(db.programParticipant.create({ data: { ...base(), kind: "ADULT" } })).rejects.toThrow(); // no names
    await expect(db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: " ", lastName: "x" } })).rejects.toThrow();
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "B", studentId: pupilA.id } }),
    ).rejects.toThrow();
    await expect(db.programParticipant.create({ data: { ...base(), kind: "CHILD", firstName: "A", lastName: "B" } })).rejects.toThrow();
    await expect(
      db.programParticipant.create({
        data: { ...base(), kind: "CHILD", firstName: "A", lastName: "B", dateOfBirth: new Date("2020-01-01"), guardianName: "G" },
      }),
    ).rejects.toThrow(); // no guardian phone
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "x".repeat(61), lastName: "B" } }),
    ).rejects.toThrow();
    await db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "B" } }); // the plain one is fine
  });

  test("a person is in the program through the branch of their own record, a group of this program, and a branch the program runs in", async () => {
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: pupilA.id, branchId: B.id } }),
    ).rejects.toThrow(); // A's pupil through B
    const other = await post(PROGRAMS, sa, { name: "Other", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    const foreign = (await post(`${PROGRAMS}/${other.json.data.id}/groups`, sa, { name: "Foreign" })).json.data.id;
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "B", groupId: foreign } }),
    ).rejects.toThrow();
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "B", branchId: C.id } }),
    ).rejects.toThrow();
    await db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: pupilA.id } });
    await expect(db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: pupilA.id } })).rejects.toThrow(); // twice
  });

  test("standing on the row: a linked person is always active; a typed-in one is never terminated; only a suspension has an end date; a place that ended has dates in order", async () => {
    const adultRow = await db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "B" } });
    const pupilRow = await db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: pupilA.id } });
    await expect(db.programParticipant.update({ where: { id: pupilRow.id }, data: { standing: "SUSPENDED" } })).rejects.toThrow();
    await expect(db.programParticipant.update({ where: { id: adultRow.id }, data: { standing: "TERMINATED" } })).rejects.toThrow();
    await expect(
      db.programParticipant.update({ where: { id: adultRow.id }, data: { standing: "ACTIVE", standingUntil: new Date("2026-12-01") } }),
    ).rejects.toThrow();
    await db.programParticipant.update({
      where: { id: adultRow.id },
      data: { standing: "SUSPENDED", standingUntil: new Date("2026-12-01") },
    });
    await expect(
      db.programParticipant.update({ where: { id: adultRow.id }, data: { status: "WITHDRAWN", endedOn: new Date("2026-10-01") } }),
    ).rejects.toThrow(); // before joining
    await expect(db.programParticipant.update({ where: { id: adultRow.id }, data: { endedOn: new Date("2026-11-30") } })).rejects.toThrow(); // still active
  });

  test("a history row of a typed-in person needs its participant and no other subject; an expulsion fits it, a termination does not", async () => {
    const row = {
      subject: "PARTICIPANT" as const,
      branchId: A.id,
      action: "SUSPENDED" as const,
      reason: "A good reason",
      startsOn: new Date(),
      decidedByUserId: sa.id,
    };
    await expect(db.standingEvent.create({ data: row })).rejects.toThrow(); // no participant
    await expect(db.standingEvent.create({ data: { ...row, participantId: "p", studentId: pupilA.id } })).rejects.toThrow(); // two subjects
    await expect(db.standingEvent.create({ data: { ...row, participantId: "p", action: "TERMINATED" } })).rejects.toThrow();
    await db.standingEvent.create({ data: { ...row, participantId: "p", action: "EXPELLED" } });
    // the older subjects still hold
    await expect(
      db.standingEvent.create({ data: { ...row, subject: "STUDENT", studentId: pupilA.id, participantId: "p" } }),
    ).rejects.toThrow();
  });
});
