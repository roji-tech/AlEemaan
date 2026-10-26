import "../support/env";
import { test, expect } from "@playwright/test";
import { Permission } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { UNSECTIONED_KEY } from "../../src/lib/academics/unsectioned-approval";
import { approverScope } from "../../src/lib/academics/approver-scope";

// Where results are approved, set by a superadmin (task 0039, slice 2b): sections, the section of a class, where each approver approves, and whether a Section approver also
// approves the classes in no section. Every write asks for a fresh proof, is audited with before and after, and changes nothing when it changes nothing. A branch
// administrator and a teacher are refused at the door; a section, class or person of another branch is, to this branch, one that does not exist.

const BASE = "/api/v1/settings/results-approval";
let home: { id: string };
let other: { id: string };
let superAdmin: TestUser;
let branchAdmin: TestUser;
let teacher: TestUser;
const cookie: Record<string, string> = {};

const proof = () => ({ type: "password", value: superAdmin.password });
const as = (who: "super" | "branch" | "teacher" | undefined) => (who ? cookie[who] : undefined);
const read = (branchId = home.id, who: "super" | "branch" | "teacher" | undefined = "super") => api(`${BASE}?branchId=${branchId}`, { cookie: as(who) });
const createSection = (name: string, extra: object = {}, branchId = home.id) =>
  api(`${BASE}/sections`, { method: "POST", cookie: cookie.super, body: { branchId, name, stepUp: proof(), ...extra } });
const updateSection = (id: string, patch: object) => api(`${BASE}/sections/${id}`, { method: "PATCH", cookie: cookie.super, body: { ...patch, stepUp: proof() } });
const place = (groupId: string, sectionId: string | null) =>
  api(`${BASE}/class-groups/${groupId}/section`, { method: "PUT", cookie: cookie.super, body: { sectionId, stepUp: proof() } });
const setScopes = (userId: string, scopes: object[], branchId = home.id) =>
  api(`${BASE}/approvers/${userId}/scopes`, { method: "PUT", cookie: cookie.super, body: { branchId, scopes, stepUp: proof() } });
const audit = (action: string, targetId?: string) => db.auditLog.findMany({ where: { action, ...(targetId ? { targetId } : {}) }, orderBy: { createdAt: "asc" } });
const group = (branchId: string, name: string) => db.classGroup.create({ data: { branchId, name } });
async function approver(branchId = home.id, over: { permission?: boolean; role?: Role; deactivated?: boolean } = {}) {
  const user = await createUser({ name: "An Approver", superAdmin: false });
  await db.membership.create({
    data: {
      userId: user.id,
      branchId,
      role: over.role ?? Role.TEACHING_STAFF,
      permissions: over.permission === false ? [] : [Permission.CAN_APPROVE_RESULTS],
      ...(over.deactivated ? { deactivatedAt: new Date() } : {}),
    },
  });
  return user;
}

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  superAdmin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
  branchAdmin = await createUser({ name: "Bola BranchAdmin", superAdmin: false });
  await db.membership.create({ data: { userId: branchAdmin.id, branchId: home.id, role: Role.ADMIN } });
  teacher = await createUser({ name: "Tara Teacher", superAdmin: false });
  await db.membership.create({ data: { userId: teacher.id, branchId: home.id, role: Role.TEACHING_STAFF } });
  for (const [key, who] of [
    ["super", superAdmin],
    ["branch", branchAdmin],
    ["teacher", teacher],
  ] as const) {
    const res = await loginAs(who);
    expect(res.status).toBe(200);
    cookie[key] = cookieHeader(res.token!);
  }
});
test.beforeEach(async () => {
  await db.resultApprovalScope.deleteMany();
  await db.membership.deleteMany({ where: { userId: { notIn: [superAdmin.id, branchAdmin.id, teacher.id] } } }); // the approvers an earlier test made
  await db.classGroup.updateMany({ data: { sectionId: null } });
  await db.section.deleteMany();
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.settingValue.deleteMany({ where: { key: UNSECTIONED_KEY } });
  await db.settingAudit.deleteMany({ where: { settingKey: UNSECTIONED_KEY } });
  await db.auditLog.deleteMany();
});
test.afterAll(async () => {
  await resetDatabase();
});

