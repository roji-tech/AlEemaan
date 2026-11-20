import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The shared subject catalogue over real HTTP (task 0119): the school keeps its subjects once; each branch has its OWN subject row linked to an entry. Only a superadmin keeps the catalogue
// (create, rename, tags, archive, add to branches, import, the list of every subject with the branches offering it); the administrator of a branch takes subjects from it into THEIR branch.
let home: { id: string; name: string };
let other: { id: string; name: string };
let third: { id: string; name: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  third = await db.branch.findFirstOrThrow({ where: { id: { notIn: [home.id, other.id] } }, orderBy: { name: "asc" } });
});
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const superAdmin = async () => {
  const user = await createUser({ superAdmin: true });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const CATALOG = "/api/v1/subject-catalog";
const add = (cookie: string, body: Record<string, unknown>) => api(CATALOG, { method: "POST", cookie, body });
const take = (cookie: string, branchId: string, catalogIds: string[]) =>
  api("/api/v1/academics/subjects/from-catalog", { method: "POST", cookie, body: { branchId, catalogIds } });

test("who may keep the catalogue: signed out 401; a teacher and a branch administrator 403; a superadmin yes", async () => {
  const boss = await superAdmin();
  const entry = (await add(boss.cookie, { name: "English Language" })).json.data.entry;
  const calls: [string, string, Record<string, unknown> | undefined][] = [
    ["GET", CATALOG, undefined],
    ["POST", CATALOG, { name: "Maths" }],
    ["PATCH", `${CATALOG}/${entry.id}`, { name: "English" }],
    ["POST", `${CATALOG}/${entry.id}/branches`, { branchIds: [home.id] }],
    ["POST", `${CATALOG}/import`, { dryRun: true, rows: [{ line: 2, values: { name: "Art", code: "", tags: "" } }] }],
  ];
  for (const [method, url, body] of calls) {
    expect((await api(url, { method, body })).status, `${method} ${url} signed out`).toBe(401);
    for (const who of [await asRole(Role.TEACHING_STAFF), await asRole(Role.ADMIN)])
      expect((await api(url, { method, cookie: who.cookie, body })).status, `${method} ${url}`).toBe(403);
  }
  expect((await api(CATALOG, { cookie: boss.cookie })).status).toBe(200);
});

test("create: name, code and tags are cleaned; a taken name (any capitals) or code is 409; an archived name is free; the body is strict; audited", async () => {
  const boss = await superAdmin();
  const made = await add(boss.cookie, { name: "English Language", code: "eng", tags: ["Core", " core ", "Pre-School"] });
  expect(made.status, made.text).toBe(201);
  expect(made.json.data.entry).toMatchObject({ name: "English Language", code: "ENG", tags: ["core", "pre-school"] });
  expect((await add(boss.cookie, { name: "english language" })).status).toBe(409);
  expect((await add(boss.cookie, { name: "Another", code: "ENG" })).status).toBe(409);
  expect((await add(boss.cookie, { name: "Maths", extra: 1 })).status).toBe(400);
  expect((await add(boss.cookie, { name: "" })).status).toBe(400);
  expect((await add(boss.cookie, { name: "x".repeat(61) })).status).toBe(400);
  for (const tags of [["bad_tag"], ["<b>"], ["x".repeat(31)], Array.from({ length: 11 }, (_, i) => `t${i}`)])
    expect((await add(boss.cookie, { name: "Tagged", tags })).status, JSON.stringify(tags)).toBe(400);
  await api(`${CATALOG}/${made.json.data.entry.id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
  expect((await add(boss.cookie, { name: "ENGLISH LANGUAGE", code: "ENG" })).status).toBe(201);
  const audit = await db.auditLog.findFirst({ where: { action: "SUBJECT_CATALOG_CREATED", targetId: made.json.data.entry.id } });
  expect(audit?.actorUserId).toBe(boss.user.id);
  expect(audit?.afterValue).toMatchObject({ name: "English Language", tags: ["core", "pre-school"] });
});

test("the database refuses what the application would: more than 10 tags, a second live entry with the same name", async () => {
  await db.subjectCatalog.create({ data: { name: "Maths" } });
  await expect(db.subjectCatalog.create({ data: { name: "MATHS" } })).rejects.toThrow();
  await expect(db.subjectCatalog.create({ data: { name: "Tags", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) } })).rejects.toThrow();
});

test("list: every entry with the branches offering it (and how many classes there), search by name or code, a tag, archived ones apart", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language", code: "ENG", tags: ["core", "basic"] })).json.data.entry;
  const arb = (await add(boss.cookie, { name: "Arabic", code: "ARB", tags: ["arabic"] })).json.data.entry;
  await api(`${CATALOG}/${eng.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id, other.id] } });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "Primary 1" } });
  const homeSubject = await db.subject.findFirstOrThrow({ where: { branchId: home.id, catalogId: eng.id } });
  await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: group.id, subjectId: homeSubject.id } });
  const all = await api(CATALOG, { cookie: boss.cookie });
  const entries = all.json.data.entries as { name: string; liveBranches: number; branches: { branchName: string; classes: number }[] }[];
  expect(entries.map((e) => e.name)).toEqual(["Arabic", "English Language"]);
  const english = entries.find((e) => e.name === "English Language")!;
  expect(english.liveBranches).toBe(2);
  expect(english.branches.map((b) => [b.branchName, b.classes]).sort()).toEqual(
    [
      [home.name, 1],
      [other.name, 0],
    ].sort(),
  );
  expect(entries.find((e) => e.name === "Arabic")!.branches).toEqual([]);
  expect((await api(`${CATALOG}?q=eng`, { cookie: boss.cookie })).json.data.entries).toHaveLength(1);
  expect((await api(`${CATALOG}?q=ARB`, { cookie: boss.cookie })).json.data.entries).toHaveLength(1);
  expect((await api(`${CATALOG}?tag=Basic`, { cookie: boss.cookie })).json.data.entries.map((e: { name: string }) => e.name)).toEqual([
    "English Language",
  ]);
  await api(`${CATALOG}/${arb.id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
  expect((await api(CATALOG, { cookie: boss.cookie })).json.data.entries).toHaveLength(1);
  expect((await api(`${CATALOG}?archived=true`, { cookie: boss.cookie })).json.data.entries.map((e: { name: string }) => e.name)).toEqual([
    "Arabic",
  ]);
  expect((await api(`${CATALOG}?tag=bad_tag`, { cookie: boss.cookie })).status).toBe(400);
});

test("add to branches: each branch is its own result; a same-name subject is linked not duplicated; another entry's name is a clash; unknown branch is gone", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language", code: "ENG" })).json.data.entry;
  // the home branch already has its own "english language" (not linked), the other has the name linked to ANOTHER entry
  const mine = await db.subject.create({ data: { branchId: home.id, name: "english language" } });
  const fourth = await db.branch.findFirstOrThrow({ where: { id: { notIn: [home.id, other.id, third.id] } }, orderBy: { name: "asc" } });
  const decoy = await db.subjectCatalog.create({ data: { name: "English decoy" } });
  await db.subject.create({ data: { branchId: other.id, name: "English Language", catalogId: decoy.id } });
  // the fourth branch already uses the code
  await db.subject.create({ data: { branchId: fourth.id, name: "Phonics", code: "ENG" } });
  const res = await api(`${CATALOG}/${eng.id}/branches`, {
    method: "POST",
    cookie: boss.cookie,
    body: { branchIds: [home.id, other.id, third.id, fourth.id, "no-such-branch"] },
  });
  expect(res.status, res.text).toBe(200);
  const by = Object.fromEntries(res.json.data.results.map((r: { branchId: string; result: string }) => [r.branchId, r.result]));
  expect(by).toEqual({ [home.id]: "linked", [other.id]: "clash", [third.id]: "added", [fourth.id]: "added", "no-such-branch": "gone" });
  expect((await db.subject.findUniqueOrThrow({ where: { id: mine.id } })).catalogId).toBe(eng.id);
  expect(await db.subject.count({ where: { branchId: home.id, name: { equals: "English Language", mode: "insensitive" } } })).toBe(1);
  expect(await db.subject.findFirstOrThrow({ where: { branchId: third.id, catalogId: eng.id } })).toMatchObject({
    name: "English Language",
    code: "ENG",
  });
  expect((await db.subject.findFirstOrThrow({ where: { branchId: fourth.id, catalogId: eng.id } })).code).toBeNull(); // the branch's own "ENG" is left alone
  // again: nothing new
  const again = await api(`${CATALOG}/${eng.id}/branches`, {
    method: "POST",
    cookie: boss.cookie,
    body: { branchIds: [home.id, third.id] },
  });
  expect(again.json.data.results.map((r: { result: string }) => r.result)).toEqual(["already", "already"]);
  expect(await db.auditLog.count({ where: { action: "SUBJECT_ADDED_FROM_CATALOG", actorUserId: boss.user.id } })).toBe(3);
  // unknown entry 404; archived entry 409; bounds
  expect((await api(`${CATALOG}/nope/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id] } })).status).toBe(404);
  await api(`${CATALOG}/${eng.id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
  expect(
    (await api(`${CATALOG}/${eng.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [other.id] } })).status,
  ).toBe(409);
  expect((await api(`${CATALOG}/${eng.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [] } })).status).toBe(400);
  expect(
    (
      await api(`${CATALOG}/${eng.id}/branches`, {
        method: "POST",
        cookie: boss.cookie,
        body: { branchIds: Array.from({ length: 51 }, (_, i) => `b${i}`) },
      })
    ).status,
  ).toBe(400);
});

test("a branch administrator takes subjects into THEIR branch: 201 with a result each; another branch in the body 403; a teacher 403; unknown or archived is gone", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language", tags: ["core"] })).json.data.entry;
  const old = (await add(boss.cookie, { name: "Old Subject" })).json.data.entry;
  await api(`${CATALOG}/${old.id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
  const admin = await asRole(Role.ADMIN);
  expect((await take("", home.id, [eng.id])).status).toBe(401);
  expect((await take((await asRole(Role.TEACHING_STAFF)).cookie, home.id, [eng.id])).status).toBe(403);
  expect((await take(admin.cookie, other.id, [eng.id])).status).toBe(403); // a branch that is not theirs, named in the body
  expect(await db.subject.count({ where: { branchId: other.id } })).toBe(0);
  const res = await take(admin.cookie, home.id, [eng.id, old.id, "no-such-entry", eng.id]);
  expect(res.status, res.text).toBe(201);
  expect(res.json.data.results.map((r: { catalogId: string; result: string }) => [r.catalogId, r.result])).toEqual([
    [eng.id, "added"],
    [old.id, "gone"],
    ["no-such-entry", "gone"],
  ]);
  expect(res.json.data.results[1].name).toBeNull(); // nothing is said about an archived or unknown entry
  expect(await db.subject.findFirstOrThrow({ where: { branchId: home.id, catalogId: eng.id } })).toMatchObject({
    name: "English Language",
  });
  expect((await take(admin.cookie, home.id, [eng.id])).json.data.results[0].result).toBe("already");
  expect((await take(admin.cookie, home.id, [])).status).toBe(400);
  expect(
    (
      await take(
        admin.cookie,
        home.id,
        Array.from({ length: 51 }, (_, i) => `c${i}`),
      )
    ).status,
  ).toBe(400);
  // a superadmin may do it for any branch
  expect((await take(boss.cookie, other.id, [eng.id])).json.data.results[0].result).toBe("added");
});

test("available: the live entries this branch lacks, filtered by tag, for that branch's administrator only; nothing about other branches", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language", tags: ["core"] })).json.data.entry;
  await add(boss.cookie, { name: "Arabic", tags: ["arabic"] });
  const gone = (await add(boss.cookie, { name: "Retired" })).json.data.entry;
  await api(`${CATALOG}/${gone.id}`, { method: "PATCH", cookie: boss.cookie, body: { archived: true } });
  await api(`${CATALOG}/${eng.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [other.id] } });
  await db.subject.create({ data: { branchId: home.id, name: "arabic" } }); // the same name, not linked
  const admin = await asRole(Role.ADMIN);
  const res = await api(`${CATALOG}/available?branchId=${home.id}`, { cookie: admin.cookie });
  expect(res.status, res.text).toBe(200);
  expect(res.json.data.entries.map((e: { name: string; linksExisting: boolean }) => [e.name, e.linksExisting])).toEqual([
    ["Arabic", true],
    ["English Language", false],
  ]);
  expect(res.text).not.toContain(other.name); // no other branch's name
  expect((await api(`${CATALOG}/available?branchId=${home.id}&tag=core`, { cookie: admin.cookie })).json.data.entries).toHaveLength(1);
  expect((await api(`${CATALOG}/available?branchId=${other.id}`, { cookie: admin.cookie })).status).toBe(404); // not theirs: the same answer as an unknown branch
  expect((await api(`${CATALOG}/available?branchId=${home.id}`, { cookie: (await asRole(Role.TEACHING_STAFF)).cookie })).status).toBe(403);
});

test("rename: only the entry unless asked; in every branch all or none (409 names the branches); archive and restore leave the branches' subjects working", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language" })).json.data.entry;
  await api(`${CATALOG}/${eng.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id, other.id] } });
  const patch = (body: Record<string, unknown>) => api(`${CATALOG}/${eng.id}`, { method: "PATCH", cookie: boss.cookie, body });
  expect((await patch({ renameInBranches: true })).status).toBe(400); // needs a name
  expect((await patch({})).status).toBe(400);
  expect((await patch({ name: "English" })).status).toBe(200);
  expect(await db.subject.count({ where: { catalogId: eng.id, name: "English Language" } })).toBe(2); // the branches did not follow
  // a branch already has ANOTHER live subject called "Literacy": renaming everywhere is refused whole
  await db.subject.create({ data: { branchId: other.id, name: "literacy" } });
  const clash = await patch({ name: "Literacy", renameInBranches: true });
  expect(clash.status).toBe(409);
  expect(clash.json.error.message).toContain(other.name);
  expect(clash.json.error.message).not.toContain(home.name);
  expect((await db.subjectCatalog.findUniqueOrThrow({ where: { id: eng.id } })).name).toBe("English");
  expect(await db.subject.count({ where: { catalogId: eng.id, name: "English Language" } })).toBe(2);
  const ok = await patch({ name: "English Studies", renameInBranches: true });
  expect(ok.status, ok.text).toBe(200);
  expect(ok.json.data.entry.renamedInBranches).toBe(2);
  expect(await db.subject.count({ where: { catalogId: eng.id, name: "English Studies" } })).toBe(2);
  expect(await db.auditLog.count({ where: { action: "SUBJECT_CATALOG_RENAMED", targetId: eng.id } })).toBeGreaterThanOrEqual(2);
  // the entry's code is its own: a taken code is 409
  await add(boss.cookie, { name: "Maths", code: "MTH" });
  expect((await patch({ code: "mth" })).status).toBe(409);
  // archive: hidden from "available", the branches keep their subjects; restore brings it back
  expect((await patch({ archived: true })).status).toBe(200);
  expect(await db.subject.count({ where: { catalogId: eng.id, archivedAt: null } })).toBe(2);
  const admin = await asRole(Role.ADMIN, third.id);
  expect(
    (await api(`${CATALOG}/available?branchId=${third.id}`, { cookie: admin.cookie })).json.data.entries.map(
      (e: { name: string }) => e.name,
    ),
  ).toEqual(["Maths"]);
  expect((await patch({ archived: false })).status).toBe(200);
  expect(
    await db.auditLog.count({ where: { action: { in: ["SUBJECT_CATALOG_ARCHIVED", "SUBJECT_CATALOG_RESTORED"] }, targetId: eng.id } }),
  ).toBe(2);
  expect((await api(`${CATALOG}/nope`, { method: "PATCH", cookie: boss.cookie, body: { name: "X" } })).status).toBe(404);
});

