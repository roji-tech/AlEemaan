import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// School-wide result templates (task 0120), over real HTTP: who may do what (the master routes are a superadmin's; Detach is the branch administrator's), what a master may hold, "Update branches" and
// "Add to branches" with a report per branch, the Customised-here rule, Detach, the school badge on a branch's own list, and the audit. The service's behaviour in depth (versioning once a scheme or
// scale is locked, traits archived and never deleted) is in tests/integration/school-templates.spec.ts.

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

const cookieOf = async (user: Awaited<ReturnType<typeof createUser>>) => cookieHeader((await loginAs(user)).token!);
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: await cookieOf(user) };
};
const superAdmin = async () => {
  // A superadmin holds at least one membership (the flag alone grants nothing); `role: ADMIN` gives both.
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: await cookieOf(user) };
};

const MASTERS = "/api/v1/school-templates";
const TEMPLATES = "/api/v1/results/templates";
type Master = {
  id: string;
  name: string;
  version: number;
  layoutCode: string | null;
  definition: {
    scheme: unknown;
    scale: { name: string; bands: { min: number; max: number; letter: string; remark: string }[]; unconfirmed: boolean } | null;
    groups: { key: string; title: string; traits: { key: string; name: string }[] }[];
  };
  branches: { branchId: string; templateId: string; state: string; version: number | null }[];
  missingBranches: { id: string }[];
};
const listMasters = async (cookie: string) =>
  (await api(MASTERS, { cookie })).json.data as { templates: Master[]; branches: { id: string }[] };
/// A branch's own Templates list seeds the four cards from the masters on first read (and makes the masters on an empty database), as the screen does.
const seedBranch = async (cookie: string, branchId: string) => api(`${TEMPLATES}?branchId=${branchId}`, { cookie });
const junior = async (cookie: string) => (await listMasters(cookie)).templates.find((t) => t.layoutCode === "JUNIOR")!;

const custom = (name: string) => ({
  name,
  description: "A card of our own",
  layoutCode: "BASIC",
  definition: {
    scheme: { name: `${name} marks`, totalMax: 100, examMax: 70, components: [{ name: "Test", maxScore: 30 }] },
    scale: {
      name: `${name} scale`,
      unconfirmed: false,
      bands: [
        { min: 0, max: 50, letter: "F", remark: "Fail" },
        { min: 50, max: 100, letter: "P", remark: "Pass" },
      ],
    },
    groups: [{ key: "conduct", title: "Conduct", showSign: false, traits: [{ key: "manners", name: "Manners" }] }],
  },
});

