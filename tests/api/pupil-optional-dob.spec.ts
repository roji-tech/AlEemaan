import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { matchesDateOfBirth } from "@/lib/portal/auth";

// The date of birth is not required (the maintainer, 2026-11-18: only first name, last name and gender are). What that means, over real HTTP and against the real database: a pupil can
// be registered, edited and loaded in bulk without one; a missing date of birth cannot tell two pupils apart, so a namesake is still caught (a file loaded twice must not register
// everyone twice) and still needs the same confirmation; editing an unrelated field of a pupil with no date of birth does NOT ask for it again; a date that IS given must be real; and
// a pupil with no date of birth cannot sign in to the result portal with one.
let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});
const admin = async () => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return cookieHeader((await loginAs(user)).token!);
};
const STUDENTS = "/api/v1/students";
const create = (cookie: string, body: Record<string, unknown>) =>
  api(STUDENTS, { method: "POST", cookie, body: { branchId: home.id, firstName: "Amina", lastName: "Yusuf", gender: "FEMALE", ...body } });

test("a pupil is registered without a date of birth (missing, empty or null), and the record keeps none", async () => {
  const cookie = await admin();
  for (const [i, dob] of [undefined, "", null].entries()) {
    const res = await create(cookie, { firstName: `NoDob${i}`, ...(dob === undefined ? {} : { dateOfBirth: dob }) });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const saved = await db.studentRecord.findUniqueOrThrow({ where: { id: res.json.data.student.id } });
    expect(saved.dateOfBirth).toBeNull();
  }
});

test("gender and both names are still required; a date that is given must be a real one", async () => {
  const cookie = await admin();
  // A refused input is a 400 VALIDATION (the API's one answer for bad input), not a 422.
  expect((await create(cookie, { gender: undefined })).status).toBe(400);
  expect((await create(cookie, { firstName: "" })).status).toBe(400);
  expect((await create(cookie, { lastName: "" })).status).toBe(400);
  expect((await create(cookie, { dateOfBirth: "not-a-date" })).status).toBe(400);
});

test("a namesake with no date of birth is caught on either side, and is added only with the confirmation", async () => {
  const cookie = await admin();
  expect((await create(cookie, { dateOfBirth: "2014-03-21" })).status).toBe(201);
  // Same name, no date: cannot be told apart from the first.
  const without = await create(cookie, {});
  expect(without.status).toBe(409);
  expect(without.json.error.code).toBe("POSSIBLE_DUPLICATE");
  expect((await create(cookie, { allowDuplicate: true })).status).toBe(201);
  // Same name and a DIFFERENT date, with no pupil of that date: the one with no date is a possible namesake, the one with another date is not.
  const different = await create(cookie, { firstName: "Zed", dateOfBirth: "2010-01-01" });
  expect(different.status).toBe(201);
  const otherDate = await create(cookie, { firstName: "Zed", dateOfBirth: "2011-02-02" });
  expect(otherDate.status).toBe(201);
});

test("sisters with the same first and last name and different middle names are not namesakes, with no date of birth at all (the school's real data)", async () => {
  const cookie = await admin();
  const a = await create(cookie, { firstName: "Abdulbasit", middleName: "Balqees", lastName: "Zakariyya" });
  const b = await create(cookie, { firstName: "Abdulbasit", middleName: "Romlah", lastName: "Zakariyya" });
  expect(a.status, JSON.stringify(a.json)).toBe(201);
  expect(b.status, JSON.stringify(b.json)).toBe(201);
  // The same middle name (any capitals) IS a namesake; a name with no middle name cannot be told from either.
  expect((await create(cookie, { firstName: "Abdulbasit", middleName: "balqees", lastName: "Zakariyya" })).status).toBe(409);
  expect((await create(cookie, { firstName: "Abdulbasit", lastName: "Zakariyya" })).status).toBe(409);
});

test("bulk: rows that differ only in the middle name are not namesakes of each other", async () => {
  const cookie = await admin();
  const rows = ["Balqees", "Romlah"].map((middleName, i) => ({
    line: i + 2,
    values: { firstName: "Abdulbasit", middleName, lastName: "Zakariyya", gender: "Female" },
  }));
  const dry = await api("/api/v1/students/import", { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows } });
  expect(dry.status, JSON.stringify(dry.json)).toBe(200);
  expect(JSON.stringify(dry.json)).not.toContain("tell them apart");
});