test.describe("who may read and write", () => {
  test("only a superadmin: nobody signed out, a branch administrator and a teacher are refused, for the read and for every write", async () => {
    for (const who of [undefined, "branch", "teacher"] as const) {
      const expected = who ? 403 : 401;
      expect((await api(`${BASE}?branchId=${home.id}`, { cookie: as(who) })).status, `read as ${who}`).toBe(expected);
      const writes = [
        api(`${BASE}/sections`, { method: "POST", cookie: as(who), body: { branchId: home.id, name: "Junior", stepUp: proof() } }),
        api(`${BASE}/sections/x`, { method: "PATCH", cookie: as(who), body: { name: "Junior", stepUp: proof() } }),
        api(`${BASE}/class-groups/x/section`, { method: "PUT", cookie: as(who), body: { sectionId: null, stepUp: proof() } }),
        api(`${BASE}/approvers/x/scopes`, { method: "PUT", cookie: as(who), body: { branchId: home.id, scopes: [], stepUp: proof() } }),
        api(BASE, { method: "PUT", cookie: as(who), body: { branchId: home.id, value: "ANY_SECTION_APPROVER", stepUp: proof() } }),
      ];
      for (const reply of await Promise.all(writes)) expect(reply.status, `write as ${who}`).toBe(expected);
    }
    expect(await db.section.count()).toBe(0);
  });

  test("the read: a branch that does not exist is 404, a malformed branch is 400, and an empty branch reads as empty with the default setting", async () => {
    expect((await read("nope")).status).toBe(404);
    expect((await api(`${BASE}?branchId=${encodeURIComponent("a b")}`, { cookie: cookie.super })).status).toBe(400);
    expect((await api(BASE, { cookie: cookie.super })).status).toBe(400);
    const res = await read();
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toMatchObject({ branchId: home.id, sections: [], unplacedClassGroups: [], approvers: [], unsectionedClassApproval: "GENERAL_OR_CLASS_ONLY" });
  });
});

test.describe("a fresh proof on every write", () => {
  test("no proof is a 400, a wrong password is a 403, and in both cases nothing is written or audited", async () => {
    const noProof = await api(`${BASE}/sections`, { method: "POST", cookie: cookie.super, body: { branchId: home.id, name: "Junior" } });
    expect(noProof.status).toBe(400);
    const wrong = await api(`${BASE}/sections`, { method: "POST", cookie: cookie.super, body: { branchId: home.id, name: "Junior", stepUp: { type: "password", value: "not-the-password-1" } } });
    expect(wrong.status).toBe(403);
    expect(wrong.json.error.code).toBe("WRONG_PASSWORD");
    expect(await db.section.count()).toBe(0);
    expect(await audit("SECTION_CREATED")).toHaveLength(0);
    // the same for the other four writes
    const g = await group(home.id, "JSS 1");
    const person = await approver();
    const bad = { type: "password", value: "not-the-password-1" };
    const replies = await Promise.all([
      api(`${BASE}/class-groups/${g.id}/section`, { method: "PUT", cookie: cookie.super, body: { sectionId: null, stepUp: bad } }),
      api(`${BASE}/approvers/${person.id}/scopes`, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, scopes: [{ kind: "GENERAL" }], stepUp: bad } }),
      api(BASE, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, value: "ANY_SECTION_APPROVER", stepUp: bad } }),
    ]);
    for (const reply of replies) expect(reply.status).toBe(403);
    expect(await db.resultApprovalScope.count()).toBe(0);
    expect(await db.settingValue.count({ where: { key: UNSECTIONED_KEY } })).toBe(0);
  });

  test("the body is strict: a field it does not name is refused, not ignored", async () => {
    const extra = await createSection("Junior", { id: "chosen", archivedAt: new Date().toISOString() });
    expect(extra.status).toBe(400);
    expect(await db.section.count()).toBe(0);
    const person = await approver();
    const strict = await api(`${BASE}/approvers/${person.id}/scopes`, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, scopes: [{ kind: "GENERAL", sectionId: "x" }], stepUp: proof() } });
    expect(strict.status).toBe(400);
  });
});

