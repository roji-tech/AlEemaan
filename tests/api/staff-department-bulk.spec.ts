import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0101 D7 follow-up (task 0118): the Department column of the bulk staff file and its export, and "Add to department" for the people ticked in the selection bar (the department's
// members route, which checks everything again).

const DEPTS = "/api/v1/academics/departments";
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
const asAdmin = async (branchIds: string[] = [home.id]) => {
  const user = await createUser();
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const turnOn = (cookie: string, branchId = home.id) =>
  api("/api/v1/settings/departments", { method: "PUT", cookie, body: { branchId, enabled: true } });
const makeDepartment = async (cookie: string, name: string, branchId = home.id) => {
  const made = await api(DEPTS, { method: "POST", cookie, body: { branchId, name } });
  expect(made.status, made.text).toBe(201);
  return made.json.data.department.id as string;
};
let n = 0;
const row = (line: number, values: Record<string, string>) => ({
  line,
  values: { category: "Teaching", firstName: `Bulk${++n}`, lastName: "Person", ...values },
});
const importStaff = (cookie: string, rows: unknown[], dryRun: boolean, branchId = home.id) =>
  api("/api/v1/staff/import", { method: "POST", cookie, body: { branchId, dryRun, rows } });

test.describe("the Department column of the bulk staff file", () => {
  test("a department is matched by name in any capitals; the person joins it as a member, never its head; audited", async () => {
    const admin = await asAdmin();
    await turnOn(admin.cookie);
    const sciences = await makeDepartment(admin.cookie, "Sciences");
    const saved = await importStaff(admin.cookie, [row(2, { department: "sCiEnCeS" }), row(3, {})], false);
    expect(saved.status, saved.text).toBe(201);
    const members = await db.departmentMember.findMany({ where: { departmentId: sciences } });
    expect(members).toHaveLength(1);
    expect(members[0].isHead).toBe(false);
    expect(await db.auditLog.count({ where: { action: "DEPARTMENT_MEMBER_ADDED", targetId: sciences } })).toBe(1);
  });

  test("an unknown department is a problem on that row and nothing is saved", async () => {
    const admin = await asAdmin();
    await turnOn(admin.cookie);
    await makeDepartment(admin.cookie, "Sciences");
    const rows = [row(2, { department: "Sciences" }), row(3, { department: "Astrology" })];
    const dry = await importStaff(admin.cookie, rows, true);
    const bad = (dry.json.data.verdicts ?? dry.json.data.rows ?? []).find((v: { line: number }) => v.line === 3);
    expect(JSON.stringify(bad)).toContain("Astrology");
    const saved = await importStaff(admin.cookie, rows, false);
    expect(saved.status).toBe(422);
    expect(await db.staffRecord.count({ where: { firstName: { startsWith: "Bulk" } } })).toBe(0);
  });

  test("another branch's department, and an archived one, are not found by name", async () => {
    const boss = await asAdmin([home.id, other.id]);
    await turnOn(boss.cookie, home.id);
    await turnOn(boss.cookie, other.id);
    await makeDepartment(boss.cookie, "Languages", other.id);
    const old = await makeDepartment(boss.cookie, "Old", home.id);
    await api(`${DEPTS}/${old}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
    expect((await importStaff(boss.cookie, [row(2, { department: "Languages" })], false)).status).toBe(422);
    expect((await importStaff(boss.cookie, [row(2, { department: "Old" })], false)).status).toBe(422);
  });

  test("while the branch does not use departments the column is ignored, with a note, and the people are saved", async () => {
    const admin = await asAdmin();
    const dry = await importStaff(admin.cookie, [row(2, { department: "Sciences" })], true);
    expect(dry.status, dry.text).toBe(200);
    expect(JSON.stringify(dry.json.data)).toContain("does not use departments");
    const saved = await importStaff(admin.cookie, [row(2, { department: "Sciences" })], false);
    expect(saved.status, saved.text).toBe(201);
    expect(await db.departmentMember.count()).toBe(0);
  });

  test("saved as drafts the people are not put in the department (a draft is left out of what acts on staff), and the review says so", async () => {
    const admin = await asAdmin();
    await turnOn(admin.cookie);
    const sciences = await makeDepartment(admin.cookie, "Sciences");
    const saved = await api("/api/v1/staff/import", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, asDraft: true, rows: [row(2, { department: "Sciences" })] },
    });
    expect(saved.status, saved.text).toBe(201);
    expect(await db.staffRecord.count({ where: { isDraft: true } })).toBe(1);
    expect(await db.departmentMember.count({ where: { departmentId: sciences } })).toBe(0);
  });
});

test.describe("the export carries the departments", () => {
  test("a Department column, the names joined, in the template's order", async () => {
    const admin = await asAdmin();
    await turnOn(admin.cookie);
    const sciences = await makeDepartment(admin.cookie, "Sciences");
    const languages = await makeDepartment(admin.cookie, "Languages");
    const person = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Amina", lastName: "Yusuf" },
    });
    await db.departmentMember.createMany({
      data: [sciences, languages].map((departmentId) => ({ branchId: home.id, departmentId, staffRecordId: person.id })),
    });
    const exported = await api("/api/v1/exports", {
      method: "POST",
      cookie: admin.cookie,
      body: { kind: "staff", branchId: home.id, scope: "all" },
    });
    expect(exported.status, exported.text).toBe(200);
    const headers = exported.json.data.headers as string[];
    expect(headers.at(-1)).toBe("Department");
    expect((exported.json.data.rows as string[][])[0].at(-1)).toBe("Languages; Sciences");
  });
});

test.describe("Add to department (the selection bar)", () => {
  test("every ticked live record joins; those already in it are counted, not duplicated; a draft or another branch's record is refused whole", async () => {
    const admin = await asAdmin();
    await turnOn(admin.cookie);
    const sciences = await makeDepartment(admin.cookie, "Sciences");
    const mk = (branchId: string, extra: object = {}) =>
      db.staffRecord.create({ data: { branchId, category: "TEACHING", firstName: `Tick${++n}`, lastName: "Box", ...extra } });
    const a = await mk(home.id);
    const b = await mk(home.id);
    const draft = await mk(home.id, { isDraft: true });
    const foreign = await mk(other.id);
    const first = await api(`${DEPTS}/${sciences}/members`, { method: "POST", cookie: admin.cookie, body: { staffIds: [a.id, b.id] } });
    expect(first.status, first.text).toBe(200);
    expect(first.json.data).toEqual({ added: 2, skipped: 0 });
    const second = await api(`${DEPTS}/${sciences}/members`, { method: "POST", cookie: admin.cookie, body: { staffIds: [a.id, b.id] } });
    expect(second.json.data).toEqual({ added: 0, skipped: 2 });
    expect(
      (await api(`${DEPTS}/${sciences}/members`, { method: "POST", cookie: admin.cookie, body: { staffIds: [draft.id] } })).status,
    ).toBe(409);
    expect(
      (await api(`${DEPTS}/${sciences}/members`, { method: "POST", cookie: admin.cookie, body: { staffIds: [foreign.id] } })).status,
    ).toBe(409);
    expect(await db.departmentMember.count({ where: { departmentId: sciences } })).toBe(2);
  });
});
