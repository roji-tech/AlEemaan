import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0112 over real HTTP: the pupil filters, the export of the lists (who may, what rows, the audit), and the records in the top-bar search (only what the viewer may read).

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
const asRole = async (role: Role, branchIds: string[] = [home.id]) => {
  const user = await createUser();
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const yearsAgo = (years: number, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - days);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
};

async function classWithPupils() {
  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "Basic 3", sortOrder: 3 } });
  const armA = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
  const armB = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "B" } });
  const pupil = async (
    first: string,
    gender: "MALE" | "FEMALE",
    dob: Date | null,
    arm: { id: string; name: string } | null,
    no: string,
  ) => {
    const s = await db.studentRecord.create({
      data: { branchId: home.id, firstName: first, lastName: "Test", gender, dateOfBirth: dob, admissionNo: no },
    });
    if (arm)
      await db.studentEnrollment.create({
        data: { studentId: s.id, branchId: home.id, sessionId: session.id, className: "Basic 3", arm: arm.name, classArmId: arm.id },
      });
    return s;
  };
  await pupil("Aisha", "FEMALE", yearsAgo(8), armA, "P-1");
  await pupil("Bilal", "MALE", yearsAgo(9, -1), armA, "P-2"); // 8 until tomorrow
  await pupil("Chioma", "FEMALE", null, armB, "P-3");
  await pupil("Dauda", "MALE", yearsAgo(12), null, "P-4");
  return { group, armA, armB };
}

test("pupil filters: class, arm, no class, gender, age (no date of birth left out and counted); another branch's class is a 404", async () => {
  const admin = await asRole(Role.ADMIN);
  const { group, armA } = await classWithPupils();
  const names = async (query: string) => {
    const res = await api(`/api/v1/students?branchId=${home.id}${query}`, { cookie: admin.cookie });
    expect(res.status, query).toBe(200);
    return { names: (res.json.data.students as { firstName: string }[]).map((s) => s.firstName).sort(), res };
  };
  expect((await names(`&classGroupId=${group.id}`)).names).toEqual(["Aisha", "Bilal", "Chioma"]);
  expect((await names(`&classGroupId=${group.id}&classArmId=${armA.id}`)).names).toEqual(["Aisha", "Bilal"]);
  expect((await names(`&noClass=1`)).names).toEqual(["Dauda"]);
  expect((await names(`&gender=FEMALE`)).names).toEqual(["Aisha", "Chioma"]);
  const eight = await names(`&ageMin=8&ageMax=8`);
  expect(eight.names).toEqual(["Aisha", "Bilal"]);
  expect(eight.res.json.data.noDateOfBirth).toBe(1);
  expect(eight.res.json.data.pagination.total).toBe(2);
  expect((await names(`&ageMin=10`)).names).toEqual(["Dauda"]);
  const foreign = await db.classGroup.create({ data: { branchId: other.id, name: "Elsewhere", sortOrder: 1 } });
  expect((await api(`/api/v1/students?branchId=${home.id}&classGroupId=${foreign.id}`, { cookie: admin.cookie })).status).toBe(404);
  expect((await api(`/api/v1/students?branchId=${home.id}&ageMin=9&ageMax=8`, { cookie: admin.cookie })).status).toBe(400);
});