test.describe("sections", () => {
  test("a superadmin adds a section; it is listed, audited, and a live name is unique in the branch ignoring case but free in another branch", async () => {
    const res = await createSection("  Junior   Secondary ", { sortOrder: 2 });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.section).toMatchObject({ name: "Junior Secondary", sortOrder: 2 });
    const id = res.json.data.section.id as string;
    expect((await audit("SECTION_CREATED", id))[0]).toMatchObject({ actorUserId: superAdmin.id, afterValue: { branchId: home.id, name: "Junior Secondary", sortOrder: 2 } });
    expect((await read()).json.data.sections).toEqual([{ id, name: "Junior Secondary", sortOrder: 2, archived: false, classGroups: [] }]);

    const taken = await createSection("junior secondary");
    expect(taken.status).toBe(409);
    expect(taken.json.error.code).toBe("NAME_TAKEN");
    expect((await createSection("Junior Secondary", {}, other.id)).status).toBe(201);
    expect(await db.section.count()).toBe(2);
  });

  test("a name must be 1 to 80 characters of text; a branch that does not exist is 404", async () => {
    for (const name of ["", "   ", "x".repeat(81), "bad\u0000name"]) expect((await createSection(name)).status, JSON.stringify(name)).toBe(400);
    expect((await createSection("x".repeat(80))).status).toBe(201);
    expect((await createSection("Junior", {}, "nope")).status).toBe(404);
    expect((await createSection("Junior", { sortOrder: 1000 })).status).toBe(400);
    expect((await createSection("Junior", { sortOrder: 1.5 })).status).toBe(400);
  });

  test("rename, reorder, archive and restore each leave their own audit row; asking for what is already so changes nothing and writes nothing", async () => {
    const id = (await createSection("Junior")).json.data.section.id as string;
    const renamed = await updateSection(id, { name: "JSS" });
    expect(renamed.json.data).toMatchObject({ changed: true, section: { name: "JSS" } });
    expect((await updateSection(id, { name: "  JSS " })).json.data.changed).toBe(false);
    expect((await updateSection(id, { sortOrder: 5 })).json.data.section.sortOrder).toBe(5);
    expect((await updateSection(id, { archived: true })).json.data.section.archived).toBe(true);
    expect((await updateSection(id, { archived: false })).json.data.section.archived).toBe(false);
    expect((await audit("SECTION_RENAMED", id))[0]).toMatchObject({ beforeValue: { name: "Junior" }, afterValue: { name: "JSS" } });
    expect(await audit("SECTION_REORDERED", id)).toHaveLength(1);
    expect(await audit("SECTION_ARCHIVED", id)).toHaveLength(1);
    expect(await audit("SECTION_RESTORED", id)).toHaveLength(1);
    expect(await audit("SECTION_RENAMED")).toHaveLength(1); // the unchanged rename wrote nothing
  });

  test("an archived section can only be restored; restoring into a name another live section now holds is 'taken'; an unknown or malformed id is 404; an empty change is 400", async () => {
    const id = (await createSection("Junior")).json.data.section.id as string;
    expect((await updateSection(id, { archived: true })).status).toBe(200);
    for (const patch of [{ name: "Other" }, { sortOrder: 3 }, { archived: true }]) {
      const refused = await updateSection(id, patch);
      expect(refused.status, JSON.stringify(patch)).toBe(409);
      expect(refused.json.error.code).toBe("ARCHIVED");
    }
    expect((await createSection("junior")).status).toBe(201); // the archived name is free again
    const restore = await updateSection(id, { archived: false });
    expect(restore.status).toBe(409);
    expect(restore.json.error.code).toBe("NAME_TAKEN");
    expect((await updateSection("nope", { name: "X" })).status).toBe(404);
    expect((await updateSection("a b", { name: "X" })).status).toBe(404);
    expect((await api(`${BASE}/sections/${id}`, { method: "PATCH", cookie: cookie.super, body: { stepUp: proof() } })).status).toBe(400);
  });
});