test("tags: a superadmin edits them; a branch subject shows its entry's tags and can be filtered by tag; an unlinked subject has none; they change no access", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language", tags: ["core"] })).json.data.entry;
  await add(boss.cookie, { name: "Phonics" });
  await api(`${CATALOG}/${eng.id}/branches`, { method: "POST", cookie: boss.cookie, body: { branchIds: [home.id] } });
  await db.subject.create({ data: { branchId: home.id, name: "Handwriting" } });
  const admin = await asRole(Role.ADMIN);
  const teacher = await asRole(Role.TEACHING_STAFF);
  expect((await api(`${CATALOG}/${eng.id}`, { method: "PATCH", cookie: admin.cookie, body: { tags: ["x"] } })).status).toBe(403);
  const list = await api(`/api/v1/academics/subjects?branchId=${home.id}`, { cookie: admin.cookie });
  expect(list.json.data.subjects.map((s: { name: string; tags: string[] }) => [s.name, s.tags])).toEqual([
    ["English Language", ["core"]],
    ["Handwriting", []],
  ]);
  expect(
    (await api(`/api/v1/academics/subjects?branchId=${home.id}&tag=Core`, { cookie: teacher.cookie })).json.data.subjects,
  ).toHaveLength(1);
  expect(
    (await api(`/api/v1/academics/subjects?branchId=${home.id}&tag=nothing`, { cookie: admin.cookie })).json.data.subjects,
  ).toHaveLength(0);
  const retag = await api(`${CATALOG}/${eng.id}`, {
    method: "PATCH",
    cookie: boss.cookie,
    body: { tags: ["Basic", "basic", "Pre school"] },
  });
  expect(retag.json.data.entry.tags).toEqual(["basic", "pre school"]);
  expect((await api(`${CATALOG}/${eng.id}`, { method: "PATCH", cookie: boss.cookie, body: { tags: ["bad_tag"] } })).status).toBe(400);
  expect((await api(`${CATALOG}/${eng.id}`, { method: "PATCH", cookie: boss.cookie, body: { tags: [] } })).json.data.entry.tags).toEqual(
    [],
  );
});

