import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueEmail, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Programs, slice P3 (task 0043, design note section 10): program staff with their groups, the roll call, who may mark what and for which days, the correction history, the three
// levels of the attendance switch, and the numbers. Real HTTP against a production build, real database.
// The people: a super admin (sa), an administrator of branch A (adminA) and of branch B (adminB), a program admin (progAdmin), a supervisor, a teacher of "Juz A" (so of the groups
// inside it), a recorder of "Group 1", and a teacher with no groups (loner). The program runs in A and B; groups: "Juz A" with "Group 1" and "Group 2" inside it, and "Juz B".
// The people in it: Amina (A, Group 1), Binta (A, Group 2), Cara (B, Group 1) and Hauwa, an adult typed in (A, Juz B).

const PROGRAMS = "/api/v1/programs";
const DAY = 864e5;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

type Person = TestUser & { cookie: string };
let A: { id: string };
let B: { id: string };
let sa: Person;
let adminA: Person;
let adminB: Person;
let progAdmin: Person;
let supervisor: Person;
let teacher: Person;
let recorder: Person;
let loner: Person;
let program: string;
let juzA: string;
let group1: string;
let group2: string;
let juzB: string;
let amina: string;
let binta: string;
let cara: string;
let hauwa: string;
let staffIds: { supervisor: string; teacher: string; recorder: string; loner: string };

const login = async (user: TestUser): Promise<Person> => ({ ...user, cookie: cookieHeader((await loginAs(user)).token!) });
async function staffIn(branchId: string, role: Role, name: string): Promise<Person> {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W+/g, "-")) });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return login({ ...user, branchId });
}
const get = (path: string, who: Person) => api(path, { cookie: who.cookie });
const send = (method: string, path: string, who: Person, body?: unknown) => api(path, { method, cookie: who.cookie, body });
const post = (path: string, who: Person, body?: unknown) => send("POST", path, who, body ?? {});

const ATT = `${PROGRAMS}`;
const roll = (who: Person, groupId: string, date = day(0), label = "", id = program) =>
  get(`${ATT}/${id}/attendance?groupId=${groupId}&date=${date}${label ? `&label=${encodeURIComponent(label)}` : ""}`, who);
type Mark = { participantId: string; status: string; remarks?: string | null; version?: number };
const mark = (who: Person, groupId: string, marks: Mark[], over: Record<string, unknown> = {}, id = program) =>
  send("PUT", `${ATT}/${id}/attendance`, who, { groupId, date: day(0), label: "", marks, ...over });
const present = (...ids: string[]): Mark[] => ids.map((participantId) => ({ participantId, status: "PRESENT" }));
const rowOf = (res: { json: { data: { rows: { participantId: string }[] } } }, participantId: string) =>
  res.json.data.rows.find((row) => row.participantId === participantId);
const sessions = (who: Person, qs: string) => get(`${ATT}/${program}/attendance/sessions?${qs}`, who);
const summary = (who: Person, qs: string) => get(`${ATT}/${program}/attendance/summary?${qs}`, who);
const history = (who: Person, personId: string, qs = "") =>
  get(`${ATT}/${program}/attendance/people/${personId}${qs ? `?${qs}` : ""}`, who);
const programSettings = (who: Person, body: Record<string, unknown>, id = program) =>
  send("PATCH", `${PROGRAMS}/${id}/settings`, who, body);
const attendanceSwitch = (who: Person, body: Record<string, unknown>) => send("PATCH", "/api/v1/settings/programs-attendance", who, body);
const detail = async (who: Person) => (await get(`${PROGRAMS}/${program}`, who)).json.data;
const assign = (who: Person, staffId: string, groupIds: string[]) =>
  send("PUT", `${PROGRAMS}/${program}/staff/${staffId}/groups`, who, { groupIds });
const marksInDb = () => db.programAttendance.count();
const sessionsInDb = () => db.programSession.count();