test.describe("the section of a class", () => {
  test("place, move and take out; each change is audited, the same again is not, and the read shows where every class is", async () => {
    const g = await group(home.id, "JSS 1");
    const junior = (await createSection("Junior")).json.data.section.id as string;
    const senior = (await createSection("Senior")).json.data.section.id as string;
    expect((await read()).json.data.unplacedClassGroups).toEqual([{ id: g.id, name: "JSS 1", sectionId: null }]);
    expect((await place(g.id, junior)).json.data).toMatchObject({ changed: true, classGroup: { id: g.id, sectionId: junior } });
    expect((await place(g.id, junior)).json.data.changed).toBe(false);
    expect((await place(g.id, senior)).json.data.changed).toBe(true); // moved
    const shown = (await read()).json.data;
    expect(shown.sections.find((s: { id: string }) => s.id === senior).classGroups).toEqual([{ id: g.id, name: "JSS 1", sectionId: senior }]);
    expect(shown.unplacedClassGroups).toEqual([]);
    expect((await place(g.id, null)).json.data.classGroup.sectionId).toBeNull();
    const trail = await audit("CLASS_GROUP_SECTION_CHANGED", g.id);
    expect(trail.map((row) => [row.beforeValue, row.afterValue])).toEqual([
      [{ sectionId: null }, { sectionId: junior }],
      [{ sectionId: junior }, { sectionId: senior }],
      [{ sectionId: senior }, { sectionId: null }],
    ]);
  });

  test("a section of another branch is 'not found', an archived section or class is 409, and an unknown or malformed class is 404", async () => {
    const g = await group(home.id, "JSS 1");
    const foreign = (await createSection("Elsewhere", {}, other.id)).json.data.section.id as string;
    expect((await place(g.id, foreign)).status).toBe(404);
    const junior = (await createSection("Junior")).json.data.section.id as string;
    await updateSection(junior, { archived: true });
    const archivedTarget = await place(g.id, junior);
    expect(archivedTarget.status).toBe(409);
    expect(archivedTarget.json.error.code).toBe("ARCHIVED");
    await db.classGroup.update({ where: { id: g.id }, data: { archivedAt: new Date() } });
    const live = (await createSection("Live")).json.data.section.id as string;
    expect((await place(g.id, live)).status).toBe(409);
    expect((await place("nope", live)).status).toBe(404);
    expect((await place("a b", live)).status).toBe(404);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: g.id } })).sectionId).toBeNull();
  });
});

