import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0113 over real HTTP: guardians as records of their own (linked to pupils by StudentGuardian), who may see and change them, blocking a guardian from one child, the guardian's
// access code, the family sign-in through the links, class slips, and day or boarding. Who may do each is checked first. (The mirror is a pupil's old guardian columns, written only from the
// links.)

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
const superAdmin = async () => {
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
let n = 0;
/// A pupil with no guardian columns (so nothing links it for us): the spec links explicitly.
const pupil = (branchId: string, extra: Record<string, unknown> = {}) =>
  db.studentRecord.create({
    data: {
      branchId,
      firstName: `Pupil${++n}`,
      lastName: "Family",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2014-03-21T00:00:00Z"),
      admissionNo: `T/${Date.now() % 100000}/${n}`,
      ...extra,
    },
  });
const guardian = (name = "Mrs Yusuf", extra: Record<string, unknown> = {}) =>
  db.guardian.create({ data: { name, phone: "08030001111", phoneKey: "8030001111", email: "mrs.yusuf@example.com", ...extra } });
const link = (studentId: string, branchId: string, guardianId: string, extra: Record<string, unknown> = {}) =>
  db.studentGuardian.create({ data: { studentId, branchId, guardianId, isMain: true, ...extra } });
const dto = (res: { json: { data: unknown } }) => res.json.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const mirrorOf = (id: string) =>
  db.studentRecord.findUniqueOrThrow({ where: { id }, select: { guardianName: true, guardianPhone: true, guardianEmail: true } });

test.describe("who may use the guardian screens", () => {
  test("signed out 401; a teacher 403 on every guardian route", async () => {
    const teacher = await asRole(Role.TEACHING_STAFF);
    const g = await guardian();
    const p = await pupil(home.id);
    await link(p.id, home.id, g.id);
    for (const path of [
      "/api/v1/guardians",
      `/api/v1/guardians/${g.id}`,
      "/api/v1/guardians/match?contact=08030001111",
      `/api/v1/students/${p.id}/guardians`,
    ])
      expect((await api(path)).status, `${path} signed out`).toBe(401);
    for (const path of ["/api/v1/guardians", `/api/v1/guardians/${g.id}`, "/api/v1/guardians/match?contact=08030001111"])
      expect((await api(path, { cookie: teacher.cookie })).status, `${path} teacher`).toBe(403);
    expect((await api(`/api/v1/guardians/${g.id}/access-code`, { method: "POST", cookie: teacher.cookie, body: {} })).status).toBe(403);
    expect(
      (
        await api(`/api/v1/guardians/${g.id}/children/${p.id}`, {
          method: "PATCH",
          cookie: teacher.cookie,
          body: { blocked: true, reason: "no" },
        })
      ).status,
    ).toBe(403);
  });
});

test.describe("the old student fields still make a guardian", () => {
  test("registering with a guardian name, phone and e-mail makes one guardian, links them as the main contact, and the pupil's columns mirror them", async () => {
    const admin = await asRole(Role.ADMIN);
    const res = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        firstName: "Fatima",
        lastName: "Musa",
        gender: "FEMALE",
        guardianName: "Mrs Musa",
        guardianPhone: "0803 000 1111",
        guardianEmail: "Musa@Example.com",
        guardianRelationship: "MOTHER",
      },
    });
    expect(res.status, res.text).toBe(201);
    expect(JSON.stringify(res.json)).not.toContain("pupilCodeHash");
    const guardians = await db.guardian.findMany({ include: { children: true } });
    expect(guardians).toHaveLength(1);
    expect([guardians[0].name, guardians[0].phone, guardians[0].phoneKey, guardians[0].email]).toEqual([
      "Mrs Musa",
      "08030001111",
      "8030001111",
      "musa@example.com",
    ]);
    expect(guardians[0].children.map((c) => [c.isMain, c.relationship, c.branchId])).toEqual([[true, "MOTHER", home.id]]);
    expect(await mirrorOf(res.json.data.student.id)).toEqual({
      guardianName: "Mrs Musa",
      guardianPhone: "08030001111",
      guardianEmail: "musa@example.com",
    });
  });

  test("a brother with the same whole phone and the same name shares the guardian; the same phone with another name is another guardian", async () => {
    const admin = await asRole(Role.ADMIN);
    const create = (firstName: string, guardianName: string, phone: string) =>
      api("/api/v1/students", {
        method: "POST",
        cookie: admin.cookie,
        body: { branchId: home.id, firstName, lastName: "Musa", gender: "MALE", guardianName, guardianPhone: phone },
      });
    expect((await create("Ibrahim", "Mrs Musa", "08030001111")).status).toBe(201);
    expect((await create("Yusuf", "mrs  musa", "+234 803 000 1111")).status).toBe(201); // the same person, written another way
    expect((await create("Zainab", "Mr Bello", "08030001111")).status).toBe(201); // a different person on the same phone
    const guardians = await db.guardian.findMany({ include: { children: true }, orderBy: { createdAt: "asc" } });
    expect(guardians.map((g) => [g.name, g.children.length])).toEqual([
      ["Mrs Musa", 2],
      ["Mr Bello", 1],
    ]);
  });

  test("editing the guardian fields changes the main guardian in place for all their children; clearing all three unlinks them", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await guardian();
    const a = await pupil(home.id);
    const b = await pupil(home.id);
    await link(a.id, home.id, g.id);
    await link(b.id, home.id, g.id);
    const edit = await api(`/api/v1/students/${a.id}`, { method: "PATCH", cookie: admin.cookie, body: { guardianPhone: "08099990000" } });
    expect(edit.status, edit.text).toBe(200);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).phoneKey).toBe("8099990000");
    expect((await mirrorOf(b.id)).guardianPhone).toBe("08099990000"); // the sibling follows
    const clear = await api(`/api/v1/students/${a.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { guardianName: null, guardianPhone: null, guardianEmail: null },
    });
    expect(clear.status, clear.text).toBe(200);
    expect(await db.studentGuardian.count({ where: { studentId: a.id } })).toBe(0);
    expect(await db.studentGuardian.count({ where: { studentId: b.id } })).toBe(1);
    expect(await mirrorOf(a.id)).toEqual({ guardianName: null, guardianPhone: null, guardianEmail: null });
  });

  test("a guardian is found by the whole phone (any way of writing it) among those the administrator can see, and chosen by id; an unknown or unseen id is a 404 and nothing is registered", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await guardian("Mrs Yusuf");
    const kid = await pupil(home.id, { firstName: "Hauwa", lastName: "Yusuf" });
    await link(kid.id, home.id, g.id);
    const found = await api("/api/v1/guardians/match?contact=%2B234%20803%20000%201111", { cookie: admin.cookie });
    expect(found.status).toBe(200);
    expect(found.headers.get("cache-control")).toBe("no-store");
    expect(dto(found).guardians).toEqual([
      expect.objectContaining({ id: g.id, name: "Mrs Yusuf", children: ["Hauwa Yusuf"], otherBranches: 0 }),
    ]);
    expect(dto(await api("/api/v1/guardians/match?contact=08030009999", { cookie: admin.cookie })).guardians).toEqual([]);
    const chosen = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, firstName: "Sade", lastName: "Yusuf", gender: "FEMALE", guardianId: g.id, guardianRelationship: "MOTHER" },
    });
    expect(chosen.status, chosen.text).toBe(201);
    expect(await db.studentGuardian.count({ where: { guardianId: g.id } })).toBe(2);
    expect((await mirrorOf(chosen.json.data.student.id)).guardianName).toBe("Mrs Yusuf");
    const before = await db.studentRecord.count();
    const missing = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, firstName: "Nobody", lastName: "Home", gender: "MALE", guardianId: "no-such-guardian" },
    });
    expect(missing.status).toBe(404);
    expect(await db.studentRecord.count()).toBe(before);
    // A guardian whose children are all in another branch is out of this administrator's reach: the same 404.
    const stranger = await guardian("Mr Stranger", { phone: "08031112222", phoneKey: "8031112222" });
    const away = await pupil(other.id);
    await link(away.id, other.id, stranger.id);
    expect(dto(await api("/api/v1/guardians/match?contact=08031112222", { cookie: admin.cookie })).guardians).toEqual([]);
    const refused = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, firstName: "Peek", lastName: "Home", gender: "MALE", guardianId: stranger.id },
    });
    expect(refused.status).toBe(404);
  });
});

test.describe("Users > Guardians: what an administrator sees", () => {
  test("a branch administrator sees the guardians with a child in their branch, their own children by name and a count of those elsewhere; a superadmin sees all", async () => {
    const admin = await asRole(Role.ADMIN);
    const both = await guardian("Mrs Both");
    const here = await pupil(home.id, { firstName: "Hereward", lastName: "Both" });
    const there = await pupil(other.id, { firstName: "Thereward", lastName: "Both" });
    await link(here.id, home.id, both.id);
    await link(there.id, other.id, both.id, { isMain: false });
    const alone = await guardian("Mr Alone", { phone: "08035556666", phoneKey: "8035556666" });
    const away = await pupil(other.id);
    await link(away.id, other.id, alone.id);

    const list = await api("/api/v1/guardians", { cookie: admin.cookie });
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect((dto(list).guardians as { name: string }[]).map((g) => g.name)).toEqual(["Mrs Both"]);
    expect(dto(list).guardians[0]).toMatchObject({ children: 1, otherBranches: 1, blocked: 0, codeAt: null });

    const detail = await api(`/api/v1/guardians/${both.id}`, { cookie: admin.cookie });
    expect(detail.status).toBe(200);
    expect(dto(detail).children.map((c: { name: string }) => c.name)).toEqual(["Hereward Both"]);
    expect(dto(detail).otherBranches).toBe(1);
    expect(dto(detail).can).toEqual({ edit: false, code: false }); // a child is in a branch this administrator does not run
    expect(JSON.stringify(detail.json)).not.toContain("Thereward"); // no name from the other branch
    expect((await api(`/api/v1/guardians/${alone.id}`, { cookie: admin.cookie })).status).toBe(404); // out of reach = unknown

    const root = await superAdmin();
    const all = await api("/api/v1/guardians?limit=50", { cookie: root.cookie });
    expect((dto(all).guardians as { name: string }[]).map((g) => g.name).sort()).toEqual(["Mr Alone", "Mrs Both"]);
    const full = await api(`/api/v1/guardians/${both.id}`, { cookie: root.cookie });
    expect(dto(full).children).toHaveLength(2);
    expect(dto(full).can).toEqual({ edit: true, code: true });
  });

  test("search by name, by the phone written any way, and by e-mail; the Access filters", async () => {
    const admin = await asRole(Role.ADMIN);
    const a = await guardian("Alhaji Danjuma", { phone: "08031234567", phoneKey: "8031234567", email: "danjuma@example.com" });
    const b = await guardian("Mrs Okafor", { phone: "08099998888", phoneKey: "8099998888", email: "okafor@example.com" });
    for (const g of [a, b]) await link((await pupil(home.id)).id, home.id, g.id);
    const names = async (query: string) =>
      ((dto(await api(`/api/v1/guardians?${query}`, { cookie: admin.cookie })).guardians as { name: string }[]) ?? []).map((g) => g.name);
    expect(await names("q=danj")).toEqual(["Alhaji Danjuma"]);
    expect(await names(`q=${encodeURIComponent("+234 803 123 4567")}`)).toEqual(["Alhaji Danjuma"]);
    expect(await names("q=0809999")).toEqual(["Mrs Okafor"]);
    expect(await names("q=okafor%40example")).toEqual(["Mrs Okafor"]);
    expect(await names("q=zzz")).toEqual([]);
    expect(await names("status=nocode")).toEqual(["Alhaji Danjuma", "Mrs Okafor"]);
    expect((await api("/api/v1/guardians?status=weird", { cookie: admin.cookie })).status).toBe(400);
  });
});

test.describe("changing a guardian's details and making their code", () => {
  test("a guardian with children in two branches: an administrator of one is refused (403), an administrator of both and a superadmin may; the edit reaches every child's contact columns", async () => {
    const one = await asRole(Role.ADMIN, [home.id]);
    const both = await asRole(Role.ADMIN, [home.id, other.id]);
    const g = await guardian();
    const a = await pupil(home.id);
    const b = await pupil(other.id);
    await link(a.id, home.id, g.id);
    await link(b.id, other.id, g.id, { isMain: true });
    const edit = (cookie: string, body: object) => api(`/api/v1/guardians/${g.id}`, { method: "PATCH", cookie, body });
    const refused = await edit(one.cookie, { name: "Mrs Renamed" });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("FORBIDDEN");
    expect((await api(`/api/v1/guardians/${g.id}/access-code`, { method: "POST", cookie: one.cookie, body: {} })).status).toBe(403);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).name).toBe("Mrs Yusuf");

    const done = await edit(both.cookie, { name: "Mrs Renamed", phone: "0803 777 8888", email: "" });
    expect(done.status, done.text).toBe(200);
    const row = await db.guardian.findUniqueOrThrow({ where: { id: g.id } });
    expect([row.name, row.phone, row.phoneKey, row.email]).toEqual(["Mrs Renamed", "08037778888", "8037778888", null]);
    for (const id of [a.id, b.id])
      expect(await mirrorOf(id)).toEqual({ guardianName: "Mrs Renamed", guardianPhone: "08037778888", guardianEmail: null });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "GUARDIAN_UPDATED", targetId: g.id } });
    expect(JSON.stringify(log.afterValue)).toContain("name"); // the fields are named
    expect(JSON.stringify(log.afterValue)).not.toContain("Mrs Renamed"); // never the values

    expect((await edit((await superAdmin()).cookie, { name: "Mrs Root" })).status).toBe(200);
    expect((await edit(both.cookie, {})).status).toBe(400); // nothing to change
    expect((await edit(both.cookie, { phone: "x".repeat(41) })).status).toBe(400);
    expect((await edit(both.cookie, { email: "not-an-address" })).status).toBe(400);
  });

  test("a new access code is shown once, is stored only as a hash, replaces the old one, bumps the version and is audited without the code", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await guardian();
    const a = await pupil(home.id, { firstName: "Aa", lastName: "Kid" });
    const b = await pupil(home.id, { firstName: "Bb", lastName: "Kid" });
    await link(a.id, home.id, g.id);
    await link(b.id, home.id, g.id, { isMain: false });
    const make = () => api(`/api/v1/guardians/${g.id}/access-code`, { method: "POST", cookie: admin.cookie, body: {} });
    const first = await make();
    expect(first.status, first.text).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const code1 = dto(first).code as string;
    expect(code1).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect((dto(first).children as { name: string }[]).map((c) => c.name).sort()).toEqual(["Aa Kid", "Bb Kid"]); // one code for all the children
    const stored = await db.guardian.findUniqueOrThrow({ where: { id: g.id } });
    expect(stored.codeHash).toMatch(/^s1\$/);
    expect(stored.codeHash).not.toContain(code1.replace("-", ""));
    expect(stored.portalVersion).toBe(1);
    const second = await make();
    expect(dto(second).code).not.toBe(code1);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).portalVersion).toBe(2);
    const logs = await db.auditLog.findMany({ where: { action: "GUARDIAN_CODE_ISSUED", targetId: g.id } });
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toContain(code1.replace("-", ""));
    // The pupil's own code is the pupil's, on its own route; asking for a guardian code there is refused.
    expect(
      (await api(`/api/v1/students/${a.id}/access-codes`, { method: "POST", cookie: admin.cookie, body: { which: "guardian" } })).status,
    ).toBe(400);
    const pupilCode = await api(`/api/v1/students/${a.id}/access-codes`, {
      method: "POST",
      cookie: admin.cookie,
      body: { which: "pupil" },
    });
    expect(pupilCode.status, pupilCode.text).toBe(200);
    expect(dto(pupilCode).slip.pupilCode).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const status = await api(`/api/v1/students/${a.id}/access-codes`, { cookie: admin.cookie });
    expect(dto(status).guardians).toEqual([expect.objectContaining({ guardianId: g.id, isMain: true, blocked: false, canAct: true })]);
    expect(JSON.stringify(status.json)).not.toMatch(/Hash/);
  });
});

test.describe("blocking a guardian from one child", () => {
  test("a reason is required; the block and the unblock bump the guardian's version, empty and refill that child's contact columns only, and are audited", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await guardian();
    const a = await pupil(home.id);
    const b = await pupil(home.id);
    await link(a.id, home.id, g.id);
    await link(b.id, home.id, g.id);
    // The links above were written directly, so the pupils' contact columns are still empty: an edit of the guardian runs the one writer (the mirror) for every child.
    const root = await superAdmin();
    await api(`/api/v1/guardians/${g.id}`, { method: "PATCH", cookie: root.cookie, body: { name: "Mrs Yusuf Senior" } });
    expect((await mirrorOf(a.id)).guardianName).toBe("Mrs Yusuf Senior");
    const path = `/api/v1/guardians/${g.id}/children/${a.id}`;
    const patch = (body: object) => api(path, { method: "PATCH", cookie: admin.cookie, body });

    expect((await patch({ blocked: true })).status).toBe(400); // no reason
    expect((await patch({ blocked: true, reason: "x" })).status).toBe(400); // too short to be a reason
    expect((await patch({})).status).toBe(400); // nothing to change
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).portalVersion).toBe(0);

    const blocked = await patch({ blocked: true, reason: "Court order of 12 March" });
    expect(blocked.status, blocked.text).toBe(200);
    const row = await db.studentGuardian.findUniqueOrThrow({ where: { studentId_guardianId: { studentId: a.id, guardianId: g.id } } });
    expect([row.blockedAt !== null, row.blockedById, row.blockedReason]).toEqual([true, admin.user.id, "Court order of 12 March"]);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).portalVersion).toBe(1);
    expect(await mirrorOf(a.id)).toEqual({ guardianName: null, guardianPhone: null, guardianEmail: null }); // not this child's contact any more
    expect((await mirrorOf(b.id)).guardianName).toBe("Mrs Yusuf Senior"); // the other child is untouched
    const child = dto(blocked).guardian.children.find((c: { studentId: string }) => c.studentId === a.id);
    expect(child.blocked).toMatchObject({ reason: "Court order of 12 March" });
    expect(dto(await api("/api/v1/guardians", { cookie: admin.cookie })).guardians[0].blocked).toBe(1);
    expect((await api("/api/v1/guardians?status=blocked", { cookie: admin.cookie })).json.meta.total).toBe(1);

    const blockLog = await db.auditLog.findFirstOrThrow({ where: { action: "GUARDIAN_LINK_BLOCKED" } });
    expect(JSON.stringify(blockLog.afterValue)).not.toContain("Court order"); // that a reason was given, not the words
    expect((await patch({ blocked: true, reason: "again please" })).status).toBe(200); // already blocked: nothing more happens
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).portalVersion).toBe(1);

    const open = await patch({ blocked: false });
    expect(open.status, open.text).toBe(200);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).portalVersion).toBe(2);
    expect((await mirrorOf(a.id)).guardianName).toBe("Mrs Yusuf Senior");
    expect(await db.auditLog.count({ where: { action: "GUARDIAN_LINK_UNBLOCKED" } })).toBe(1);
  });

  test("only a superadmin or an administrator of the CHILD's branch may; another branch's child, or a guardian who is not theirs, is a 404", async () => {
    const homeAdmin = await asRole(Role.ADMIN, [home.id]);
    const otherAdmin = await asRole(Role.ADMIN, [other.id]);
    const g = await guardian();
    const a = await pupil(home.id);
    const b = await pupil(other.id);
    await link(a.id, home.id, g.id);
    await link(b.id, other.id, g.id, { isMain: false });
    const block = (cookie: string, studentId: string, guardianId = g.id) =>
      api(`/api/v1/guardians/${guardianId}/children/${studentId}`, {
        method: "PATCH",
        cookie,
        body: { blocked: true, reason: "Not allowed to collect" },
      });
    expect((await block(homeAdmin.cookie, b.id)).status).toBe(404); // the other branch's child
    expect((await block(otherAdmin.cookie, a.id)).status).toBe(404);
    expect((await block(homeAdmin.cookie, a.id, "no-such-guardian")).status).toBe(404);
    const loner = await guardian("Mr Loner", { phone: "08038889999", phoneKey: "8038889999" });
    expect((await block(homeAdmin.cookie, a.id, loner.id)).status).toBe(404); // not this child's guardian
    expect((await block(homeAdmin.cookie, a.id)).status).toBe(200); // an administrator of the child's branch need not run the guardian's other branches
    expect((await block((await superAdmin()).cookie, b.id)).status).toBe(200);
    expect(await db.studentGuardian.count({ where: { blockedAt: { not: null } } })).toBe(2);
  });

  test("the pupil's own guardians list: relationship, main contact, unlink (the guardian stays), and a guardian found by phone or added new", async () => {
    const admin = await asRole(Role.ADMIN);
    const g = await guardian("Mrs Yusuf");
    const p = await pupil(home.id);
    await link(p.id, home.id, g.id);
    const list = await api(`/api/v1/students/${p.id}/guardians`, { cookie: admin.cookie });
    expect(dto(list).guardians).toEqual([
      expect.objectContaining({ guardianId: g.id, isMain: true, blocked: null, otherChildren: 0, canAct: true }),
    ]);
    const added = await api(`/api/v1/students/${p.id}/guardians`, {
      method: "POST",
      cookie: admin.cookie,
      body: { name: "Mr Yusuf", phone: "08035550000", relationship: "FATHER" },
    });
    expect(added.status, added.text).toBe(201);
    expect(dto(added).guardians.map((x: { name: string; relationship: string | null }) => [x.name, x.relationship])).toEqual([
      ["Mrs Yusuf", null],
      ["Mr Yusuf", "FATHER"],
    ]);
    const second = dto(added).guardians[1].guardianId as string;
    expect(
      (await api(`/api/v1/students/${p.id}/guardians`, { method: "POST", cookie: admin.cookie, body: { name: "No Contact" } })).status,
    ).toBe(400);
    expect(
      (await api(`/api/v1/students/${p.id}/guardians`, { method: "POST", cookie: admin.cookie, body: { guardianId: "nobody" } })).status,
    ).toBe(404);
    const main = await api(`/api/v1/guardians/${second}/children/${p.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { isMain: true, relationship: "FATHER" },
    });
    expect(main.status, main.text).toBe(200);
    expect((await mirrorOf(p.id)).guardianName).toBe("Mr Yusuf"); // the main contact is the mirror
    expect(await db.studentGuardian.count({ where: { studentId: p.id, isMain: true } })).toBe(1);
    const gone = await api(`/api/v1/guardians/${second}/children/${p.id}`, { method: "DELETE", cookie: admin.cookie });
    expect(gone.status).toBe(200);
    expect(await db.guardian.count({ where: { id: second } })).toBe(1); // the guardian record stays
    expect((await mirrorOf(p.id)).guardianName).toBe("Mrs Yusuf"); // the other guardian is the main contact again
    expect((await api(`/api/v1/guardians/${second}/children/${p.id}`, { method: "DELETE", cookie: admin.cookie })).status).toBe(404);
  });
});