test.describe("who may", () => {
  test("every master route is a superadmin's: a branch administrator, a teacher and a signed-out caller are refused", async () => {
    const boss = await superAdmin();
    await seedBranch(boss.cookie, home.id);
    const j = await junior(boss.cookie);
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const routes: [string, string, unknown?][] = [
      ["GET", MASTERS],
      ["POST", MASTERS, custom("Nope")],
      ["GET", `${MASTERS}/${j.id}`],
      ["PATCH", `${MASTERS}/${j.id}`, { description: "x" }],
      ["POST", `${MASTERS}/${j.id}/sync`, { branchIds: [home.id] }],
      ["POST", `${MASTERS}/${j.id}/branches`, { branchIds: [other.id] }],
    ];
    for (const [method, path, body] of routes) {
      expect((await api(path, { method, cookie: admin.cookie, body })).status, `administrator ${method} ${path}`).toBe(403);
      expect((await api(path, { method, cookie: teacher.cookie, body })).status, `teacher ${method} ${path}`).toBe(403);
      expect((await api(path, { method, body })).status, `signed out ${method} ${path}`).toBe(401);
    }
    expect((await api(MASTERS, { cookie: boss.cookie })).status).toBe(200);
  });

  test("Detach: the administrator of that branch and a superadmin may; another branch's administrator gets a 404, a teacher a 403", async () => {
    const boss = await superAdmin();
    await seedBranch(boss.cookie, home.id);
    const row = (await junior(boss.cookie)).branches.find((b) => b.branchId === home.id)!;
    const stranger = await asRole(Role.ADMIN, other.id);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const mine = await asRole(Role.ADMIN);
    expect((await api(`${TEMPLATES}/${row.templateId}/detach`, { method: "POST", cookie: teacher.cookie })).status).toBe(403);
    expect((await api(`${TEMPLATES}/${row.templateId}/detach`, { method: "POST", cookie: stranger.cookie })).status).toBe(404);
    expect((await api(`${TEMPLATES}/no-such-template/detach`, { method: "POST", cookie: mine.cookie })).status).toBe(404);
    expect((await api(`${TEMPLATES}/${row.templateId}/detach`, { method: "POST", cookie: mine.cookie })).status).toBe(200);
    expect((await api(`${TEMPLATES}/${row.templateId}/detach`, { method: "POST", cookie: mine.cookie })).status).toBe(409); // it follows nothing now
    expect(await db.auditLog.count({ where: { action: "TEMPLATE_DETACHED", targetId: row.templateId } })).toBe(1);
    expect(await db.resultTemplate.findUniqueOrThrow({ where: { id: row.templateId } })).toMatchObject({
      schoolTemplateId: null,
      schoolTemplateVersion: null,
    });
  });
});

test.describe("the masters", () => {
  test("the four cards are masters, each followed by the branch's rows; the branch's own list says so", async () => {
    const boss = await superAdmin();
    const mine = await asRole(Role.ADMIN);
    const seeded = await seedBranch(mine.cookie, home.id);
    const rows = (seeded.json.data.templates as { name: string; school: { name: string; version: number; state: string } | null }[]).filter(
      (t) => t.school,
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((t) => t.school!.version === 1 && t.school!.state === "up-to-date")).toBe(true);
    const all = await listMasters(boss.cookie);
    expect(all.templates).toHaveLength(4);
    const j = all.templates.find((t) => t.layoutCode === "JUNIOR")!;
    expect(j.branches.map((b) => b.branchId)).toEqual([home.id]);
    expect(j.missingBranches.map((b) => b.id)).toContain(other.id);
    expect(j.definition.scale!.unconfirmed).toBe(true);
    expect((await api(`${MASTERS}/${j.id}`, { cookie: boss.cookie })).json.data.template.name).toBe(j.name);
    expect((await api(`${MASTERS}/no-such-master`, { cookie: boss.cookie })).status).toBe(404);
  });

  test("create: 201 at version 1; a bad definition is a 400, a taken name a 409, an extra key a 400; PATCH makes version 2, archive and restore keep it", async () => {
    const boss = await superAdmin();
    const made = await api(MASTERS, { method: "POST", cookie: boss.cookie, body: custom("Evening card") });
    expect(made.status, made.text).toBe(201);
    const id = made.json.data.id as string;
    const bad = custom("Bad bands");
    bad.definition.scale.bands = [{ min: 0, max: 40, letter: "F", remark: "Fail" }];
    expect((await api(MASTERS, { method: "POST", cookie: boss.cookie, body: bad })).status).toBe(400);
    expect((await api(MASTERS, { method: "POST", cookie: boss.cookie, body: custom("EVENING CARD") })).status).toBe(409);
    expect((await api(MASTERS, { method: "POST", cookie: boss.cookie, body: { ...custom("Stray"), extra: 1 } })).status).toBe(400);
    const patched = await api(`${MASTERS}/${id}`, { method: "PATCH", cookie: boss.cookie, body: { description: "Changed" } });
    expect(patched.json.data).toMatchObject({ changed: true, version: 2 });
    expect(
      (await api(`${MASTERS}/${id}`, { method: "PATCH", cookie: boss.cookie, body: { description: "Changed" } })).json.data,
    ).toMatchObject({ changed: false, version: 2 });
    expect((await api(`${MASTERS}/${id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } })).json.data).toMatchObject({
      version: 2,
    });
    expect((await listMasters(boss.cookie)).templates.map((t) => t.id)).not.toContain(id);
    expect((await api(`${MASTERS}/${id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: false } })).status).toBe(200);
    expect((await api(`${MASTERS}/no-such-master`, { method: "PATCH", cookie: boss.cookie, body: { description: "x" } })).status).toBe(404);
    expect((await api(`${MASTERS}/${id}`, { method: "PATCH", cookie: boss.cookie, body: {} })).status).toBe(400);
    expect(await db.auditLog.count({ where: { action: "SCHOOL_TEMPLATE_CREATED", targetId: id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "SCHOOL_TEMPLATE_UPDATED", targetId: id } })).toBe(1);
  });
});

