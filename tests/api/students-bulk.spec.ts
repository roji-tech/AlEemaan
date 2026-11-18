import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Bulk pupils over real HTTP (task 0084), which replaces the old import that saved the good rows and skipped the rest: a dry run that writes nothing, a save that is all or nothing, a
// class and arm that must exist, an admission number that must be free, a namesake that is refused unless the administrator says otherwise, and the same authority as one pupil.

let home: { id: string };
let other: { id: string };
let jss1: { id: string };
let arms: { a: string; b: string; main: string };
let sessionId: string;
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  sessionId = (
    await db.academicSession.create({
      data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
    })
  ).id;
  jss1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const jss2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2" } });
  const a = await db.classArm.create({ data: { branchId: home.id, classGroupId: jss1.id, name: "A" } });
  const b = await db.classArm.create({ data: { branchId: home.id, classGroupId: jss1.id, name: "B" } });
  const main = await db.classArm.create({ data: { branchId: home.id, classGroupId: jss2.id, name: "Main" } });
  arms = { a: a.id, b: b.id, main: main.id };
});
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const IMPORT = "/api/v1/students/import";
const row = (line: number, values: Record<string, string> = {}) => ({
  line,
  values: { firstName: `Pupil${line}`, lastName: "Test", gender: "Male", dateOfBirth: "2014-03-21", ...values },
});
const send = (cookie: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  api(IMPORT, { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows, ...extra } });
const count = () => db.studentRecord.count({ where: { branchId: home.id } });

test("who may use it: signed out 401; a teacher 403; the administrator of another branch 403; a branch administrator may", async () => {
  const body = { branchId: home.id, dryRun: true, rows: [row(2)] };
  expect((await api(IMPORT, { method: "POST", body })).status).toBe(401);
  expect((await api(IMPORT, { method: "POST", cookie: (await asRole(Role.TEACHING_STAFF)).cookie, body })).status).toBe(403);
  const refused = await api(IMPORT, { method: "POST", cookie: (await asRole(Role.ADMIN, other.id)).cookie, body });
  expect([refused.status, refused.json.error.code]).toEqual([403, "FORBIDDEN"]);
  expect((await api(IMPORT, { method: "POST", cookie: (await asRole(Role.ADMIN)).cookie, body })).status).toBe(200);
});

test("a dry run answers every row and writes nothing: a class and arm that exist, an admission number that is free, a namesake named", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Salim",
      lastName: "Garba",
      gender: "MALE",
      dateOfBirth: new Date("2011-12-12"),
      admissionNo: "OLD/1",
    },
  });
  const before = await count();
  const res = await send(cookie, [
    row(2, { className: "JSS 1", arm: "A" }),
    row(3, { className: "JSS 9" }),
    row(4, { className: "jss 1", arm: "Z" }),
    row(5, { className: "JSS 1" }),
    row(6, { className: "JSS 2" }),
    row(7, { admissionNo: "OLD/1" }),
    row(8, { firstName: "Salim", lastName: "garba", dateOfBirth: "12/12/2011" }),
    row(9, { firstName: "Twin", dateOfBirth: "2013-01-01" }),
    row(10, { firstName: "Twin", dateOfBirth: "2013-01-01" }),
    row(11, { gender: "Other" }),
    row(12, { dateOfBirth: "2999-01-01" }),
  ]);
  expect(res.status).toBe(200);
  const v = res.json.data.verdicts as { line: number; status: string; problems: { column?: string; message: string }[] }[];
  expect(v.map((x) => [x.line, x.status])).toEqual([
    [2, "ready"],
    [3, "error"],
    [4, "error"],
    [5, "error"],
    [6, "ready"],
    [7, "error"],
    [8, "error"],
    [9, "ready"],
    [10, "error"],
    [11, "error"],
    [12, "error"],
  ]);
  expect(v[1].problems).toEqual([{ column: "className", message: 'There is no class called "JSS 9" in this branch.' }]);
  expect(v[2].problems).toEqual([{ column: "arm", message: 'JSS 1 has no arm called "Z".' }]);
  expect(v[3].problems).toEqual([{ column: "arm", message: "Say which arm of JSS 1: A, B." }]);
  expect(v[5].problems).toEqual([{ column: "admissionNo", message: 'Admission number "OLD/1" is already taken.' }]);
  expect(v[6].problems[0].message).toContain("already in this branch (admission number OLD/1)");
  expect(v[8].problems[0].message).toContain("Same name and date of birth as row 9");
  expect(v[9].problems[0].column).toBe("gender");
  expect(v[10].problems[0].column).toBe("dateOfBirth");
  expect(await count()).toBe(before);
});