test.describe("the family sign-in through the links", () => {
  const signIn = (admissionNo: string, secret: string) => api("/api/v1/portal/session", { method: "POST", body: { admissionNo, secret } });
  const cookieOf = (res: { setCookies: string[] }) => res.setCookies[0]!.split(";")[0]!;
  const family = async () => {
    const g = await guardian("Mrs Family", { phone: "08031110000", phoneKey: "8031110000", email: "family@example.com" });
    const a = await pupil(home.id, { firstName: "Alpha", lastName: "Family", admissionNo: "FAM/001" });
    const b = await pupil(home.id, { firstName: "Beta", lastName: "Family", admissionNo: "FAM/002" });
    await link(a.id, home.id, g.id);
    await link(b.id, home.id, g.id, { isMain: false });
    return { g, a, b };
  };
  const issue = async (guardianId: string) => {
    const root = await superAdmin();
    const res = await api(`/api/v1/guardians/${guardianId}/access-code`, { method: "POST", cookie: root.cookie, body: {} });
    return dto(res).code as string;
  };

  test("the guardian's code opens every allowed child from any child's admission number; the old code stops at once and ends the open session", async () => {
    const { g, a, b } = await family();
    const code = await issue(g.id);
    const res = await signIn("FAM/002", code);
    expect(res.status, res.text).toBe(200);
    expect(dto(res).actor).toBe("GUARDIAN");
    expect(dto(res).student.id).toBe(b.id); // the one whose number was typed comes first
    expect(JSON.stringify(res.json)).not.toMatch(/Hash/);
    expect((dto(res).siblingStudents as { id: string }[]).map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    const cookie = cookieOf(res);
    const live = await api("/api/v1/portal/session", { cookie });
    expect(live.status).toBe(200);
    expect(dto(live).students).toHaveLength(2);
    expect((await api(`/api/v1/portal/students/${a.id}/overview`, { cookie })).status).toBe(200);
    // Typed in lower case without the dash: the same code.
    expect((await signIn("fam/001", code.replace("-", "").toLowerCase())).status).toBe(200);

    const next = await issue(g.id);
    expect(next).not.toBe(code);
    expect((await signIn("FAM/001", code)).status).toBe(401); // the old code stops
    expect((await api("/api/v1/portal/session", { cookie })).status).toBe(401); // and the open session ends
    expect((await api(`/api/v1/portal/students/${a.id}/overview`, { cookie })).status).toBe(401);
    expect((await signIn("FAM/001", next)).status).toBe(200);
  });

  test("blocking the guardian from one child: their session ends, that child's admission number no longer signs them in, the other child's does and shows only the allowed child", async () => {
    const { g, a, b } = await family();
    const code = await issue(g.id);
    const cookie = cookieOf(await signIn("FAM/001", code));
    const admin = await asRole(Role.ADMIN);
    const blocked = await api(`/api/v1/guardians/${g.id}/children/${a.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { blocked: true, reason: "Court order of 12 March" },
    });
    expect(blocked.status, blocked.text).toBe(200);
    expect((await api("/api/v1/portal/session", { cookie })).status).toBe(401); // the open session ended with the version
    const refused = await signIn("FAM/001", code);
    expect(refused.status).toBe(401);
    expect(refused.json.error.message).toMatch(/Verification failed/); // the same generic answer as a wrong code
    const again = await signIn("FAM/002", code);
    expect(again.status, again.text).toBe(200);
    expect((dto(again).siblingStudents as { id: string }[]).map((s) => s.id)).toEqual([b.id]);
    expect((await api(`/api/v1/portal/students/${a.id}/overview`, { cookie: cookieOf(again) })).status).toBe(403); // not theirs
    // Unblocked: both again (a new sign-in, the earlier one stays ended).
    await api(`/api/v1/guardians/${g.id}/children/${a.id}`, { method: "PATCH", cookie: admin.cookie, body: { blocked: false } });
    expect((await api("/api/v1/portal/session", { cookie: cookieOf(again) })).status).toBe(401);
    expect(dto(await signIn("FAM/001", code)).siblingStudents).toHaveLength(2);
  });

  test("a mother and a father are two guardians with their own codes and their own children; nobody is guessed from a shared phone", async () => {
    const mother = await guardian("Mrs Duo", { phone: "08032220001", phoneKey: "8032220001", email: null });
    const father = await guardian("Mr Duo", { phone: "08032220002", phoneKey: "8032220002", email: null });
    const shared = await pupil(home.id, { admissionNo: "DUO/001" });
    const hers = await pupil(home.id, { admissionNo: "DUO/002" });
    await link(shared.id, home.id, mother.id);
    await link(shared.id, home.id, father.id, { isMain: false });
    await link(hers.id, home.id, mother.id);
    const motherCode = await issue(mother.id);
    const fatherCode = await issue(father.id);
    const m = await signIn("DUO/001", motherCode);
    expect((dto(m).siblingStudents as { id: string }[]).map((s) => s.id).sort()).toEqual([shared.id, hers.id].sort());
    const f = await signIn("DUO/001", fatherCode);
    expect((dto(f).siblingStudents as { id: string }[]).map((s) => s.id)).toEqual([shared.id]);
    // Each code works only for its own guardian's children: the father's code with the mother's other child is the generic failure.
    expect((await signIn("DUO/002", fatherCode)).status).toBe(401);
  });

  test("the phone or e-mail still sign a guardian in while the branch allows it (the whole phone only, either way of writing it), then not once it is switched off; the code always does", async () => {
    const { g } = await family();
    expect((await signIn("FAM/001", "08031110000")).status).toBe(200);
    expect((await signIn("FAM/001", "+234 803 111 0000")).status).toBe(200);
    expect((await signIn("FAM/001", "family@example.com")).status).toBe(200);
    expect((await signIn("FAM/001", "0000")).status).toBe(401); // the last digits are no longer a secret
    expect((await signIn("FAM/001", "1110000")).status).toBe(401);
    const code = await issue(g.id);
    await db.branch.update({ where: { id: home.id }, data: { legacyPortalSecrets: false } });
    expect((await signIn("FAM/001", "08031110000")).status).toBe(401);
    expect((await signIn("FAM/001", "family@example.com")).status).toBe(401);
    expect((await signIn("FAM/001", code)).status).toBe(200);
  });

  test("a pupil signs in with the pupil code (or the date of birth while allowed) and reaches only themselves; the code is the pupil's own", async () => {
    const { a, b } = await family();
    const admin = await asRole(Role.ADMIN);
    const made = await api(`/api/v1/students/${a.id}/access-codes`, { method: "POST", cookie: admin.cookie, body: { which: "pupil" } });
    const code = dto(made).slip.pupilCode as string;
    const res = await signIn("FAM/001", code);
    expect(res.status, res.text).toBe(200);
    expect(dto(res).actor).toBe("PUPIL");
    expect((dto(res).siblingStudents as { id: string }[]).map((s) => s.id)).toEqual([a.id]);
    expect((await signIn("FAM/002", code)).status).toBe(401); // another pupil's number
    expect((await signIn("FAM/001", "2014-03-21")).status).toBe(200); // the date of birth, while the branch allows it
    expect(b.id).not.toBe(a.id);
    const stored = await db.studentRecord.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.pupilCodeHash).toMatch(/^s1\$/);
    expect(stored.portalVersion).toBe(1);
    // A new pupil code ends the pupil's open session.
    const cookie = cookieOf(res);
    await api(`/api/v1/students/${a.id}/access-codes`, { method: "POST", cookie: admin.cookie, body: { which: "pupil" } });
    expect((await api("/api/v1/portal/session", { cookie })).status).toBe(401);
  });

  test("an old cookie from before guardians were records (no guardian) is ended, and the token sign-in is gone", async () => {
    const { a } = await family();
    const legacy = await api("/api/v1/portal/session", { method: "POST", body: { token: "anything-at-all" } });
    expect(legacy.status).toBe(400);
    expect(legacy.setCookies).toHaveLength(0);
    // A real guardian session, then its guardian archived: the next request ends it.
    const g = await db.guardian.findFirstOrThrow();
    const cookie = cookieOf(await signIn("FAM/001", "08031110000"));
    expect((await api("/api/v1/portal/session", { cookie })).status).toBe(200);
    await db.guardian.update({ where: { id: g.id }, data: { archivedAt: new Date() } });
    expect((await api("/api/v1/portal/session", { cookie })).status).toBe(401);
    expect((await api(`/api/v1/portal/students/${a.id}/overview`, { cookie })).status).toBe(401);
  });
});

test.describe("class slips", () => {
  const classOfPupils = async () => {
    const session = await db.academicSession.create({
      data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
    });
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Basic 4", sortOrder: 1 } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
    const enrol = (studentId: string) =>
      db.studentEnrollment.create({
        data: { studentId, branchId: home.id, sessionId: session.id, className: group.name, arm: "A", classArmId: arm.id },
      });
    return { group, enrol };
  };

  test("a pupil code for every pupil; ONE guardian code per guardian across the sheet (brothers and sisters share it); a guardian who already has a code keeps it; the count must match", async () => {
    const admin = await asRole(Role.ADMIN);
    const { group, enrol } = await classOfPupils();
    const g = await guardian("Mrs Sheet");
    const solo = await guardian("Mr Solo", { phone: "08037770000", phoneKey: "8037770000" });
    const sis = await pupil(home.id, { firstName: "Sis", lastName: "Sheet" });
    const bro = await pupil(home.id, { firstName: "Bro", lastName: "Sheet" });
    const one = await pupil(home.id, { firstName: "One", lastName: "Solo" });
    const bare = await pupil(home.id, { firstName: "Bare", lastName: "Nobody" });
    await link(sis.id, home.id, g.id);
    await link(bro.id, home.id, g.id);
    await link(one.id, home.id, solo.id);
    for (const p of [sis, bro, one, bare]) await enrol(p.id);
    const q = `branchId=${home.id}&classGroupId=${group.id}`;
    const count = await api(`/api/v1/students/access-codes?${q}`, { cookie: admin.cookie });
    expect(dto(count)).toMatchObject({ count: 4, tooMany: false, max: 100 });
    const mismatch = await api("/api/v1/students/access-codes", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, classGroupId: group.id, which: "both", expect: 3 },
    });
    expect(mismatch.status).toBe(409);
    expect(await db.studentRecord.count({ where: { pupilCodeHash: { not: null } } })).toBe(0); // nothing was replaced blind

    const made = await api("/api/v1/students/access-codes", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, classGroupId: group.id, which: "both", expect: 4 },
    });
    expect(made.status, made.text).toBe(200);
    expect(made.headers.get("cache-control")).toBe("no-store");
    const slips = dto(made).slips as {
      studentId: string;
      pupilCode?: string;
      guardianCode?: string;
      guardianNote?: string;
      guardianName?: string;
      family?: string[];
    }[];
    const by = Object.fromEntries(slips.map((s) => [s.studentId, s]));
    for (const s of slips) expect(s.pupilCode).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(new Set(slips.map((s) => s.pupilCode)).size).toBe(4);
    expect(by[sis.id].guardianCode).toBeDefined();
    expect(by[bro.id].guardianCode).toBeDefined();
    expect(by[bro.id].guardianCode).toBe(by[sis.id].guardianCode); // the same code on the sister's and the brother's slip
    // The one whose slip comes second says it is the same code (the sheet is in name order, so which one that is does not matter here).
    expect([by[sis.id].guardianNote, by[bro.id].guardianNote].filter((note) => /same code/i.test(note ?? ""))).toHaveLength(1);
    expect(by[sis.id].family).toEqual(["Bro Sheet"]);
    expect(by[bro.id].family).toEqual(["Sis Sheet"]);
    expect(by[one.id].guardianCode).toBeDefined();
    expect(by[one.id].guardianCode).not.toBe(by[sis.id].guardianCode);
    expect(by[bare.id].guardianCode).toBeUndefined();
    expect(by[bare.id].guardianNote).toMatch(/No guardian/);
    expect(await db.guardian.count({ where: { codeHash: { not: null } } })).toBe(2); // two guardians, two codes
    expect(await db.studentRecord.count({ where: { pupilCodeHash: { not: null } } })).toBe(4);
    expect(
      JSON.stringify(await db.auditLog.findMany({ where: { action: { in: ["GUARDIAN_CODE_ISSUED", "ACCESS_CODE_REGENERATED"] } } })),
    ).not.toMatch(/[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}/);

    // A second sheet: new pupil codes, but the guardians keep theirs (no new guardian code, a note instead).
    const hash = (await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).codeHash;
    const again = await api("/api/v1/students/access-codes", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, classGroupId: group.id, which: "both", expect: 4 },
    });
    const slips2 = dto(again).slips as { studentId: string; guardianCode?: string; guardianNote?: string }[];
    expect(slips2.find((s) => s.studentId === sis.id)!.guardianCode).toBeUndefined();
    expect(slips2.find((s) => s.studentId === sis.id)!.guardianNote).toMatch(/already have/i);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).codeHash).toBe(hash);
  });

  test("another branch's administrator is refused (403); a guardian with a child in a branch the administrator does not run gets a note, not a code", async () => {
    const admin = await asRole(Role.ADMIN);
    const away = await asRole(Role.ADMIN, [other.id]);
    const { group, enrol } = await classOfPupils();
    const g = await guardian("Mrs Across");
    const here = await pupil(home.id);
    const there = await pupil(other.id);
    await link(here.id, home.id, g.id);
    await link(there.id, other.id, g.id, { isMain: false });
    await enrol(here.id);
    const body = { branchId: home.id, classGroupId: group.id, which: "guardian", expect: 1 };
    expect((await api("/api/v1/students/access-codes", { method: "POST", cookie: away.cookie, body })).status).toBe(403);
    const made = await api("/api/v1/students/access-codes", { method: "POST", cookie: admin.cookie, body });
    expect(made.status, made.text).toBe(200);
    const slip = dto(made).slips[0];
    expect(slip.guardianCode).toBeUndefined();
    expect(slip.guardianNote).toMatch(/school office/i);
    expect((await db.guardian.findUniqueOrThrow({ where: { id: g.id } })).codeHash).toBeNull();
  });
});

test.describe("answers never carry a code's hash", () => {
  test("a teacher's student list and detail, the administrator's registration, and the pupil's portal record have no pupilCodeHash", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const p = await pupil(home.id, { admissionNo: "HASH/001", pupilCodeHash: "s1$abcdef", pupilCodeAt: new Date() });
    const list = await api(`/api/v1/students?branchId=${home.id}`, { cookie: teacher.cookie });
    expect(list.status).toBe(200);
    const detail = await api(`/api/v1/students/${p.id}`, { cookie: teacher.cookie });
    expect(detail.status).toBe(200);
    const edit = await api(`/api/v1/students/${p.id}`, { method: "PATCH", cookie: admin.cookie, body: { firstName: "Renamed" } });
    expect(edit.status, edit.text).toBe(200);
    const g = await guardian();
    await link(p.id, home.id, g.id);
    const session = await api("/api/v1/portal/session", { method: "POST", body: { admissionNo: "HASH/001", secret: "08030001111" } });
    expect(session.status, session.text).toBe(200);
    for (const res of [list, detail, edit, session]) {
      expect(res.text).not.toContain("pupilCodeHash");
      expect(res.text).not.toContain("s1$abcdef");
    }
  });
});

test.describe("day or boarding", () => {
  test("registered, changed (audited), cleared; anything else is a 400", async () => {
    const admin = await asRole(Role.ADMIN);
    const base = { branchId: home.id, lastName: "Resident", gender: "MALE" };
    const boarder = await api("/api/v1/students", {
      method: "POST",
      cookie: admin.cookie,
      body: { ...base, firstName: "Bola", residence: "BOARDING" },
    });
    expect(boarder.status, boarder.text).toBe(201);
    expect(boarder.json.data.student.residence).toBe("BOARDING");
    const unset = await api("/api/v1/students", { method: "POST", cookie: admin.cookie, body: { ...base, firstName: "Unset" } });
    expect(unset.json.data.student.residence).toBeNull(); // not set, never guessed
    expect(
      (await api("/api/v1/students", { method: "POST", cookie: admin.cookie, body: { ...base, firstName: "Weekly", residence: "WEEKLY" } }))
        .status,
    ).toBe(400);
    const id = boarder.json.data.student.id as string;
    const patch = (body: object) => api(`/api/v1/students/${id}`, { method: "PATCH", cookie: admin.cookie, body });
    expect((await patch({ residence: "DAY" })).json.data.student.residence).toBe("DAY");
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "STUDENT_UPDATED", targetId: id }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(log.afterValue)).toContain("DAY");
    expect((await patch({ residence: null })).json.data.student.residence).toBeNull();
    expect((await patch({ residence: "BOTH" })).status).toBe(400);
    expect((await patch({ firstName: "Bola2" })).json.data.student.residence).toBeNull(); // an edit that does not mention it leaves it
  });

  test("the list's filter and its export say the same: Day, Boarding, Not set; the export has the column and a bad value is a 400", async () => {
    const admin = await asRole(Role.ADMIN);
    const make = (firstName: string, residence: "DAY" | "BOARDING" | null) => pupil(home.id, { firstName, lastName: "Filter", residence });
    await make("Dayo", "DAY");
    await make("Dayana", "DAY");
    await make("Boarda", "BOARDING");
    await make("Nonea", null);
    const names = async (residence: string) => {
      const res = await api(`/api/v1/students?branchId=${home.id}&residence=${residence}`, { cookie: admin.cookie });
      expect(res.status, residence).toBe(200);
      return (dto(res).students as { firstName: string; residence: string | null }[]).map((s) => s.firstName).sort();
    };
    expect(await names("DAY")).toEqual(["Dayana", "Dayo"]);
    expect(await names("BOARDING")).toEqual(["Boarda"]);
    expect(await names("NONE")).toEqual(["Nonea"]);
    expect((await api(`/api/v1/students?branchId=${home.id}&residence=SOMETIMES`, { cookie: admin.cookie })).status).toBe(400);
    const exported = await api("/api/v1/exports", {
      method: "POST",
      cookie: admin.cookie,
      body: { kind: "pupils", branchId: home.id, scope: "shown", pupils: { q: "", show: "live", query: "&residence=BOARDING" } },
    });
    expect(exported.status, exported.text).toBe(200);
    const headers = dto(exported).headers as string[];
    expect(headers.at(-1)).toBe("Day or boarding");
    const rows = dto(exported).rows as string[][];
    expect(rows.map((r) => [r[0], r.at(-1)])).toEqual([["Boarda", "Boarding"]]);
    const all = await api("/api/v1/exports", {
      method: "POST",
      cookie: admin.cookie,
      body: { kind: "pupils", branchId: home.id, scope: "all" },
    });
    expect((dto(all).rows as string[][]).map((r) => r.at(-1)).sort()).toEqual(["", "Boarding", "Day", "Day"]);
  });

  test("the bulk import reads a Day or boarding column; blank is not set; anything else is a problem on that row and nothing is saved", async () => {
    const admin = await asRole(Role.ADMIN);
    const row = (line: number, values: Record<string, string>) => ({
      line,
      values: { firstName: `Imp${line}`, lastName: "Orted", gender: "Male", ...values },
    });
    const send = (rows: unknown[], dryRun: boolean) =>
      api("/api/v1/students/import", { method: "POST", cookie: admin.cookie, body: { branchId: home.id, dryRun, rows } });
    const bad = await send([row(2, { residence: "boarding" }), row(3, { residence: "weekly" })], false);
    expect(bad.status).toBe(422);
    expect(await db.studentRecord.count()).toBe(0);
    const saved = await send(
      [row(2, { residence: "boarding" }), row(3, { residence: "DAY" }), row(4, { residence: "" }), row(5, {})],
      false,
    );
    expect(saved.status, saved.text).toBe(201);
    const pupils = await db.studentRecord.findMany({ orderBy: { firstName: "asc" } });
    expect(pupils.map((p) => p.residence)).toEqual(["BOARDING", "DAY", null, null]);
  });

  test("the import makes guardians too: brothers and sisters with the same guardian share one record, linked as the main contact", async () => {
    const admin = await asRole(Role.ADMIN);
    const row = (line: number, values: Record<string, string>) => ({
      line,
      values: {
        firstName: `Kid${line}`,
        lastName: "Imported",
        gender: "Female",
        guardianName: "Mrs Imported",
        guardianPhone: "08036660000",
        ...values,
      },
    });
    const res = await api("/api/v1/students/import", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, rows: [row(2, {}), row(3, {}), row(4, { guardianName: "Mr Other" })] },
    });
    expect(res.status, res.text).toBe(201);
    const guardians = await db.guardian.findMany({ include: { children: true }, orderBy: { createdAt: "asc" } });
    expect(guardians.map((g) => [g.name, g.children.length])).toEqual([
      ["Mrs Imported", 2],
      ["Mr Other", 1],
    ]);
    expect(guardians.every((g) => g.children.every((c) => c.isMain))).toBe(true);
    expect((await db.studentRecord.findFirstOrThrow({ where: { firstName: "Kid2" } })).guardianName).toBe("Mrs Imported");
  });
});

test.describe("the switch for the old secrets (date of birth, guardian phone or e-mail)", () => {
  test("an administrator lists and switches only their own branches; the change is audited with before and after; a teacher and another branch's administrator are refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const list = await api("/api/v1/settings/family-secrets", { cookie: admin.cookie });
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect((dto(list).branches as { id: string; legacyPortalSecrets: boolean }[]).map((b) => [b.id, b.legacyPortalSecrets])).toEqual([
      [home.id, true],
    ]);
    expect((await api("/api/v1/settings/family-secrets", { cookie: teacher.cookie })).status).toBe(403);

    const patch = (cookie: string, branchId: string, legacyPortalSecrets: boolean) =>
      api("/api/v1/settings/family-secrets", { method: "PATCH", cookie, body: { branchId, legacyPortalSecrets } });
    expect((await patch(away.cookie, home.id, false)).status).toBe(403); // a branch named in a body that is not theirs
    expect((await patch(teacher.cookie, home.id, false)).status).toBe(403);
    expect((await db.branch.findUniqueOrThrow({ where: { id: home.id } })).legacyPortalSecrets).toBe(true);

    expect((await patch(admin.cookie, home.id, false)).status).toBe(200);
    expect((await db.branch.findUniqueOrThrow({ where: { id: home.id } })).legacyPortalSecrets).toBe(false);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "FAMILY_SECRETS_CHANGED", targetId: home.id } });
    expect([log.beforeValue, log.afterValue]).toEqual([{ legacyPortalSecrets: true }, { legacyPortalSecrets: false }]);
    expect((await patch(admin.cookie, home.id, false)).status).toBe(200); // no change: no second entry
    expect(await db.auditLog.count({ where: { action: "FAMILY_SECRETS_CHANGED" } })).toBe(1);
    expect(
      (await api("/api/v1/settings/family-secrets", { method: "PATCH", cookie: admin.cookie, body: { branchId: home.id } })).status,
    ).toBe(400);
  });
});