async function makePupil(branchId: string, admissionNo: string, firstName: string, sessionId: string) {
  const group =
    (await db.classGroup.findFirst({ where: { branchId, name: "JSS 1" } })) ??
    (await db.classGroup.create({ data: { branchId, name: "JSS 1" } }));
  const arm =
    (await db.classArm.findFirst({ where: { classGroupId: group.id, name: "Gold" } })) ??
    (await db.classArm.create({ data: { branchId, classGroupId: group.id, name: "Gold" } }));
  const student = await db.studentRecord.create({
    data: {
      branchId,
      firstName,
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo,
      guardianPhone: "+2348011110001",
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
  progAdmin = await staffIn(A.id, Role.TEACHING_STAFF, "Program Admin");
  supervisor = await staffIn(A.id, Role.TEACHING_STAFF, "Supervisor");
  teacher = await staffIn(A.id, Role.TEACHING_STAFF, "Teacher");
  recorder = await staffIn(A.id, Role.NON_TEACHING_STAFF, "Recorder");
  loner = await staffIn(A.id, Role.TEACHING_STAFF, "Loner");

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
  const name = async (who: Person, role: string) => {
    const named = await post(`${PROGRAMS}/${program}/staff`, sa, { userId: who.id, branchId: A.id, role });
    expect(named.status, named.text).toBe(201);
    return named.json.data.id as string;
  };
  await name(progAdmin, "ADMIN");
  staffIds = {
    supervisor: await name(supervisor, "SUPERVISOR"),
    teacher: await name(teacher, "TEACHER"),
    recorder: await name(recorder, "RECORDER"),
    loner: await name(loner, "TEACHER"),
  };
  expect((await assign(sa, staffIds.teacher, [juzA])).status).toBe(200);
  expect((await assign(sa, staffIds.recorder, [group1])).status).toBe(200);

  const sessionA = await db.academicSession.create({
    data: { branchId: A.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const sessionB = await db.academicSession.create({
    data: { branchId: B.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const pupilA = await makePupil(A.id, "2026/0001", "Amina", sessionA.id);
  const pupilA2 = await makePupil(A.id, "2026/0002", "Binta", sessionA.id);
  const pupilB = await makePupil(B.id, "2026/0003", "Cara", sessionB.id);
  const addPupil = async (studentId: string, groupId: string) => {
    const added = await post(`${PROGRAMS}/${program}/people`, sa, { kind: "STUDENT", studentId, groupId });
    expect(added.status, added.text).toBe(201);
    return added.json.data.id as string;
  };
  amina = await addPupil(pupilA.id, group1);
  binta = await addPupil(pupilA2.id, group2);
  cara = await addPupil(pupilB.id, group1);
  const adult = await post(`${PROGRAMS}/${program}/people`, sa, {
    kind: "ADULT",
    firstName: "Hauwa",
    lastName: "Bello",
    branchId: A.id,
    groupId: juzB,
    phone: "08031234567",
  });
  expect(adult.status, adult.text).toBe(201);
  hauwa = adult.json.data.id;
  // Everyone joined a month ago, so earlier days have rolls.
  await db.programParticipant.updateMany({ data: { joinedOn: new Date(day(-30)) } });
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("reaching the routes", () => {
  test("nobody signed out can read or change anything; a member of staff with no place finds no program", async () => {
    for (const [method, path] of [
      ["GET", `${ATT}/${program}/attendance?groupId=${group1}&date=${day(0)}`],
      ["PUT", `${ATT}/${program}/attendance`],
      ["GET", `${ATT}/${program}/attendance/sessions?from=${day(-6)}&to=${day(0)}`],
      ["GET", `${ATT}/${program}/attendance/summary?from=${day(-6)}&to=${day(0)}`],
      ["GET", `${ATT}/${program}/attendance/people/${amina}`],
      ["PATCH", `${PROGRAMS}/${program}/settings`],
      ["PUT", `${PROGRAMS}/${program}/staff/${staffIds.teacher}/groups`],
      ["GET", "/api/v1/settings/programs-attendance"],
      ["PATCH", "/api/v1/settings/programs-attendance"],
    ] as const) {
      expect((await api(path, { method, body: method === "GET" ? undefined : {} })).status, `${method} ${path} signed out`).toBe(401);
    }
    const outsider = await staffIn(B.id, Role.TEACHING_STAFF, "Outsider");
    expect((await roll(outsider, group1)).status).toBe(404);
    expect((await mark(outsider, group1, present(amina))).status).toBe(404);
    expect((await summary(outsider, `from=${day(-6)}&to=${day(0)}`)).status).toBe(404);
    expect((await history(outsider, amina)).status).toBe(404);
    expect((await programSettings(outsider, { lowAttendancePercent: 50 })).status).toBe(404);
  });
});

test.describe("program staff and their groups", () => {
  test("a super admin names every role; a program admin names all but an admin; a branch administrator and a teacher name no one", async () => {
    const fresh = await staffIn(A.id, Role.TEACHING_STAFF, "Fresh");
    const body = (role: string) => ({ userId: fresh.id, branchId: A.id, role });
    expect((await post(`${PROGRAMS}/${program}/staff`, progAdmin, body("ADMIN"))).status).toBe(403);
    expect((await post(`${PROGRAMS}/${program}/staff`, adminA, body("TEACHER"))).status).toBe(403);
    expect((await post(`${PROGRAMS}/${program}/staff`, teacher, body("TEACHER"))).status).toBe(403);
    expect((await post(`${PROGRAMS}/${program}/staff`, supervisor, body("RECORDER"))).status).toBe(403);
    const byProgAdmin = await post(`${PROGRAMS}/${program}/staff`, progAdmin, body("TEACHER"));
    expect(byProgAdmin.status, byProgAdmin.text).toBe(201);
    expect((await post(`${PROGRAMS}/${program}/staff`, progAdmin, body("TEACHER"))).json.error.code).toBe("ALREADY");
    expect((await post(`${PROGRAMS}/${program}/staff`, sa, body("ADMIN"))).status).toBe(201);
    expect((await post(`${PROGRAMS}/${program}/staff`, sa, { ...body("OWNER") })).status).toBe(400);
    // only a member of staff of a branch the program runs in
    const pupilUser = await createUser({ name: "Parent", email: uniqueEmail("parent") });
    await db.membership.create({ data: { userId: pupilUser.id, branchId: A.id, role: Role.PARENT } });
    expect((await post(`${PROGRAMS}/${program}/staff`, sa, { userId: pupilUser.id, branchId: A.id, role: "TEACHER" })).status).toBe(400);
    const elsewhere = await db.branch.create({ data: { name: "Not in the program" } });
    expect((await post(`${PROGRAMS}/${program}/staff`, sa, { userId: fresh.id, branchId: elsewhere.id, role: "TEACHER" })).status).toBe(
      400,
    );
  });

  test("the candidates for a role are the staff who do not hold it yet", async () => {
    const asTeacher = await get(`${PROGRAMS}/${program}/staff/candidates?role=TEACHER`, sa);
    expect(asTeacher.status, asTeacher.text).toBe(200);
    const ids = (asTeacher.json.data as { userId: string }[]).map((c) => c.userId);
    expect(ids).not.toContain(teacher.id);
    expect(ids).toContain(supervisor.id);
    expect((await get(`${PROGRAMS}/${program}/staff/candidates?role=TEACHER`, progAdmin)).status).toBe(200);
    expect((await get(`${PROGRAMS}/${program}/staff/candidates?role=ADMIN`, progAdmin)).status).toBe(403);
    expect((await get(`${PROGRAMS}/${program}/staff/candidates?role=TEACHER`, teacher)).status).toBe(403);
    expect((await get(`${PROGRAMS}/${program}/staff/candidates?role=BOSS`, sa)).status).toBe(400);
  });

  test("groups: set, replace, clear; only for a teacher or a recorder; only live groups of this program; only a super admin or a program admin", async () => {
    const shown = (await detail(sa)).staff as { id: string; groupIds: string[] }[];
    expect(shown.find((p) => p.id === staffIds.teacher)!.groupIds).toEqual([juzA]);
    expect(shown.find((p) => p.id === staffIds.loner)!.groupIds).toEqual([]);

    expect((await assign(progAdmin, staffIds.teacher, [juzA, juzB])).status).toBe(200);
    expect(
      ((await detail(sa)).staff as { id: string; groupIds: string[] }[]).find((p) => p.id === staffIds.teacher)!.groupIds.sort(),
    ).toEqual([juzA, juzB].sort());
    expect((await assign(sa, staffIds.teacher, [])).status).toBe(200);
    expect(await db.programStaffGroup.count({ where: { programStaffId: staffIds.teacher } })).toBe(0);
    expect((await assign(sa, staffIds.teacher, [juzA])).status).toBe(200);

    const refused = await assign(sa, staffIds.supervisor, [juzA]);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NO_GROUPS_FOR_ROLE");
    const admin = (await db.programStaff.findFirstOrThrow({ where: { programId: program, userId: progAdmin.id } })).id;
    expect((await assign(sa, admin, [juzA])).json.error.code).toBe("NO_GROUPS_FOR_ROLE");

    // a group of another program, a group that does not exist, a malformed id
    const other = await post(PROGRAMS, sa, { name: "Other program", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    const foreign = (await post(`${PROGRAMS}/${other.json.data.id}/groups`, sa, { name: "Foreign", parentId: null })).json.data.id;
    expect((await assign(sa, staffIds.teacher, [foreign])).status).toBe(404);
    expect((await assign(sa, staffIds.teacher, ["not an id"])).status).toBe(400);
    expect((await assign(sa, staffIds.teacher, ["a".repeat(65)])).status).toBe(400);
    expect((await assign(sa, staffIds.teacher, ["well-formed-but-nothing"])).status).toBe(404);
    expect((await assign(sa, "not-an-id", [juzA])).status).toBe(404);
    expect((await send("PUT", `${PROGRAMS}/${program}/staff/${staffIds.teacher}/groups`, sa, { groupIds: [juzA], extra: 1 })).status).toBe(
      400,
    );
    // nothing was changed by the refusals
    expect((await db.programStaffGroup.findMany({ where: { programStaffId: staffIds.teacher } })).map((r) => r.groupId)).toEqual([juzA]);

    // nobody else changes groups, not even the teacher for themself
    for (const who of [teacher, supervisor, recorder, adminA, adminB])
      expect([403, 404], `${who.name}`).toContain((await assign(who, staffIds.teacher, [juzB])).status);
    expect((await db.programAudit.count({ where: { programId: program, action: "STAFF_GROUPS_CHANGED" } })) > 0).toBe(true);
  });

  test("a group that still has a teacher or a recorder is not archived: the assignment goes first", async () => {
    const spare = (await post(`${PROGRAMS}/${program}/groups`, sa, { name: "Spare", parentId: null })).json.data.id;
    expect((await assign(sa, staffIds.teacher, [juzA, spare])).status).toBe(200);
    const refused = await send("PATCH", `${PROGRAMS}/${program}/groups/${spare}`, sa, { archived: true });
    expect(refused.status, refused.text).toBe(409);
    expect(refused.json.error.code).toBe("HAS_STAFF");
    expect((await assign(sa, staffIds.teacher, [juzA])).status).toBe(200);
    expect((await send("PATCH", `${PROGRAMS}/${program}/groups/${spare}`, sa, { archived: true })).status).toBe(200);
    // an archived group cannot be given to anyone
    expect((await assign(sa, staffIds.teacher, [juzA, spare])).status).toBe(404);
  });

  test("an ended place loses its authority at once, and naming the person again does not bring the old groups back", async () => {
    expect((await roll(teacher, group1)).status).toBe(200);
    const ended = await send("DELETE", `${PROGRAMS}/${program}/staff/${staffIds.teacher}`, progAdmin);
    expect(ended.status, ended.text).toBe(200);
    expect((await roll(teacher, group1)).status).toBe(404);
    expect((await get(`${PROGRAMS}/${program}`, teacher)).status).toBe(404);
    const again = await post(`${PROGRAMS}/${program}/staff`, sa, { userId: teacher.id, branchId: A.id, role: "TEACHER" });
    expect(again.status, again.text).toBe(201);
    // named again with no groups: the program is theirs to open, and nothing in it
    expect((await roll(teacher, group1)).status).toBe(404);
    expect((await mark(teacher, group1, present(amina))).status).toBe(404);
    expect(await db.programStaffGroup.count({ where: { programStaffId: staffIds.teacher } })).toBe(0);
  });

  test("an administrator's place is ended by a super admin only; a deactivated membership ends the authority at once", async () => {
    const adminPlace = (await db.programStaff.findFirstOrThrow({ where: { programId: program, userId: progAdmin.id } })).id;
    expect((await send("DELETE", `${PROGRAMS}/${program}/staff/${adminPlace}`, progAdmin)).status).toBe(403);
    expect((await roll(recorder, group1)).status).toBe(200);
    await db.membership.updateMany({ where: { userId: recorder.id }, data: { deactivatedAt: new Date() } });
    // no active staff membership: stopped at the route's role gate, before any program is looked at
    expect((await roll(recorder, group1)).status).toBe(403);
    expect((await get(`${PROGRAMS}/${program}`, recorder)).status).toBe(403);
    expect((await mark(recorder, group1, present(amina))).status).toBe(403);
    expect(await marksInDb()).toBe(0);
  });

  test("the program lists its staff for the people who can read it, without e-mail addresses for the ones who cannot manage", async () => {
    const asTeacher = await detail(teacher);
    expect(asTeacher.staff.length).toBe(5);
    expect(asTeacher.staff.every((p: { email: string | null }) => p.email === null)).toBe(true);
    expect((await detail(sa)).staff.every((p: { email: string | null }) => typeof p.email === "string")).toBe(true);
  });
});

test.describe("the roll", () => {
  test("reading a roll opens no session and writes nothing", async () => {
    const before = [await sessionsInDb(), await marksInDb(), await db.programAudit.count()];
    const res = await roll(sa, juzA);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.sessionId).toBeNull();
    expect(res.json.data.rows.map((r: { name: string }) => r.name).sort()).toEqual(["Amina Pupil", "Binta Pupil", "Cara Pupil"]);
    expect([await sessionsInDb(), await marksInDb(), await db.programAudit.count()]).toEqual(before);
  });

  test("a group's roll lists the people of the groups inside it, once each", async () => {
    const res = await roll(sa, juzA);
    const ids = res.json.data.rows.map((r: { participantId: string }) => r.participantId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([amina, binta, cara].sort());
    const inner = await roll(sa, group2);
    expect(inner.json.data.rows.map((r: { participantId: string }) => r.participantId)).toEqual([binta]);
    expect((await roll(sa, juzB)).json.data.rows.map((r: { participantId: string }) => r.participantId)).toEqual([hauwa]);
  });

  test("what each person may see: an assigned teacher the groups inside theirs, a recorder only their group, a teacher with none nothing", async () => {
    const inJuzA = await roll(teacher, juzA);
    expect(inJuzA.status, inJuzA.text).toBe(200);
    expect(inJuzA.json.data.rows).toHaveLength(3);
    expect((await roll(teacher, group2)).status).toBe(200);
    expect((await roll(teacher, juzB)).status).toBe(404);
    expect((await roll(recorder, group1)).json.data.rows.map((r: { participantId: string }) => r.participantId).sort()).toEqual(
      [amina, cara].sort(),
    );
    expect((await roll(recorder, juzA)).status).toBe(404);
    expect((await roll(recorder, group2)).status).toBe(404);
    for (const g of [juzA, group1, group2, juzB]) expect((await roll(loner, g)).status, `loner ${g}`).toBe(404);
    // a supervisor and a program admin reach every group
    for (const who of [supervisor, progAdmin, sa])
      for (const g of [juzA, group1, group2, juzB]) expect((await roll(who, g)).status).toBe(200);
  });

  test("a branch administrator reads only the people through their own branch and marks none", async () => {
    const a = await roll(adminA, juzA);
    expect(a.status, a.text).toBe(200);
    expect(a.json.data.rows.map((r: { participantId: string }) => r.participantId).sort()).toEqual([amina, binta].sort());
    expect(a.json.data.rights).toMatchObject({ create: false, change: false });
    const b = await roll(adminB, juzA);
    expect(b.json.data.rows.map((r: { participantId: string }) => r.participantId)).toEqual([cara]);
    const refused = await mark(adminA, group1, present(amina));
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("FORBIDDEN");
    expect(await marksInDb()).toBe(0);
  });

  test("the rights and the earliest day the screen needs are decided on the server", async () => {
    const asTeacher = (await roll(teacher, juzA)).json.data;
    expect(asTeacher.rights).toEqual({ create: true, change: true, reasonOnChange: false });
    expect(asTeacher.earliest).toBe(day(-6));
    const old = (await roll(teacher, juzA, day(-10))).json.data;
    expect(old.rights).toMatchObject({ create: false, change: false });
    const asAdmin = (await roll(progAdmin, juzA, day(-10))).json.data;
    expect(asAdmin.rights).toEqual({ create: true, change: true, reasonOnChange: true });
    expect(asAdmin.earliest).toBeNull();
    expect((await roll(supervisor, juzA)).json.data.rights).toEqual({ create: false, change: true, reasonOnChange: true });
    expect((await roll(sa, juzA, day(1))).json.data.rights).toMatchObject({ create: false, change: false });
    const shown = (await detail(teacher)).attendance;
    expect(shown.on).toBe(true);
    expect(shown.readGroupIds.sort()).toEqual([juzA, group1, group2].sort());
    expect(shown.markGroupIds.sort()).toEqual([juzA, group1, group2].sort());
    expect((await detail(supervisor)).attendance.markGroupIds).toEqual([]);
    expect((await detail(supervisor)).attendance.readGroupIds).toHaveLength(4);
    expect((await detail(loner)).attendance.readGroupIds).toEqual([]);
  });

  test("the query is checked: ids, dates and the session name", async () => {
    expect((await get(`${ATT}/${program}/attendance?groupId=not%20an%20id&date=${day(0)}`, sa)).status).toBe(400);
    expect((await get(`${ATT}/${program}/attendance?groupId=well-formed-but-nothing&date=${day(0)}`, sa)).status).toBe(404);
    expect((await get(`${ATT}/${program}/attendance?groupId=${juzA}&date=2026-02-30`, sa)).status).toBe(400);
    expect((await get(`${ATT}/${program}/attendance?groupId=${juzA}&date=yesterday`, sa)).status).toBe(400);
    expect((await get(`${ATT}/${program}/attendance?groupId=${juzA}`, sa)).status).toBe(400);
    expect((await roll(sa, juzA, day(0), "x".repeat(41))).status).toBe(400);
    expect((await roll(sa, "cmaaaaaaaaaaaaaaaaaaaaaaa")).status).toBe(404);
  });
});

test.describe("taking attendance", () => {
  test("a teacher marks the roll: the session opens on the first mark; saving the same again changes nothing", async () => {
    const saved = await mark(teacher, juzA, [
      ...present(amina),
      { participantId: binta, status: "ABSENT", remarks: "  ill  " },
      { participantId: cara, status: "LATE" },
    ]);
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.data).toMatchObject({ created: 3, changed: 0, unchanged: 0 });
    const opened = await db.programSession.findMany();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ programId: program, groupId: juzA, label: "", createdByUserId: teacher.id });
    expect(opened[0]!.date.toISOString().slice(0, 10)).toBe(day(0));

    const marks = await db.programAttendance.findMany({ orderBy: { participantId: "asc" } });
    expect(marks).toHaveLength(3);
    expect(marks.every((m) => m.version === 1 && m.markedByUserId === teacher.id)).toBe(true);
    expect(marks.find((m) => m.participantId === binta)).toMatchObject({ status: "ABSENT", remarks: "ill" });
    expect(marks.find((m) => m.participantId === cara)!.branchId).toBe(B.id);

    const again = await mark(teacher, juzA, [
      ...present(amina),
      { participantId: binta, status: "ABSENT", remarks: "ill" },
      { participantId: cara, status: "LATE" },
    ]);
    expect(again.json.data).toMatchObject({ created: 0, changed: 0, unchanged: 3 });
    expect(await marksInDb()).toBe(3);
    expect(await db.programAttendanceChange.count()).toBe(0);

    const shown = await roll(teacher, juzA);
    expect(shown.json.data.marked).toBe(3);
    expect(shown.json.data.counts).toEqual({ present: 1, late: 1, absent: 1, excused: 0 });
    expect(rowOf(shown, binta)).toMatchObject({
      canEdit: true,
      mark: { status: "ABSENT", remarks: "ill", version: 1, markedBy: "Teacher", corrected: false },
    });
    expect(await db.programAudit.count({ where: { programId: program, action: "ATTENDANCE_TAKEN" } })).toBe(1);
  });

  test("two sessions on one day need different names; a name is trimmed and kept", async () => {
    expect((await mark(teacher, group1, present(amina), { label: "  Morning   prayer " })).status).toBe(200);
    expect((await mark(teacher, group1, [{ participantId: amina, status: "ABSENT" }], { label: "After Asr" })).status).toBe(200);
    expect((await db.programSession.findMany({ orderBy: { label: "asc" } })).map((s) => s.label)).toEqual(["After Asr", "Morning prayer"]);
    expect(
      (await roll(teacher, group1, day(0), "Morning prayer")).json.data.rows.find(
        (r: { participantId: string }) => r.participantId === amina,
      ).mark.status,
    ).toBe("PRESENT");
    expect(
      (await roll(teacher, group1, day(0), "After Asr")).json.data.rows.find((r: { participantId: string }) => r.participantId === amina)
        .mark.status,
    ).toBe("ABSENT");
    expect((await roll(teacher, group1)).json.data.sessionId).toBeNull();
  });

  test("a change needs the version the screen saw: a stale one is refused with nothing written, and a correction keeps what it replaced", async () => {
    expect((await mark(teacher, group1, present(amina, cara))).status).toBe(200);
    const fixed = await mark(teacher, group1, [{ participantId: amina, status: "ABSENT", remarks: "no show", version: 1 }]);
    expect(fixed.status, fixed.text).toBe(200);
    expect(fixed.json.data).toMatchObject({ created: 0, changed: 1 });
    expect(await db.programAttendance.findFirstOrThrow({ where: { participantId: amina } })).toMatchObject({
      status: "ABSENT",
      version: 2,
      remarks: "no show",
    });
    const changes = await db.programAttendanceChange.findMany();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      participantId: amina,
      beforeStatus: "PRESENT",
      afterStatus: "ABSENT",
      beforeRemarks: null,
      afterRemarks: "no show",
      changedByUserId: teacher.id,
      reason: null,
    });

    // the same stale version again, together with a valid change for Cara: refused as a whole
    const stale = await mark(teacher, group1, [
      { participantId: amina, status: "LATE", version: 1 },
      { participantId: cara, status: "ABSENT", version: 1 },
    ]);
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe("CHANGED");
    expect(stale.json.error.details[0].path).toBe("body.marks.0.version");
    expect(await db.programAttendance.findFirstOrThrow({ where: { participantId: cara } })).toMatchObject({
      status: "PRESENT",
      version: 1,
    });
    // no version at all for a mark that exists
    expect((await mark(teacher, group1, [{ participantId: amina, status: "LATE" }])).json.error.code).toBe("CHANGED");
    // a version for a mark that does not exist
    expect(
      (
        await mark(
          teacher,
          group1,
          [
            { participantId: amina, status: "LATE", version: 2 },
            { participantId: cara, status: "LATE", version: 1 },
          ],
          { label: "Other" },
        )
      ).json.error.code,
    ).toBe("CHANGED");
    expect(await db.programAttendanceChange.count()).toBe(1);
    expect(await db.programAudit.count({ where: { programId: program, action: "ATTENDANCE_CORRECTED" } })).toBe(1);
  });

  test("all or nothing: one person who cannot be marked refuses the whole save", async () => {
    // Hauwa is in Juz B, outside the teacher's groups; Cara is fine
    const refused = await mark(teacher, juzA, [...present(amina, cara), { participantId: hauwa, status: "PRESENT" }]);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NOT_ON_ROLL");
    expect(refused.json.error.details[0].path).toBe("body.marks.2.participantId");
    expect(await marksInDb()).toBe(0);
    expect(await sessionsInDb()).toBe(0);
    // a person who does not exist, or belongs to another program
    expect((await mark(teacher, juzA, [{ participantId: "cmaaaaaaaaaaaaaaaaaaaaaaa", status: "PRESENT" }])).json.error.code).toBe(
      "NOT_ON_ROLL",
    );
    // Binta is in Group 2: not on Group 1's roll
    expect((await mark(teacher, group1, present(amina, binta))).json.error.code).toBe("NOT_ON_ROLL");
    expect(await marksInDb()).toBe(0);
  });

  test("the shape of a save is checked: unknown keys, duplicates, the size, remarks, the name, the status, the date", async () => {
    const put = (body: Record<string, unknown>) => send("PUT", `${ATT}/${program}/attendance`, teacher, body);
    const base = { groupId: group1, date: day(0), marks: present(amina) };
    expect((await put({ ...base, extra: 1 })).status).toBe(400);
    expect((await put({ ...base, marks: [{ participantId: amina, status: "PRESENT", extra: 1 }] })).status).toBe(400);
    expect((await put({ ...base, marks: [] })).status).toBe(400);
    expect((await put({ ...base, marks: Array.from({ length: 501 }, () => ({ participantId: amina, status: "PRESENT" })) })).status).toBe(
      400,
    );
    const dup = await put({ ...base, marks: [...present(amina), { participantId: amina, status: "ABSENT" }] });
    expect(dup.status).toBe(400);
    expect(dup.json.error.code).toBe("DUPLICATE_MARK");
    expect((await put({ ...base, marks: [{ participantId: amina, status: "SICK" }] })).status).toBe(400);
    expect((await put({ ...base, marks: [{ participantId: amina, status: "PRESENT", remarks: "x".repeat(201) }] })).status).toBe(400);
    expect((await put({ ...base, marks: [{ participantId: amina, status: "PRESENT", remarks: "bad\u0007char" }] })).status).toBe(400);
    expect((await put({ ...base, label: "y".repeat(41) })).status).toBe(400);
    expect((await put({ ...base, date: "2026-13-01" })).status).toBe(400);
    expect((await put({ ...base, marks: [{ participantId: amina, status: "PRESENT", version: 0 }] })).status).toBe(400);
    expect((await put({ ...base, marks: [{ participantId: "../x", status: "PRESENT" }] })).status).toBe(400);
    expect((await put({ marks: present(amina) })).status).toBe(400);
    expect(await marksInDb()).toBe(0);
  });

  test("the days: not in the future, not before the program began; a teacher reaches today and the 6 days before; an administrator any past day", async () => {
    const future = await mark(teacher, group1, present(amina), { date: day(1) });
    expect(future.status).toBe(400);
    expect(future.json.error.code).toBe("FUTURE_DAY");
    expect((await mark(sa, group1, present(amina), { date: day(1) })).json.error.code).toBe("FUTURE_DAY");

    expect((await mark(teacher, group1, present(amina), { date: day(-6) })).status).toBe(200);
    const tooOld = await mark(teacher, group1, present(amina), { date: day(-7) });
    expect(tooOld.status).toBe(403);
    expect(tooOld.json.error.code).toBe("OUTSIDE_WINDOW");
    expect((await mark(recorder, group1, present(amina), { date: day(-7) })).json.error.code).toBe("OUTSIDE_WINDOW");

    expect((await mark(progAdmin, group1, present(amina), { date: day(-20) })).status).toBe(200);
    expect((await mark(sa, group1, present(amina), { date: day(-20), label: "Late" })).status).toBe(200);

    // the program began today for the purposes of this check
    await db.program.update({ where: { id: program }, data: { startsOn: new Date(day(-3)) } });
    const before = await mark(sa, group1, present(amina), { date: day(-4) });
    expect(before.status).toBe(400);
    expect(before.json.error.code).toBe("BEFORE_START");
    expect((await mark(sa, group1, present(amina), { date: day(-3) })).status).toBe(200);
  });

  test("a person who had not joined yet, or had left, is not on that day's roll", async () => {
    await db.programParticipant.update({ where: { id: amina }, data: { joinedOn: new Date(day(-3)) } });
    expect((await roll(sa, group1, day(-4))).json.data.rows.map((r: { participantId: string }) => r.participantId)).toEqual([cara]);
    expect((await mark(sa, group1, present(amina), { date: day(-4) })).json.error.code).toBe("NOT_ON_ROLL");
    expect((await mark(sa, group1, present(amina), { date: day(-3) })).status).toBe(200);
    await db.programParticipant.update({
      where: { id: binta },
      data: { status: "WITHDRAWN", endedOn: new Date(day(-2)), endedReason: "Left" },
    });
    expect(rowOf(await roll(sa, group2, day(-2)), binta)).toBeDefined();
    expect(rowOf(await roll(sa, group2, day(-1)), binta)).toBeUndefined();
    expect(rowOf(await roll(sa, group2, day(0)), binta)).toBeUndefined();
    expect((await mark(sa, group2, present(binta), { date: day(-1) })).json.error.code).toBe("NOT_ON_ROLL");
    expect((await mark(sa, group2, present(binta), { date: day(-2) })).status).toBe(200);
  });

  test("a recorder marks their group; a teacher and a recorder cannot reach a group they do not have", async () => {
    expect((await mark(recorder, group1, present(amina, cara))).status).toBe(200);
    expect((await mark(recorder, group2, present(binta))).status).toBe(404);
    expect((await mark(recorder, juzA, present(amina))).status).toBe(404);
    expect((await mark(teacher, juzB, present(hauwa))).status).toBe(404);
    expect((await mark(loner, group1, present(amina))).status).toBe(404);
    expect(await marksInDb()).toBe(2);
  });

  test("a supervisor corrects an existing mark with a reason, and cannot add one", async () => {
    expect((await mark(teacher, group1, present(amina))).status).toBe(200);
    const add = await mark(supervisor, group1, present(cara));
    expect(add.status).toBe(403);
    expect(add.json.error.code).toBe("FORBIDDEN");
    const bare = await mark(supervisor, group1, [{ participantId: amina, status: "EXCUSED", version: 1 }]);
    expect(bare.status).toBe(400);
    expect(bare.json.error.code).toBe("REASON_REQUIRED");
    expect(
      (await mark(supervisor, group1, [{ participantId: amina, status: "EXCUSED", version: 1 }], { reason: "ok" })).json.error.code,
    ).toBe("REASON_REQUIRED");
    const fixed = await mark(supervisor, group1, [{ participantId: amina, status: "EXCUSED", version: 1 }], {
      reason: "Had a medical letter",
    });
    expect(fixed.status, fixed.text).toBe(200);
    const row = await db.programAttendanceChange.findFirstOrThrow();
    expect(row).toMatchObject({
      beforeStatus: "PRESENT",
      afterStatus: "EXCUSED",
      reason: "Had a medical letter",
      changedByUserId: supervisor.id,
    });
    // the mark still says who took the roll; the correction says who changed it
    expect((await db.programAttendance.findFirstOrThrow({ where: { participantId: amina } })).markedByUserId).toBe(teacher.id);
    expect((await roll(sa, group1)).json.data.rows.find((r: { participantId: string }) => r.participantId === amina).mark).toMatchObject({
      markedBy: "Teacher",
      corrected: true,
    });
    // the supervisor may correct a day of any age
    expect((await mark(progAdmin, group1, present(amina), { date: day(-15) })).status).toBe(200);
    expect(
      (
        await mark(supervisor, group1, [{ participantId: amina, status: "LATE", version: 1 }], {
          date: day(-15),
          reason: "Marked in error",
        })
      ).status,
    ).toBe(200);
  });

  test("an administrator corrects an old day only with a reason; a recent day needs none", async () => {
    expect((await mark(progAdmin, group1, present(amina), { date: day(-20) })).status).toBe(200);
    const bare = await mark(progAdmin, group1, [{ participantId: amina, status: "ABSENT", version: 1 }], { date: day(-20) });
    expect(bare.status).toBe(400);
    expect(bare.json.error.code).toBe("REASON_REQUIRED");
    expect(bare.json.error.details[0].path).toBe("body.reason");
    expect(
      (
        await mark(progAdmin, group1, [{ participantId: amina, status: "ABSENT", version: 1 }], {
          date: day(-20),
          reason: "Register found",
        })
      ).status,
    ).toBe(200);
    expect(await db.programAttendanceChange.count({ where: { reason: "Register found" } })).toBe(1);
    expect((await mark(progAdmin, group1, present(cara))).status).toBe(200);
    expect((await mark(progAdmin, group1, [{ participantId: cara, status: "LATE", version: 1 }])).status).toBe(200);
  });

  test("a suspended person is listed with a flag today and cannot be marked; an earlier day's roll is not rewritten by today's standing", async () => {
    expect((await mark(sa, juzB, present(hauwa), { date: day(-3) })).status).toBe(200);
    expect((await mark(sa, juzB, present(hauwa))).status).toBe(200);
    const suspended = await post(`${PROGRAMS}/${program}/people/${hauwa}/standing`, sa, {
      action: "suspend",
      reason: "Disturbing the class",
    });
    expect(suspended.status, suspended.text).toBe(200);

    const today = await roll(sa, juzB);
    expect(rowOf(today, hauwa)).toMatchObject({ flag: "SUSPENDED", listed: true, canEdit: false, mark: { status: "PRESENT" } });
    const past = await roll(sa, juzB, day(-3));
    expect(rowOf(past, hauwa)).toMatchObject({ flag: null, listed: true, canEdit: true });

    const refused = await mark(sa, juzB, [{ participantId: hauwa, status: "ABSENT", version: 1 }]);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NOT_MARKABLE");
    // saving what is stored already is not a change
    expect((await mark(sa, juzB, present(hauwa))).json.data.unchanged).toBe(1);
    // the past day can still be corrected, and the mark made before the suspension stays
    expect(
      (await mark(sa, juzB, [{ participantId: hauwa, status: "ABSENT", version: 1 }], { date: day(-3), reason: "Was absent that day" }))
        .status,
    ).toBe(200);
    expect((await db.programAttendance.findMany({ where: { participantId: hauwa } })).map((m) => m.status).sort()).toEqual([
      "ABSENT",
      "PRESENT",
    ]);
  });

  test("someone who has left is not on today's roll, and a mark they already have stays visible, read only", async () => {
    expect((await mark(sa, group2, present(binta))).status).toBe(200);
    expect((await post(`${PROGRAMS}/${program}/people/${binta}/place`, sa, { action: "withdraw", reason: "Moved away" })).status).toBe(200);
    const shown = await roll(sa, group2);
    expect(rowOf(shown, binta)).toMatchObject({ listed: false, canEdit: false, mark: { status: "PRESENT" } });
    expect((await mark(sa, group2, [{ participantId: binta, status: "ABSENT", version: 1 }])).json.error.code).toBe("NOT_ON_ROLL");
  });

  test("a person moved to another group keeps their mark in the session where it was made", async () => {
    expect((await mark(sa, group1, present(amina))).status).toBe(200);
    expect((await post(`${PROGRAMS}/${program}/people/${amina}/move`, sa, { groupId: juzB })).status).toBe(200);
    const was = await roll(sa, group1);
    expect(rowOf(was, amina)).toMatchObject({ listed: false, mark: { status: "PRESENT" } });
    expect(rowOf(await roll(sa, juzB), amina)).toMatchObject({ listed: true, mark: null });
  });

  test("a program that is not active cannot be marked; it can still be read", async () => {
    expect((await mark(sa, group1, present(amina))).status).toBe(200);
    expect((await post(`${PROGRAMS}/${program}/status`, sa, { action: "archive" })).status).toBe(200);
    const archived = await mark(sa, group1, [{ participantId: amina, status: "ABSENT", version: 1 }]);
    expect(archived.status).toBe(409);
    expect(archived.json.error.code).toBe("PROGRAM_READ_ONLY");
    const shown = await roll(sa, group1);
    expect(shown.status).toBe(200);
    expect(shown.json.data.rights).toMatchObject({ create: false, change: false });
    expect(shown.json.data.programStatus).toBe("ARCHIVED");

    const draft = await post(PROGRAMS, sa, { name: "Not yet", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    const draftGroup = (await post(`${PROGRAMS}/${draft.json.data.id}/groups`, sa, { name: "Only", parentId: null })).json.data.id;
    const notActive = await mark(sa, draftGroup, present(amina), {}, draft.json.data.id);
    expect(notActive.status).toBe(409);
    expect(notActive.json.error.code).toBe("PROGRAM_NOT_ACTIVE");
  });

  test("an archived group cannot be marked", async () => {
    const spare = (await post(`${PROGRAMS}/${program}/groups`, sa, { name: "Spare", parentId: null })).json.data.id;
    expect((await send("PATCH", `${PROGRAMS}/${program}/groups/${spare}`, sa, { archived: true })).status).toBe(200);
    const refused = await mark(sa, spare, present(amina));
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("GROUP_ARCHIVED");
  });
});

test.describe("the three levels of the switch", () => {
  test("the school's switch off: nothing can be marked, what was recorded is still readable", async () => {
    expect((await mark(teacher, group1, present(amina))).status).toBe(200);
    expect((await attendanceSwitch(sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    const refused = await mark(teacher, group1, [{ participantId: amina, status: "ABSENT", version: 1 }]);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("ATTENDANCE_OFF");
    const shown = await roll(teacher, group1);
    expect(shown.status).toBe(200);
    expect(shown.json.data.attendance).toMatchObject({ on: false, offBy: "SCHOOL" });
    expect(shown.json.data.rights).toMatchObject({ create: false, change: false });
    expect(rowOf(shown, amina)).toMatchObject({ canEdit: false, mark: { status: "PRESENT" } });
    expect((await detail(teacher)).attendance).toMatchObject({ on: false, offBy: "SCHOOL" });
    expect((await summary(teacher, `from=${day(-6)}&to=${day(0)}`)).status).toBe(200);
    expect((await attendanceSwitch(sa, { scope: "GLOBAL", enabled: null })).status).toBe(200);
    expect((await mark(teacher, group1, [{ participantId: amina, status: "ABSENT", version: 1 }])).status).toBe(200);
  });

  test("a branch can turn attendance off for itself only; its people leave every roll while the other branches go on", async () => {
    expect((await attendanceSwitch(adminA, { scope: "BRANCH", branchId: B.id, enabled: false })).status).toBeGreaterThanOrEqual(403);
    expect((await attendanceSwitch(adminB, { scope: "BRANCH", branchId: B.id, enabled: false })).status).toBe(200);
    const shown = await roll(sa, juzA);
    expect(shown.json.data.attendance).toMatchObject({ on: true, branchesOff: [{ id: B.id }] });
    expect(rowOf(shown, cara)).toMatchObject({ branchOff: true, canEdit: false });
    expect(rowOf(shown, amina)).toMatchObject({ branchOff: false, canEdit: true });
    expect((await mark(teacher, juzA, present(amina, cara))).json.error.code).toBe("NOT_ON_ROLL");
    expect((await mark(teacher, juzA, present(amina))).status).toBe(200);
    expect((await detail(sa)).attendance.branchesOff).toEqual([{ id: B.id, name: expect.any(String) }]);
    // a branch never widens the school's value
    expect((await attendanceSwitch(sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    expect((await attendanceSwitch(adminB, { scope: "BRANCH", branchId: B.id, enabled: true })).status).toBeGreaterThanOrEqual(400);
    // every branch off: the program is off
    expect((await attendanceSwitch(sa, { scope: "GLOBAL", enabled: null })).status).toBe(200);
    expect((await attendanceSwitch(adminA, { scope: "BRANCH", branchId: A.id, enabled: false })).status).toBe(200);
    const none = await detail(sa);
    expect(none.attendance).toMatchObject({ on: false, offBy: "BRANCH" });
    expect((await mark(teacher, juzA, [{ participantId: amina, status: "ABSENT", version: 1 }])).json.error.code).toBe("ATTENDANCE_OFF");
  });

  test("the program's own switch and threshold: a super admin or a program admin, audited, checked", async () => {
    expect((await programSettings(teacher, { attendanceEnabled: false })).status).toBe(403);
    expect((await programSettings(supervisor, { lowAttendancePercent: 50 })).status).toBe(403);
    expect((await programSettings(adminA, { attendanceEnabled: false })).status).toBe(403);
    for (const bad of [
      {},
      { lowAttendancePercent: 0 },
      { lowAttendancePercent: 101 },
      { lowAttendancePercent: 60.5 },
      { lowAttendancePercent: "60" },
      { attendanceEnabled: "no" },
      { other: 1 },
    ])
      expect((await programSettings(progAdmin, bad)).status, JSON.stringify(bad)).toBe(400);

    const set = await programSettings(progAdmin, { lowAttendancePercent: 60 });
    expect(set.status, set.text).toBe(200);
    expect(set.json.data).toMatchObject({ attendanceEnabled: true, lowAttendancePercent: 60 }); // the answer is every program setting (slices P3b to P5 added theirs)
    expect((await detail(progAdmin)).attendance.lowPercent).toBe(60);
    expect(await db.programAudit.count({ where: { programId: program, action: "PROGRAM_SETTINGS_CHANGED" } })).toBe(1);
    // the same values again write nothing
    expect((await programSettings(progAdmin, { lowAttendancePercent: 60 })).status).toBe(200);
    expect(await db.programAudit.count({ where: { programId: program, action: "PROGRAM_SETTINGS_CHANGED" } })).toBe(1);

    expect((await programSettings(sa, { attendanceEnabled: false })).status).toBe(200);
    expect((await detail(teacher)).attendance).toMatchObject({ on: false, offBy: "PROGRAM", enabled: false });
    expect((await mark(teacher, group1, present(amina))).json.error.code).toBe("ATTENDANCE_OFF");
    expect((await detail(progAdmin)).can.settings).toBe(true);
    expect((await detail(teacher)).can.settings).toBe(false);
    expect((await programSettings(sa, { attendanceEnabled: true })).status).toBe(200);
    expect((await mark(teacher, group1, present(amina))).status).toBe(200);
    // a program that has ended or is archived has no settings to change
    expect((await post(`${PROGRAMS}/${program}/status`, sa, { action: "archive" })).status).toBe(200);
    expect((await programSettings(sa, { lowAttendancePercent: 40 })).status).toBe(409);
  });

  test("the switch routes: a super admin sees every branch, a branch administrator theirs; a teacher gets nothing", async () => {
    const seen = await get("/api/v1/settings/programs-attendance", sa);
    expect(seen.status, seen.text).toBe(200);
    expect(seen.json.data.canEditSchool).toBe(true);
    expect(seen.json.data.school).toEqual({ stored: null, effective: true });
    expect((await get("/api/v1/settings/programs-attendance", adminB)).json.data.branches.map((b: { id: string }) => b.id)).toEqual([B.id]);
    expect((await get("/api/v1/settings/programs-attendance", teacher)).status).toBe(403);
    expect((await attendanceSwitch(teacher, { scope: "GLOBAL", enabled: false })).status).toBe(403);
    expect((await attendanceSwitch(adminB, { scope: "GLOBAL", enabled: false })).status).toBeGreaterThanOrEqual(403);
    expect((await attendanceSwitch(sa, { scope: "GLOBAL", enabled: "off" })).status).toBe(400);
    // the programs switch and the attendance switch are two switches
    expect((await attendanceSwitch(sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    expect((await get("/api/v1/settings/programs", sa)).json.data.school).toEqual({ stored: null, effective: true });
  });
});

test.describe("the numbers", () => {
  // Amina: present, late, absent, excused on 4 days -> (1 + 1) / (1 + 1 + 1) = 67%, excused left out. Binta: absent twice -> 0%.
  async function fill() {
    const days: [number, string, string][] = [
      [-1, "PRESENT", "ABSENT"],
      [-2, "LATE", "ABSENT"],
      [-3, "ABSENT", "EXCUSED"],
      [-4, "EXCUSED", "EXCUSED"],
    ];
    for (const [offset, a, b] of days) {
      const saved = await mark(
        sa,
        juzA,
        [
          { participantId: amina, status: a },
          { participantId: binta, status: b },
        ],
        { date: day(offset) },
      );
      expect(saved.status, saved.text).toBe(200);
    }
  }

  test("per person: the counts, the percentage with excused left out, the low flag at the program's threshold, the lowest first", async () => {
    await fill();
    const res = await summary(sa, `groupId=${juzA}&from=${day(-6)}&to=${day(0)}`);
    expect(res.status, res.text).toBe(200);
    const rows = res.json.data.rows as {
      participantId: string;
      held: number;
      counts: Record<string, number>;
      percent: number | null;
      low: boolean;
    }[];
    const a = rows.find((r) => r.participantId === amina)!;
    expect(a).toMatchObject({ held: 4, counts: { present: 1, late: 1, absent: 1, excused: 1 }, percent: 67, low: true });
    const b = rows.find((r) => r.participantId === binta)!;
    expect(b).toMatchObject({ held: 4, counts: { present: 0, late: 0, absent: 2, excused: 2 }, percent: 0, low: true });
    const c = rows.find((r) => r.participantId === cara)!;
    expect(c).toMatchObject({ held: 0, percent: null, low: false });
    expect(rows.map((r) => r.participantId)).toEqual([binta, amina, cara]);
    expect(res.json.data.threshold).toBe(75);
    expect(res.json.data.totals).toMatchObject({ held: 8, present: 1, late: 1, absent: 3, excused: 3, percent: 40 });

    expect((await programSettings(sa, { lowAttendancePercent: 60 })).status).toBe(200);
    const lower = (await summary(sa, `groupId=${juzA}&from=${day(-6)}&to=${day(0)}`)).json.data.rows as {
      participantId: string;
      low: boolean;
    }[];
    expect(lower.find((r) => r.participantId === amina)!.low).toBe(false);
    expect(lower.find((r) => r.participantId === binta)!.low).toBe(true);
    expect(lower.find((r) => r.participantId === cara)!.low).toBe(false);
  });

  test("a range narrows it; the range is checked", async () => {
    await fill();
    const one = (await summary(sa, `groupId=${juzA}&from=${day(-1)}&to=${day(-1)}`)).json.data.rows as {
      participantId: string;
      percent: number | null;
    }[];
    expect(one.find((r) => r.participantId === amina)!.percent).toBe(100);
    expect(one.find((r) => r.participantId === binta)!.percent).toBe(0);
    const reversed = await summary(sa, `from=${day(0)}&to=${day(-3)}`);
    expect(reversed.status).toBe(400);
    expect(reversed.json.error.code).toBe("BAD_RANGE");
    expect((await summary(sa, `from=${day(-400)}&to=${day(0)}`)).json.error.code).toBe("BAD_RANGE");
    expect((await summary(sa, `from=${day(-365)}&to=${day(0)}`)).status).toBe(200);
    expect((await summary(sa, `to=${day(0)}`)).status).toBe(400);
    expect((await summary(sa, `from=nope&to=${day(0)}`)).status).toBe(400);
    expect((await sessions(sa, `from=${day(-400)}&to=${day(0)}`)).json.error.code).toBe("BAD_RANGE");
  });

  test("each person's numbers cover only the people and groups they may see", async () => {
    await fill();
    expect((await mark(sa, group1, present(cara), { date: day(-1) })).status).toBe(200);
    expect((await mark(sa, juzB, present(hauwa), { date: day(-1) })).status).toBe(200);
    const ids = async (who: Person, qs: string) =>
      ((await summary(who, qs)).json.data.rows as { participantId: string }[]).map((r) => r.participantId).sort();
    const range = `from=${day(-6)}&to=${day(0)}`;
    expect(await ids(sa, range)).toEqual([amina, binta, cara, hauwa].sort());
    expect(await ids(teacher, range)).toEqual([amina, binta, cara].sort());
    expect(await ids(recorder, range)).toEqual([amina, cara].sort());
    expect(await ids(adminA, range)).toEqual([amina, binta, hauwa].sort());
    expect(await ids(adminB, range)).toEqual([cara]);
    expect(await ids(supervisor, range)).toEqual([amina, binta, cara, hauwa].sort());
    expect((await summary(teacher, `groupId=${juzB}&${range}`)).status).toBe(404);
    expect((await summary(recorder, `groupId=${juzA}&${range}`)).status).toBe(404);
    expect((await summary(loner, range)).json.data.rows).toEqual([]);
    // a branch administrator's totals are their branch's marks
    const mine = (await summary(adminB, range)).json.data.totals;
    expect(mine).toMatchObject({ held: 1, present: 1 });
  });

  test("the sessions held: newest first, with how many were marked each way, among the people the viewer may see", async () => {
    await fill();
    expect(
      (
        await mark(sa, group1, [
          { participantId: cara, status: "LATE" },
          { participantId: amina, status: "PRESENT" },
        ])
      ).status,
    ).toBe(200);
    const all = await sessions(sa, `from=${day(-6)}&to=${day(0)}`);
    expect(all.status, all.text).toBe(200);
    const list = all.json.data.sessions as { date: string; groupId: string; marked: number; counts: Record<string, number> }[];
    expect(list).toHaveLength(5);
    expect(list[0]).toMatchObject({ date: day(0), groupId: group1, marked: 2, counts: { present: 1, late: 1, absent: 0, excused: 0 } });
    expect(list.map((s) => s.date)).toEqual([day(0), day(-1), day(-2), day(-3), day(-4)]);
    const forB = (await sessions(adminB, `from=${day(-6)}&to=${day(0)}`)).json.data.sessions as { marked: number }[];
    expect(forB.filter((s) => s.marked > 0)).toHaveLength(1);
    const forRecorder = (await sessions(recorder, `from=${day(-6)}&to=${day(0)}`)).json.data.sessions as { groupId: string }[];
    expect(forRecorder.map((s) => s.groupId)).toEqual([group1]);
    expect((await sessions(teacher, `groupId=${juzB}&from=${day(-6)}&to=${day(0)}`)).status).toBe(404);
    expect((await sessions(sa, `groupId=${juzA}&from=${day(-1)}&to=${day(-1)}`)).json.data.sessions).toHaveLength(1);
  });

  test("a person's history: newest first, with every correction (who, when, from, to, why)", async () => {
    await fill();
    expect(
      (await mark(sa, juzA, [{ participantId: amina, status: "PRESENT", version: 1 }], { date: day(-3), reason: "Found in the register" }))
        .status,
    ).toBe(200);
    const res = await history(sa, amina);
    expect(res.status, res.text).toBe(200);
    const data = res.json.data;
    expect(data.person).toMatchObject({ id: amina, name: "Amina Pupil" });
    expect(data.marks.map((m: { date: string }) => m.date)).toEqual([day(-1), day(-2), day(-3), day(-4)]);
    const fixed = data.marks.find((m: { date: string }) => m.date === day(-3));
    expect(fixed).toMatchObject({ status: "PRESENT", version: 2 });
    expect(fixed.changes).toHaveLength(1);
    expect(fixed.changes[0]).toMatchObject({ by: "Super Admin", from: "ABSENT", to: "PRESENT", reason: "Found in the register" });
    expect(data.counts).toMatchObject({ present: 2, late: 1, absent: 0, excused: 1 });
    expect(data.percent).toBe(100);
    expect(data.marks.every((m: { changes: unknown[]; version: number }) => m.changes.length === m.version - 1)).toBe(true);
    expect((await history(sa, amina, `from=${day(-2)}&to=${day(-1)}`)).json.data.marks).toHaveLength(2);
    expect((await history(sa, amina, `from=${day(0)}&to=${day(-2)}`)).status).toBe(400);
    // who may look
    expect((await history(teacher, amina)).status).toBe(200);
    expect((await history(teacher, hauwa)).status).toBe(404);
    expect((await history(recorder, binta)).status).toBe(404);
    expect((await history(adminB, amina)).status).toBe(404);
    expect((await history(adminA, amina)).status).toBe(200);
    expect((await history(sa, "cmaaaaaaaaaaaaaaaaaaaaaaa")).status).toBe(404);
    expect((await history(sa, "..%2Fetc%2Fpasswd")).status).toBe(404);
  });

  test("a teacher sees the marks of the groups they have, not those a person earned in a group of someone else's", async () => {
    await fill();
    // Binta moves to Juz B (teacher has no part in it); her earlier marks were made in Juz A
    expect((await post(`${PROGRAMS}/${program}/people/${binta}/move`, sa, { groupId: juzB })).status).toBe(200);
    expect((await history(teacher, binta)).status).toBe(404);
    expect((await history(sa, binta)).json.data.marks).toHaveLength(4);
  });
});

test.describe("races and the database", () => {
  test("two people opening the same session at once: one session, every mark kept", async () => {
    const [one, two] = await Promise.all([mark(teacher, juzA, present(amina)), mark(progAdmin, juzA, present(binta))]);
    expect([one.status, two.status], `${one.text} ${two.text}`).toEqual([200, 200]);
    expect(await sessionsInDb()).toBe(1);
    expect(await marksInDb()).toBe(2);
  });

  test("two people marking the same person differently at once: one wins, the other is told it changed", async () => {
    const [one, two] = await Promise.all([
      mark(teacher, group1, [{ participantId: amina, status: "PRESENT" }]),
      mark(progAdmin, group1, [{ participantId: amina, status: "ABSENT" }]),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect([one, two].find((r) => r.status === 409)!.json.error.code).toBe("CHANGED");
    expect(await marksInDb()).toBe(1);
    expect(await sessionsInDb()).toBe(1);
  });

  test("two people correcting the same mark at once: one correction, one refusal", async () => {
    expect((await mark(teacher, group1, present(amina))).status).toBe(200);
    const [one, two] = await Promise.all([
      mark(teacher, group1, [{ participantId: amina, status: "LATE", version: 1 }]),
      mark(progAdmin, group1, [{ participantId: amina, status: "ABSENT", version: 1 }]),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect((await db.programAttendance.findFirstOrThrow()).version).toBe(2);
    expect(await db.programAttendanceChange.count()).toBe(1);
  });

  test("the correction history is append-only", async () => {
    expect((await mark(teacher, group1, present(amina))).status).toBe(200);
    expect((await mark(teacher, group1, [{ participantId: amina, status: "ABSENT", version: 1 }])).status).toBe(200);
    await expect(db.$executeRawUnsafe(`UPDATE "ProgramAttendanceChange" SET "reason" = 'rewritten'`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "ProgramAttendanceChange"`)).rejects.toThrow(/append-only/);
    expect(await db.programAttendanceChange.count()).toBe(1);
  });

  test("the database refuses what the service would: a long remark, an untrimmed name, a second session, a person of another program", async () => {
    const session = { programId: program, groupId: group1, date: new Date(day(0)), createdByUserId: sa.id };
    await expect(db.programSession.create({ data: { ...session, label: " padded" } })).rejects.toThrow();
    await expect(db.programSession.create({ data: { ...session, label: "z".repeat(41) } })).rejects.toThrow();
    const made = await db.programSession.create({ data: { ...session, label: "ok" } });
    await expect(db.programSession.create({ data: { ...session, label: "ok" } })).rejects.toThrow();
    const row = {
      sessionId: made.id,
      programId: program,
      participantId: amina,
      branchId: A.id,
      status: "PRESENT" as const,
      markedByUserId: sa.id,
    };
    await expect(db.programAttendance.create({ data: { ...row, remarks: "r".repeat(201) } })).rejects.toThrow();
    await expect(db.programAttendance.create({ data: { ...row, version: 0 } })).rejects.toThrow();
    const other = await post(PROGRAMS, sa, { name: "Elsewhere", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    await expect(db.programAttendance.create({ data: { ...row, programId: other.json.data.id } })).rejects.toThrow();
    await expect(db.program.update({ where: { id: program }, data: { lowAttendancePercent: 0 } })).rejects.toThrow();
    await db.programAttendance.create({ data: row });
    await expect(db.programAttendance.create({ data: { ...row, status: "ABSENT" } })).rejects.toThrow();
    // a group cannot be removed while sessions point at it
    await expect(db.programGroup.delete({ where: { id: group1 } })).rejects.toThrow();
  });
});