test("a save is all or nothing; with every row good it saves them in order with numbers, classes and arms, audited", async () => {
  const { user, cookie } = await asRole(Role.ADMIN);
  const blocked = await send(cookie, [row(2), row(3), row(4, { className: "JSS 9" })], { dryRun: false });
  expect([blocked.status, blocked.json.error.code, blocked.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect(await count()).toBe(0);

  const saved = await send(
    cookie,
    [
      row(2, {
        className: "JSS 1",
        arm: "b",
        middleName: "Bola",
        guardianName: "Mr Test",
        guardianPhone: "8030000000",
        guardianEmail: "G@X.com",
      }),
      row(3, { className: "JSS 2", gender: "f", dateOfBirth: "21/03/2014" }),
      row(4, { admissionNo: "CUSTOM/7" }),
      row(5),
    ],
    { dryRun: false },
  );
  expect([saved.status, saved.json.data.saved]).toEqual([201, 4]);
  const pupils = await db.studentRecord.findMany({
    where: { branchId: home.id },
    orderBy: { createdAt: "asc" },
    include: { enrollments: true },
  });
  expect(pupils.map((p) => p.firstName)).toEqual(["Pupil2", "Pupil3", "Pupil4", "Pupil5"]);
  const [p2, p3, p4, p5] = pupils;
  expect([
    p2.middleName,
    p2.guardianPhone,
    p2.guardianEmail,
    p3.gender,
    p3.dateOfBirth!.toISOString().slice(0, 10),
    p4.admissionNo,
  ]).toEqual(["Bola", "08030000000", "g@x.com", "FEMALE", "2014-03-21", "CUSTOM/7"]);
  const nums = [p2, p3, p5].map((p) => Number(p.admissionNo.split("/")[1]));
  expect(nums[1]).toBe(nums[0] + 1);
  expect(nums[2]).toBe(nums[1] + 1);
  expect(p2.admissionNo).toMatch(/^\d{4}\/\d{4}$/);
  expect(p2.enrollments.map((e) => [e.className, e.arm, e.classArmId, e.sessionId, e.status])).toEqual([
    ["JSS 1", "B", arms.b, sessionId, "ACTIVE"],
  ]);
  expect(p3.enrollments.map((e) => [e.className, e.arm, e.classArmId])).toEqual([["JSS 2", null, arms.main]]);
  expect(p4.enrollments).toHaveLength(0);
  const audits = await db.auditLog.findMany({ where: { actorUserId: user.id } });
  expect(audits.filter((a) => a.action === "STUDENT_IMPORTED")).toHaveLength(4);
  expect(audits.filter((a) => a.action === "STUDENTS_BULK_IMPORTED")).toHaveLength(1);
  expect(JSON.stringify(audits)).not.toContain("Pupil2"); // ids and numbers only, never a name
});

test("with allowDuplicates a namesake is a note, not a problem, and is saved and recorded as an override; without it nothing is saved", async () => {
  const { user, cookie } = await asRole(Role.ADMIN);
  const first = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Salim",
      lastName: "Garba",
      gender: "MALE",
      dateOfBirth: new Date("2011-12-12"),
      admissionNo: "OLD/1",
    },
  });
  const rows = [row(2, { firstName: "Salim", lastName: "Garba", dateOfBirth: "2011-12-12" }), row(3)];
  const refused = await send(cookie, rows, { dryRun: false });
  expect([refused.status, refused.json.data.saved]).toEqual([422, 0]);
  const dry = await send(cookie, rows, { allowDuplicates: true });
  expect(dry.json.data.verdicts.map((v: { status: string }) => v.status)).toEqual(["note", "ready"]);
  expect(dry.json.data.verdicts[0].note).toContain("OLD/1");
  const saved = await send(cookie, rows, { dryRun: false, allowDuplicates: true });
  expect([saved.status, saved.json.data.saved]).toEqual([201, 2]);
  const audit = await db.auditLog.findFirstOrThrow({
    where: { actorUserId: user.id, action: "STUDENT_IMPORTED", afterValue: { path: ["duplicateOverridden"], equals: true } },
  });
  expect((audit.afterValue as { existingAdmissionNo: string }).existingAdmissionNo).toBe(first.admissionNo);
});

test("the real run checks again: an admission number taken after the dry run blocks the save, and nothing is written", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  const rows = [row(2, { admissionNo: "LATE/1" }), row(3)];
  expect((await send(cookie, rows)).json.data.verdicts.every((v: { status: string }) => v.status === "ready")).toBe(true);
  await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Quick",
      lastName: "Fox",
      gender: "MALE",
      dateOfBirth: new Date("2010-01-01"),
      admissionNo: "LATE/1",
    },
  });
  const res = await send(cookie, rows, { dryRun: false });
  expect([res.status, res.json.error.code, res.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect(await count()).toBe(1);
});

test("with no active session a class is a problem on its row (it used to be skipped without a word); rows with no class are fine", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  await db.academicSession.update({ where: { id: sessionId }, data: { status: "PLANNED" } });
  const res = await send(cookie, [row(2, { className: "JSS 1", arm: "A" }), row(3)]);
  expect(res.json.data.verdicts.map((v: { status: string }) => v.status)).toEqual(["error", "ready"]);
  expect(res.json.data.verdicts[0].problems[0].message).toContain("no active academic session");
});

test("limits: 1000 rows, a strict body, a branch of the body that is not yours, and a rate limit", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  expect(
    (
      await send(
        cookie,
        Array.from({ length: 1001 }, (_, i) => row(i + 2)),
      )
    ).status,
  ).toBe(400);
  expect((await send(cookie, [row(2)], { surprise: 1 })).status).toBe(400);
  expect((await send(cookie, [])).status).toBe(400);
  expect((await api(IMPORT, { method: "POST", cookie, body: { branchId: home.id, rows: [row(2)] } })).status).toBe(400); // no dryRun: the old body is refused
  expect((await api(IMPORT, { method: "POST", cookie, body: { branchId: other.id, dryRun: true, rows: [row(2)] } })).status).toBe(403);
  let last = 200;
  for (let i = 0; i < 170 && last !== 429; i++) last = (await send(cookie, [row(2)])).status;
  expect(last).toBe(429);
});