test("a subject made the usual way links to the live entry of the same name; nothing is ever created in the catalogue from a branch", async () => {
  const boss = await superAdmin();
  const eng = (await add(boss.cookie, { name: "English Language" })).json.data.entry;
  const admin = await asRole(Role.ADMIN);
  const made = await api("/api/v1/academics/subjects", {
    method: "POST",
    cookie: admin.cookie,
    body: { branchId: home.id, name: "english language" },
  });
  expect(made.status, made.text).toBe(201);
  expect((await db.subject.findUniqueOrThrow({ where: { id: made.json.data.subject.id } })).catalogId).toBe(eng.id);
  const plain = await api("/api/v1/academics/subjects", {
    method: "POST",
    cookie: admin.cookie,
    body: { branchId: home.id, name: "Brand New" },
  });
  expect((await db.subject.findUniqueOrThrow({ where: { id: plain.json.data.subject.id } })).catalogId).toBeNull();
  expect(await db.subjectCatalog.count()).toBe(1);
  // the bulk import of a branch links the same way
  const bulk = await api("/api/v1/academics/subjects/import", {
    method: "POST",
    cookie: (await asRole(Role.ADMIN, other.id)).cookie,
    body: { branchId: other.id, dryRun: false, rows: [{ line: 2, values: { name: "English Language", code: "" } }] },
  });
  expect(bulk.status, bulk.text).toBe(201);
  expect((await db.subject.findFirstOrThrow({ where: { branchId: other.id, name: "English Language" } })).catalogId).toBe(eng.id);
});

