import { expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueEmail, type TestUser } from "./db";
import { api, cookieHeader, loginAs } from "./http";

// One program with its people, for the API specs of programs (task 0043): the same world every time, built through the real routes.
//   People: a super admin (sa), an administrator of branch A (adminA) and of branch B (adminB), a program admin (progAdmin), a supervisor, a teacher of "Juz A" (so of the groups inside
//   it), a recorder of "Group 1", and a teacher with no groups (loner).
//   The program runs in A and B and is active; groups: "Juz A" with "Group 1" and "Group 2" inside it, and "Juz B".
//   Participants: Amina (A, Group 1), Binta (A, Group 2), Cara (B, Group 1) and Hauwa, an adult typed in (A, Juz B). All joined 30 days ago, so earlier days have rolls.

export const PROGRAMS = "/api/v1/programs";
const DAY = 864e5;
export const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

export type Person = TestUser & { cookie: string };

export const login = async (user: TestUser): Promise<Person> => ({ ...user, cookie: cookieHeader((await loginAs(user)).token!) });
export const get = (path: string, who: Person) => api(path, { cookie: who.cookie });
export const send = (method: string, path: string, who: Person, body?: unknown) => api(path, { method, cookie: who.cookie, body });
export const post = (path: string, who: Person, body?: unknown) => send("POST", path, who, body ?? {});

export async function staffIn(branchId: string, role: Role, name: string): Promise<Person> {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W+/g, "-")) });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return login({ ...user, branchId });
}

async function makePupil(branchId: string, admissionNo: string, firstName: string, sessionId: string, guardianPhone = "+2348011110001") {
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
      guardianName: `${firstName}'s parent`,
      guardianPhone,
    },
  });
  await db.studentEnrollment.create({
    data: { studentId: student.id, branchId, sessionId, className: "JSS 1", arm: "Gold", classArmId: arm.id, status: "ACTIVE" },
  });
  return student;
}

export type World = {
  A: { id: string; name: string };
  B: { id: string; name: string };
  sa: Person;
  adminA: Person;
  adminB: Person;
  progAdmin: Person;
  supervisor: Person;
  teacher: Person;
  recorder: Person;
  loner: Person;
  program: string;
  juzA: string;
  group1: string;
  group2: string;
  juzB: string;
  amina: string;
  binta: string;
  cara: string;
  hauwa: string;
  staffIds: { supervisor: string; teacher: string; recorder: string; loner: string };
};

export async function buildWorld(): Promise<World> {
  await resetDatabase();
  await seedInstance();
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  const [A, B] = [branches[0]!, branches[1]!];
  const sa = await login(await createUser({ role: Role.ADMIN, name: "Super Admin" }));
  const adminA = await login(await createUser({ role: Role.ADMIN, superAdmin: false, name: "Admin A" }));
  const adminB = await staffIn(B.id, Role.ADMIN, "Admin B");
  const progAdmin = await staffIn(A.id, Role.TEACHING_STAFF, "Program Admin");
  const supervisor = await staffIn(A.id, Role.TEACHING_STAFF, "Supervisor");
  const teacher = await staffIn(A.id, Role.TEACHING_STAFF, "Teacher");
  const recorder = await staffIn(A.id, Role.NON_TEACHING_STAFF, "Recorder");
  const loner = await staffIn(A.id, Role.TEACHING_STAFF, "Loner");

  const created = await post(PROGRAMS, sa, {
    name: "Quran memorisation",
    kind: "ONGOING",
    branchIds: [A.id, B.id],
    levelLabels: ["Juz", "Group"],
  });
  expect(created.status, created.text).toBe(201);
  const program = created.json.data.id as string;
  const g = async (name: string, parentId: string | null) =>
    (await post(`${PROGRAMS}/${program}/groups`, sa, { name, parentId })).json.data.id as string;
  const juzA = await g("Juz A", null);
  const group1 = await g("Group 1", juzA);
  const group2 = await g("Group 2", juzA);
  const juzB = await g("Juz B", null);
  expect((await post(`${PROGRAMS}/${program}/status`, sa, { action: "activate" })).status).toBe(200);
  const name = async (who: Person, role: string) => {
    const named = await post(`${PROGRAMS}/${program}/staff`, sa, { userId: who.id, branchId: A.id, role });
    expect(named.status, named.text).toBe(201);
    return named.json.data.id as string;
  };
  await name(progAdmin, "ADMIN");
  const staffIds = {
    supervisor: await name(supervisor, "SUPERVISOR"),
    teacher: await name(teacher, "TEACHER"),
    recorder: await name(recorder, "RECORDER"),
    loner: await name(loner, "TEACHER"),
  };
  expect((await send("PUT", `${PROGRAMS}/${program}/staff/${staffIds.teacher}/groups`, sa, { groupIds: [juzA] })).status).toBe(200);
  expect((await send("PUT", `${PROGRAMS}/${program}/staff/${staffIds.recorder}/groups`, sa, { groupIds: [group1] })).status).toBe(200);

  const sessionOf = (branchId: string) =>
    db.academicSession.create({
      data: { branchId, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
    });
  const [sessionA, sessionB] = [await sessionOf(A.id), await sessionOf(B.id)];
  const addPupil = async (studentId: string, groupId: string) => {
    const added = await post(`${PROGRAMS}/${program}/people`, sa, { kind: "STUDENT", studentId, groupId });
    expect(added.status, added.text).toBe(201);
    return added.json.data.id as string;
  };
  const amina = await addPupil((await makePupil(A.id, "2026/0001", "Amina", sessionA.id)).id, group1);
  const binta = await addPupil((await makePupil(A.id, "2026/0002", "Binta", sessionA.id, "+2348011110002")).id, group2);
  const cara = await addPupil((await makePupil(B.id, "2026/0003", "Cara", sessionB.id, "+2348011110003")).id, group1);
  const adult = await post(`${PROGRAMS}/${program}/people`, sa, {
    kind: "ADULT",
    firstName: "Hauwa",
    lastName: "Bello",
    branchId: A.id,
    groupId: juzB,
    phone: "08031234567",
  });
  expect(adult.status, adult.text).toBe(201);
  await db.programParticipant.updateMany({ data: { joinedOn: new Date(day(-30)) } });
  return {
    A,
    B,
    sa,
    adminA,
    adminB,
    progAdmin,
    supervisor,
    teacher,
    recorder,
    loner,
    program,
    juzA,
    group1,
    group2,
    juzB,
    amina,
    binta,
    cara,
    hauwa: adult.json.data.id,
    staffIds,
  };
}