test("export: the shown rows are the list's rows on every page, in the template's columns; audited without data; a teacher and another branch's administrator are refused", async () => {
  const admin = await asRole(Role.ADMIN);
  const { group } = await classWithPupils();
  const shown = await api("/api/v1/exports", {
    method: "POST",
    cookie: admin.cookie,
    body: { kind: "pupils", branchId: home.id, scope: "shown", pupils: { q: "", show: "live", query: `&classGroupId=${group.id}` } },
  });
  expect(shown.status).toBe(200);
  expect(shown.headers.get("cache-control")).toBe("no-store");
  expect(shown.json.data.headers.slice(0, 3)).toEqual(["First name", "Middle name", "Last name"]);
  expect((shown.json.data.rows as string[][]).map((r) => r[0]).sort()).toEqual(["Aisha", "Bilal", "Chioma"]);
  expect(shown.json.data.rows.find((r: string[]) => r[0] === "Aisha")).toContain("Basic 3");
  expect(shown.json.data.fileStem).toMatch(/^pupils-[a-z0-9-]+-filtered-\d{4}-\d{2}-\d{2}$/);
  const all = await api("/api/v1/exports", {
    method: "POST",
    cookie: admin.cookie,
    body: { kind: "pupils", branchId: home.id, scope: "all" },
  });
  expect(all.json.data.count).toBe(4);
  const audit = await db.auditLog.findMany({
    where: { action: "EXPORT_CREATED", actorUserId: admin.user.id },
    orderBy: { createdAt: "asc" },
  });
  expect(audit).toHaveLength(2);
  expect(audit[0].afterValue).toMatchObject({ kind: "pupils", scope: "shown", rows: 3 });
  expect(JSON.stringify(audit)).not.toContain("Aisha");

  const teacher = await asRole(Role.TEACHING_STAFF);
  expect(
    (await api("/api/v1/exports", { method: "POST", cookie: teacher.cookie, body: { kind: "pupils", branchId: home.id, scope: "all" } }))
      .status,
  ).toBe(403);
  const otherAdmin = await asRole(Role.ADMIN, [other.id]);
  expect(
    (await api("/api/v1/exports", { method: "POST", cookie: otherAdmin.cookie, body: { kind: "pupils", branchId: home.id, scope: "all" } }))
      .status,
  ).toBe(403);

  // Staff "shown" is the ids on screen, intersected with the branch: another branch's record is not exported.
  const mine = await db.staffRecord.create({
    data: { branchId: home.id, category: "TEACHING", firstName: "Musa", lastName: "Bello", corpsMember: true },
  });
  const theirs = await db.staffRecord.create({
    data: { branchId: other.id, category: "TEACHING", firstName: "Hidden", lastName: "Person" },
  });
  const staff = await api("/api/v1/exports", {
    method: "POST",
    cookie: admin.cookie,
    body: { kind: "staff", branchId: home.id, scope: "shown", ids: [mine.id, theirs.id] },
  });
  expect(staff.json.data.rows).toEqual([["Teaching staff", "Musa", "Bello", "", "", "", "", "", "", "Yes", ""]]);
});

test("export: at most five per person in a few minutes", async () => {
  const admin = await asRole(Role.ADMIN);
  const go = () =>
    api("/api/v1/exports", { method: "POST", cookie: admin.cookie, body: { kind: "subjects", branchId: home.id, scope: "all" } });
  for (let i = 0; i < 5; i++) expect((await go()).status).toBe(200);
  expect((await go()).status).toBe(429);
});

test("search: records from the viewer's branches only; invoices only for an administrator; accounts only for a superadmin; staff only", async () => {
  await db.studentRecord.create({
    data: { branchId: home.id, firstName: "Zainab", lastName: "Okafor", gender: "FEMALE", admissionNo: "Z-1" },
  });
  await db.studentRecord.create({
    data: { branchId: other.id, firstName: "Zainab", lastName: "Elsewhere", gender: "FEMALE", admissionNo: "Z-2" },
  });
  await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Zainab", lastName: "Teacher" } });
  const teacher = await asRole(Role.TEACHING_STAFF);
  const res = await api(`/api/v1/search?q=${encodeURIComponent("zainab")}`, { cookie: teacher.cookie });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const hits = res.json.data.results as { kind: string; title: string; line: string; href: string }[];
  expect(hits.filter((h) => h.kind === "pupil").map((h) => h.title)).toEqual(["Zainab Okafor"]);
  expect(hits.find((h) => h.kind === "pupil")!.href).toBe(`/students?branch=${home.id}&q=Z-1`);
  expect(hits.filter((h) => h.kind === "staff").map((h) => h.title)).toEqual(["Zainab Teacher"]);
  expect(JSON.stringify(res.json)).not.toContain("Elsewhere");
  expect(hits.some((h) => h.kind === "invoice" || h.kind === "user")).toBe(false);
  // Two words: both must match.
  expect(
    ((await api(`/api/v1/search?q=${encodeURIComponent("zainab okafor")}`, { cookie: teacher.cookie })).json.data.results as unknown[])
      .length,
  ).toBe(1);
  // Too short: nothing, and nothing counted.
  expect((await api(`/api/v1/search?q=z`, { cookie: teacher.cookie })).json.data.results).toEqual([]);
  // Accounts: a superadmin only.
  // A superadmin holds at least one membership (lib/auth/branch-access: a superadmin flag alone grants nothing); `role: ADMIN` gives both.
  const sa = await createUser({ role: Role.ADMIN, name: "Zainab Admin" });
  const saCookie = cookieHeader((await loginAs(sa)).token!);
  const saHits = (await api(`/api/v1/search?q=zainab`, { cookie: saCookie })).json.data.results as { kind: string }[];
  expect(saHits.some((h) => h.kind === "user")).toBe(true);
  expect(saHits.filter((h) => h.kind === "pupil")).toHaveLength(2);
  // Not staff, not signed in.
  const parent = await asRole(Role.PARENT);
  expect((await api(`/api/v1/search?q=zainab`, { cookie: parent.cookie })).status).toBe(403);
  expect((await api(`/api/v1/search?q=zainab`)).status).toBe(401);
});