test.describe("Update branches and Add to branches", () => {
  test("an update reaches the branches that follow it, reports each, and skips a customised branch unless told to replace", async () => {
    const boss = await superAdmin();
    const mine = await asRole(Role.ADMIN);
    const theirs = await asRole(Role.ADMIN, other.id);
    await seedBranch(mine.cookie, home.id);
    await seedBranch(theirs.cookie, other.id);
    const j = await junior(boss.cookie);
    const rowOther = j.branches.find((b) => b.branchId === other.id)!;
    // The other branch's administrator changes the description of its row: Customised here.
    const edit = await api(`${TEMPLATES}/${rowOther.templateId}`, {
      method: "PATCH",
      cookie: theirs.cookie,
      body: { description: "Our own words" },
    });
    expect(edit.status, edit.text).toBe(200);
    expect((await junior(boss.cookie)).branches.find((b) => b.branchId === other.id)!.state).toBe("customised");
    // The school edits the card: version 2, both behind.
    const bands = [
      { min: 0, max: 45, letter: "E", remark: "Fair" },
      { min: 45, max: 60, letter: "C", remark: "Average" },
      { min: 60, max: 75, letter: "B", remark: "Good" },
      { min: 75, max: 100, letter: "A", remark: "Excellent" },
    ];
    const definition = { ...j.definition, scale: { ...j.definition.scale!, bands } };
    expect((await api(`${MASTERS}/${j.id}`, { method: "PATCH", cookie: boss.cookie, body: { definition } })).json.data.version).toBe(2);
    expect((await junior(boss.cookie)).branches.map((b) => b.state).sort()).toEqual(["behind", "customised-behind"]);

    const first = await api(`${MASTERS}/${j.id}/sync`, {
      method: "POST",
      cookie: boss.cookie,
      body: { branchIds: [home.id, other.id, "no-such-branch"] },
    });
    expect(first.status, first.text).toBe(200);
    const statuses = Object.fromEntries(
      (first.json.data.results as { branchId: string; status: string }[]).map((r) => [r.branchId, r.status]),
    );
    expect(statuses).toEqual({ [home.id]: "ok", [other.id]: "skipped-customised", "no-such-branch": "gone" });
    // The home branch's own list now shows the new bands' scale and version 2.
    const homeRow = (await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: mine.cookie })).json.data.templates.find(
      (t: { school: { id: string } | null }) => t.school?.id === j.id,
    );
    expect(homeRow.school).toMatchObject({ version: 2, rowVersion: 2, state: "up-to-date" });
    const second = await api(`${MASTERS}/${j.id}/sync`, {
      method: "POST",
      cookie: boss.cookie,
      body: { branchIds: [other.id], replaceLocal: [other.id] },
    });
    expect(second.json.data.results[0].status).toBe("ok");
    const replaced = (await junior(boss.cookie)).branches.find((b) => b.branchId === other.id)!;
    expect(replaced).toMatchObject({ state: "up-to-date", version: 2 });
    expect(await db.auditLog.count({ where: { action: "SCHOOL_TEMPLATE_SYNCED" } })).toBe(2);
    // Nothing more to do.
    const third = await api(`${MASTERS}/${j.id}/sync`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id] } });
    expect(third.json.data.results[0].status).toBe("up-to-date");
  });

  test("a sync names 1 to 50 branches, an archived master cannot be synced, and an unknown master is a 404", async () => {
    const boss = await superAdmin();
    const mine = await asRole(Role.ADMIN);
    await seedBranch(mine.cookie, home.id);
    const j = await junior(boss.cookie);
    expect((await api(`${MASTERS}/${j.id}/sync`, { method: "POST", cookie: boss.cookie, body: { branchIds: [] } })).status).toBe(400);
    const fifty1 = Array.from({ length: 51 }, (_, i) => `b${i}`);
    expect((await api(`${MASTERS}/${j.id}/sync`, { method: "POST", cookie: boss.cookie, body: { branchIds: fifty1 } })).status).toBe(400);
    expect(
      (await api(`${MASTERS}/${j.id}/sync`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id], other: 1 } })).status,
    ).toBe(400);
    expect(
      (await api(`${MASTERS}/no-such-master/sync`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id] } })).status,
    ).toBe(404);
    await api(`${MASTERS}/${j.id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
    expect((await api(`${MASTERS}/${j.id}/sync`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id] } })).status).toBe(
      409,
    );
    expect(
      (await api(`${MASTERS}/${j.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [other.id] } })).status,
    ).toBe(409);
  });

  test("a master is added to branches: added, already, clash with a branch's own template of that name, gone", async () => {
    const boss = await superAdmin();
    const made = await api(MASTERS, { method: "POST", cookie: boss.cookie, body: custom("Evening card") });
    const id = made.json.data.id as string;
    const [, , third] = await db.branch.findMany({ orderBy: { name: "asc" } });
    await db.resultTemplate.create({ data: { branchId: other.id, name: "evening card" } }); // the branch's own, same name ignoring case
    const first = await api(`${MASTERS}/${id}/branches`, {
      method: "POST",
      cookie: boss.cookie,
      body: { branchIds: [home.id, other.id, "no-such-branch"] },
    });
    expect(first.status, first.text).toBe(200);
    expect((first.json.data.results as { status: string }[]).map((r) => r.status)).toEqual(["added", "clash", "gone"]);
    const again = await api(`${MASTERS}/${id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id, third.id] } });
    expect((again.json.data.results as { status: string }[]).map((r) => r.status)).toEqual(["already", "added"]);
    const row = await db.resultTemplate.findFirstOrThrow({ where: { branchId: home.id, schoolTemplateId: id } });
    expect(row).toMatchObject({ name: "Evening card", layoutCode: "BASIC", schoolTemplateVersion: 1 });
    expect(await db.auditLog.count({ where: { action: "SCHOOL_TEMPLATE_ADDED", targetId: row.id } })).toBe(1);
  });

  test("a branch administrator cannot reach another branch's row through the template routes (the existing 404), and a teacher cannot edit a followed row", async () => {
    const boss = await superAdmin();
    const mine = await asRole(Role.ADMIN);
    const stranger = await asRole(Role.ADMIN, other.id);
    const teacher = await asRole(Role.TEACHING_STAFF);
    await seedBranch(mine.cookie, home.id);
    const row = (await junior(boss.cookie)).branches.find((b) => b.branchId === home.id)!;
    expect(
      (await api(`${TEMPLATES}/${row.templateId}`, { method: "PATCH", cookie: stranger.cookie, body: { description: "x" } })).status,
    ).toBe(404);
    expect(
      (await api(`${TEMPLATES}/${row.templateId}`, { method: "PATCH", cookie: teacher.cookie, body: { description: "x" } })).status,
    ).toBe(403);
    expect((await junior(boss.cookie)).branches.find((b) => b.branchId === home.id)!.state).toBe("up-to-date");
  });
});