test.describe("where one approver approves", () => {
  test("a set of sections and classes replaces the last one, in a fixed order, and is audited with before and after", async () => {
    const person = await approver();
    const g1 = await group(home.id, "JSS 1");
    const g2 = await group(home.id, "SSS 1");
    const junior = (await createSection("Junior")).json.data.section.id as string;
    const res = await setScopes(person.id, [{ kind: "CLASS", classGroupId: g2.id }, { kind: "SECTION", sectionId: junior }, { kind: "SECTION", sectionId: junior }, { kind: "CLASS", classGroupId: g1.id }]);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.changed).toBe(true);
    expect(res.json.data.scopes.map((s: { kind: string }) => s.kind)).toEqual(["SECTION", "CLASS", "CLASS"]); // a repeat collapses; sections before classes
    const rows = await db.resultApprovalScope.findMany({ where: { userId: person.id } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.createdById === superAdmin.id && r.branchId === home.id)).toBe(true);
    expect((await audit("RESULT_APPROVAL_SCOPE_CHANGED", person.id))[0]).toMatchObject({ actorUserId: superAdmin.id, beforeValue: { branchId: home.id, scopes: [] } });

    const listed = (await read()).json.data.approvers;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ userId: person.id, name: "An Approver", role: "TEACHING_STAFF" });
    expect(listed[0].scopes.map((s: { kind: string; sectionName: string | null; classGroupName: string | null }) => [s.kind, s.sectionName, s.classGroupName])).toEqual([
      ["SECTION", "Junior", null],
      ["CLASS", null, "JSS 1"],
      ["CLASS", null, "SSS 1"],
    ]);

    const general = await setScopes(person.id, [{ kind: "GENERAL" }]);
    expect(general.json.data.scopes).toEqual([{ kind: "GENERAL" }]);
    expect((await db.resultApprovalScope.findMany({ where: { userId: person.id } })).map((r) => r.kind)).toEqual(["GENERAL"]);
    const emptied = await setScopes(person.id, []);
    expect(emptied.json.data).toMatchObject({ changed: true, scopes: [] });
    expect(await db.resultApprovalScope.count({ where: { userId: person.id } })).toBe(0);
    expect((await read()).json.data.approvers[0].scopes).toEqual([]); // listed, approving nothing
  });

  test("the same set again changes nothing and writes no audit row; General cannot be combined with anything", async () => {
    const person = await approver();
    const junior = (await createSection("Junior")).json.data.section.id as string;
    expect((await setScopes(person.id, [{ kind: "SECTION", sectionId: junior }])).json.data.changed).toBe(true);
    expect((await setScopes(person.id, [{ kind: "SECTION", sectionId: junior }])).json.data.changed).toBe(false);
    expect(await audit("RESULT_APPROVAL_SCOPE_CHANGED", person.id)).toHaveLength(1);
    const mixed = await setScopes(person.id, [{ kind: "GENERAL" }, { kind: "SECTION", sectionId: junior }]);
    expect(mixed.status).toBe(400);
    expect((await db.resultApprovalScope.findMany({ where: { userId: person.id } })).map((r) => r.kind)).toEqual(["SECTION"]);
    expect((await setScopes(person.id, [{ kind: "GENERAL" }, { kind: "GENERAL" }])).json.data.scopes).toEqual([{ kind: "GENERAL" }]);
  });

  test("who can be given a scope: an active staff member of the branch who holds the permission; nobody else, and nothing else changes when it is refused", async () => {
    const withoutPermission = await approver(home.id, { permission: false });
    const refused = await setScopes(withoutPermission.id, [{ kind: "GENERAL" }]);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NOT_AN_APPROVER");
    expect((await setScopes((await approver(home.id, { deactivated: true })).id, [{ kind: "GENERAL" }])).status).toBe(404);
    expect((await setScopes((await approver(home.id, { role: Role.STUDENT })).id, [{ kind: "GENERAL" }])).status).toBe(404); // a pupil cannot approve results
    expect((await setScopes((await approver(other.id)).id, [{ kind: "GENERAL" }])).status).toBe(404); // a member of another branch
    expect((await setScopes("nope", [{ kind: "GENERAL" }])).status).toBe(404);
    expect((await setScopes("a b", [{ kind: "GENERAL" }])).status).toBe(404);
    expect((await setScopes((await approver()).id, [{ kind: "GENERAL" }], "nope")).status).toBe(404);
    expect(await db.resultApprovalScope.count()).toBe(0);
  });

  test("a section or class of another branch, an archived one and one that does not exist are refused, and the person's present scopes are kept", async () => {
    const person = await approver();
    const junior = (await createSection("Junior")).json.data.section.id as string;
    expect((await setScopes(person.id, [{ kind: "SECTION", sectionId: junior }])).status).toBe(200);

    const foreignSection = (await createSection("Elsewhere", {}, other.id)).json.data.section.id as string;
    const foreignClass = await group(other.id, "Their class");
    const archived = (await createSection("Old")).json.data.section.id as string;
    await updateSection(archived, { archived: true });
    const archivedClass = await group(home.id, "Old class");
    await db.classGroup.update({ where: { id: archivedClass.id }, data: { archivedAt: new Date() } });

    for (const [what, entry, status] of [
      ["a section of another branch", { kind: "SECTION", sectionId: foreignSection }, 404],
      ["a class of another branch", { kind: "CLASS", classGroupId: foreignClass.id }, 404],
      ["an unknown section", { kind: "SECTION", sectionId: "nope" }, 404],
      ["an unknown class", { kind: "CLASS", classGroupId: "nope" }, 404],
      ["an archived section", { kind: "SECTION", sectionId: archived }, 409],
      ["an archived class", { kind: "CLASS", classGroupId: archivedClass.id }, 409],
    ] as const) {
      const res = await setScopes(person.id, [entry]);
      expect(res.status, what).toBe(status);
    }
    expect((await db.resultApprovalScope.findMany({ where: { userId: person.id } })).map((r) => [r.kind, r.sectionId])).toEqual([["SECTION", junior]]);
    expect((await setScopes(person.id, Array.from({ length: 101 }, (_, i) => ({ kind: "SECTION", sectionId: `s${i}` })))).status).toBe(400);
  });

  test("the scope given here is the scope the results rules read: an approver given a section approves its classes and nothing else", async () => {
    const person = await approver();
    const junior = (await createSection("Junior")).json.data.section.id as string;
    const inside = await group(home.id, "JSS 1");
    const outside = await group(home.id, "SSS 1");
    expect((await place(inside.id, junior)).status).toBe(200);
    expect((await setScopes(person.id, [{ kind: "SECTION", sectionId: junior }])).status).toBe(200);
    const arm = (groupId: string, name: string) => db.classArm.create({ data: { branchId: home.id, classGroupId: groupId, name } });
    const [armIn, armOut] = [await arm(inside.id, "A"), await arm(outside.id, "A")];
    const scope = await approverScope(home.id, person.id);
    expect(scope).toMatchObject({ approver: true, general: false });
    expect([...scope.armIds]).toEqual([armIn.id]);
    expect(scope.armIds.has(armOut.id)).toBe(false);
  });
});