test("import into the catalogue: superadmin only; a dry run writes nothing; names, codes and tags are checked; all or none; one audit entry each and one for the file", async () => {
  const boss = await superAdmin();
  await add(boss.cookie, { name: "Mathematics", code: "MTH" });
  const row = (line: number, values: Record<string, string>) => ({
    line,
    values: { name: `Subject ${line}`, code: "", tags: "", ...values },
  });
  const run = (dryRun: boolean, rows: unknown[]) =>
    api(`${CATALOG}/import`, { method: "POST", cookie: boss.cookie, body: { dryRun, rows } });
  const dry = await run(true, [
    row(2, { name: "English Language", code: "eng", tags: "Core; Basic" }),
    row(3, { name: "MATHEMATICS" }),
    row(4, { name: "Maths", code: "MTH" }),
    row(5, { name: "Phonics", tags: "bad_tag" }),
    row(6, { name: "Rhymes", tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(";") }),
  ]);
  expect(dry.status).toBe(200);
  expect(dry.json.data.verdicts.map((v: { line: number; status: string }) => [v.line, v.status])).toEqual([
    [2, "ready"],
    [3, "error"],
    [4, "error"],
    [5, "error"],
    [6, "error"],
  ]);
  expect(await db.subjectCatalog.count()).toBe(1);
  const bad = await run(false, [row(2, { name: "Art" }), row(3, { name: "Mathematics" })]);
  expect([bad.status, bad.json.error.code]).toEqual([422, "BULK_PROBLEMS"]);
  expect(await db.subjectCatalog.count()).toBe(1); // nothing of the good row either
  const saved = await run(false, [row(2, { name: "English Language", code: "eng", tags: "Core; Basic" }), row(3, { name: "Art" })]);
  expect(saved.status, saved.text).toBe(201);
  expect(saved.json.data.saved).toBe(2);
  const eng = await db.subjectCatalog.findFirstOrThrow({ where: { name: "English Language" } });
  expect([eng.code, eng.tags]).toEqual(["ENG", ["core", "basic"]]);
  expect(await db.auditLog.count({ where: { action: "SUBJECT_CATALOG_CREATED", actorUserId: boss.user.id } })).toBe(3); // Mathematics, then the two
  expect(await db.auditLog.count({ where: { action: "SUBJECT_CATALOG_BULK_IMPORTED", actorUserId: boss.user.id } })).toBe(1);
  expect(
    (
      await api(`${CATALOG}/import`, {
        method: "POST",
        cookie: (await asRole(Role.ADMIN)).cookie,
        body: { dryRun: true, rows: [row(2, {})] },
      })
    ).status,
  ).toBe(403);
});