test("editing an unrelated field of a pupil with no date of birth does not ask for a namesake confirmation; changing the name does", async () => {
  const cookie = await admin();
  const first = await create(cookie, { firstName: "Twin", lastName: "One" });
  const second = await create(cookie, { firstName: "Twin", lastName: "One", allowDuplicate: true });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const edit = await api(`${STUDENTS}/${second.json.data.student.id}`, { method: "PATCH", cookie, body: { guardianPhone: "08030000000" } });
  expect(edit.status, JSON.stringify(edit.json)).toBe(200);
  const rename = await api(`${STUDENTS}/${second.json.data.student.id}`, { method: "PATCH", cookie, body: { lastName: "One " } });
  expect(rename.status).toBe(200); // the same name, spelled the same: not a change
  await create(cookie, { firstName: "Other", lastName: "Name" });
  const clash = await api(`${STUDENTS}/${second.json.data.student.id}`, {
    method: "PATCH",
    cookie,
    body: { firstName: "Other", lastName: "Name" },
  });
  expect(clash.status).toBe(409);
});

test("a date of birth can be cleared by sending null and is left alone when it is not sent", async () => {
  const cookie = await admin();
  const made = await create(cookie, { dateOfBirth: "2014-03-21" });
  const id = made.json.data.student.id;
  expect((await api(`${STUDENTS}/${id}`, { method: "PATCH", cookie, body: { guardianName: "Mr Yusuf" } })).status).toBe(200);
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id } })).dateOfBirth).not.toBeNull();
  expect((await api(`${STUDENTS}/${id}`, { method: "PATCH", cookie, body: { dateOfBirth: null } })).status).toBe(200);
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id } })).dateOfBirth).toBeNull();
});

test("the list and the detail say null for a missing date of birth, never a made-up one", async () => {
  const cookie = await admin();
  const made = await create(cookie, { firstName: "Listed" });
  const list = await api(`${STUDENTS}?branchId=${home.id}&q=Listed`, { cookie });
  expect(list.status).toBe(200);
  expect(list.json.data.students[0].dateOfBirth).toBeNull();
  const one = await api(`${STUDENTS}/${made.json.data.student.id}`, { cookie });
  expect(one.json.data.student.dateOfBirth).toBeNull();
});

test("bulk: a file with no date of birth column is saved, and the same file again is refused as namesakes until the box is ticked", async () => {
  const cookie = await admin();
  const rows = [2, 3].map((line) => ({ line, values: { firstName: `Bulk${line}`, lastName: "Pupil", gender: "Male" } }));
  const send = (extra: Record<string, unknown>) =>
    api("/api/v1/students/import", { method: "POST", cookie, body: { branchId: home.id, dryRun: false, rows, ...extra } });
  const first = await send({});
  expect(first.status, JSON.stringify(first.json)).toBe(201);
  expect(await db.studentRecord.count({ where: { branchId: home.id, dateOfBirth: null } })).toBe(2);
  const again = await send({});
  expect(again.status).toBe(422);
  expect(JSON.stringify(again.json)).toContain("no date of birth to tell them apart");
  expect(await db.studentRecord.count({ where: { branchId: home.id } })).toBe(2);
  expect((await send({ allowDuplicates: true })).status).toBe(201);
  expect(await db.studentRecord.count({ where: { branchId: home.id } })).toBe(4);
});

test("bulk: two rows of one file with the same name and no date are namesakes of each other; with different dates they are not", async () => {
  const cookie = await admin();
  const send = (rows: unknown[]) =>
    api("/api/v1/students/import", { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows } });
  const same = await send([
    { line: 2, values: { firstName: "Same", lastName: "Name", gender: "Male" } },
    { line: 3, values: { firstName: "same", lastName: "NAME", gender: "Female" } },
  ]);
  expect(JSON.stringify(same.json)).toContain("Same name (no date of birth to tell them apart) as row 2");
  const apart = await send([
    { line: 2, values: { firstName: "Same", lastName: "Name", gender: "Male", dateOfBirth: "2014-01-01" } },
    { line: 3, values: { firstName: "Same", lastName: "Name", gender: "Male", dateOfBirth: "2014-01-02" } },
  ]);
  expect(JSON.stringify(apart.json)).not.toContain("tell them apart");
});

test("the result portal: a pupil with no date of birth cannot be matched by one (the guardian's phone or e-mail still can)", () => {
  expect(matchesDateOfBirth("2014-03-21", null)).toBe(false);
  expect(matchesDateOfBirth("", null)).toBe(false);
  expect(matchesDateOfBirth("2014-03-21", new Date("2014-03-21T00:00:00Z"))).toBe(true);
  expect(matchesDateOfBirth("21/03/2014", new Date("2014-03-21T00:00:00Z"))).toBe(true);
});