test.describe("classes that belong to no section", () => {
  test("a superadmin chooses per branch; turning on the wider value is audited as widening, and the same value again writes nothing", async () => {
    const on = await api(BASE, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, value: "ANY_SECTION_APPROVER", stepUp: proof() } });
    expect(on.status, on.text).toBe(200);
    expect(on.json.data).toMatchObject({ branchId: home.id, unsectionedClassApproval: "ANY_SECTION_APPROVER", changed: true, widening: true });
    expect((await read()).json.data.unsectionedClassApproval).toBe("ANY_SECTION_APPROVER");
    expect((await read(other.id)).json.data.unsectionedClassApproval).toBe("GENERAL_OR_CLASS_ONLY"); // another branch is untouched

    const again = await api(BASE, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, value: "ANY_SECTION_APPROVER", stepUp: proof() } });
    expect(again.json.data).toMatchObject({ changed: false, widening: false });
    const off = await api(BASE, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, value: "GENERAL_OR_CLASS_ONLY", stepUp: proof() } });
    expect(off.json.data).toMatchObject({ changed: true, widening: false });
    const trail = await db.settingAudit.findMany({ where: { settingKey: UNSECTIONED_KEY }, orderBy: { createdAt: "asc" } });
    expect(trail.map((row) => [row.action, row.actorUserId])).toEqual([
      ["CHANGED_WIDENING", superAdmin.id],
      ["CHANGED", superAdmin.id],
    ]);
  });

  test("a value that is not one of the two, a branch that does not exist and a missing branch are refused", async () => {
    for (const value of ["any_section_approver", "", "EVERYONE", true, null, 1]) {
      const res = await api(BASE, { method: "PUT", cookie: cookie.super, body: { branchId: home.id, value, stepUp: proof() } });
      expect(res.status, JSON.stringify(value)).toBe(400);
    }
    expect((await api(BASE, { method: "PUT", cookie: cookie.super, body: { branchId: "nope", value: "ANY_SECTION_APPROVER", stepUp: proof() } })).status).toBe(404);
    expect((await api(BASE, { method: "PUT", cookie: cookie.super, body: { value: "ANY_SECTION_APPROVER", stepUp: proof() } })).status).toBe(400);
    expect(await db.settingValue.count({ where: { key: UNSECTIONED_KEY } })).toBe(0);
  });
});
