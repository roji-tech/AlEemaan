import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueEmail, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Programs, slice P1 (task 0043, design note section 8): who may see and change a program, the rules of the structure, the lifecycle, the history and the switch. Real HTTP
// against a production build, real database. The people: a super admin, an administrator of Secondary (English) (A), an administrator of Primary (English) (B), and teachers.

const PROGRAMS = "/api/v1/programs";
const SWITCH = "/api/v1/settings/programs";

type Person = TestUser & { cookie: string };
let A: { id: string; name: string };
let B: { id: string; name: string };
let C: { id: string; name: string };
let sa: Person;
let adminA: Person;
let adminB: Person;
let teacherA: Person;
let teacherC: Person;

const login = async (user: TestUser): Promise<Person> => ({ ...user, cookie: cookieHeader((await loginAs(user)).token!) });

/// A member of staff of one branch (createUser anchors a role to the first branch only, so the branch is set here).
async function staffIn(branchId: string, role: Role, name: string): Promise<Person> {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W+/g, "-")) });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return login({ ...user, branchId });
}

const get = (path: string, who: Person) => api(path, { cookie: who.cookie });
const send = (method: string, path: string, who: Person, body?: unknown) => api(path, { method, cookie: who.cookie, body });
const post = (path: string, who: Person, body?: unknown) => send("POST", path, who, body ?? {});

async function makeProgram(overrides: Record<string, unknown> = {}, who: Person = sa) {
  const res = await post(PROGRAMS, who, {
    name: "Quran memorisation",
    kind: "ONGOING",
    branchIds: [A.id, B.id],
    levelLabels: ["Juz", "Group"],
    ...overrides,
  });
  expect(res.status, res.text).toBe(201);
  return res.json.data.id as string;
}

const detail = async (id: string, who: Person = sa) => (await get(`${PROGRAMS}/${id}`, who)).json.data;
const addGroup = (id: string, name: string, parentId: string | null = null, who: Person = sa) =>
  post(`${PROGRAMS}/${id}/groups`, who, { name, parentId });

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  [A, B, C] = [branches[0]!, branches[1]!, branches[2]!];
  sa = await login(await createUser({ role: Role.ADMIN, name: "Super Admin" }));
  adminA = await login(await createUser({ role: Role.ADMIN, superAdmin: false, name: "Admin A" }));
  adminB = await staffIn(B.id, Role.ADMIN, "Admin B");
  teacherA = await staffIn(A.id, Role.TEACHING_STAFF, "Teacher A");
  teacherC = await staffIn(C.id, Role.TEACHING_STAFF, "Teacher C");
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("who can reach the programs routes at all", () => {
  test("nobody signed out can read or change anything", async () => {
    const id = await makeProgram();
    for (const [method, path] of [
      ["GET", PROGRAMS],
      ["POST", PROGRAMS],
      ["GET", `${PROGRAMS}/${id}`],
      ["PATCH", `${PROGRAMS}/${id}`],
      ["POST", `${PROGRAMS}/${id}/status`],
      ["POST", `${PROGRAMS}/${id}/groups`],
      ["PUT", `${PROGRAMS}/${id}/levels`],
      ["POST", `${PROGRAMS}/${id}/staff`],
      ["GET", SWITCH],
      ["PATCH", SWITCH],
    ] as const) {
      const res = await api(path, { method, body: method === "GET" ? undefined : {} });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  test("a person with no staff membership is refused before any program is looked at", async () => {
    const outsider = await login(await createUser({ name: "No Branch" }));
    expect((await get(PROGRAMS, outsider)).status).toBe(403);
  });
});

test.describe("creating a program", () => {
  test("only a super admin can: a branch admin and a teacher are refused", async () => {
    const body = { name: "X", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] };
    expect((await post(PROGRAMS, adminA, body)).status).toBe(403);
    expect((await post(PROGRAMS, teacherA, body)).status).toBe(403);
    expect(await db.program.count()).toBe(0);
  });

  test("an ongoing program starts as a draft with its branches, levels and a history entry", async () => {
    const id = await makeProgram({ description: "  Daily memorisation  " });
    const p = await detail(id);
    expect(p).toMatchObject({
      name: "Quran memorisation",
      kind: "ONGOING",
      status: "DRAFT",
      description: "Daily memorisation",
      endsOn: null,
      access: "SUPER",
    });
    expect(p.levelLabels).toEqual(["Juz", "Group"]);
    expect(p.branches.map((b: { id: string }) => b.id).sort()).toEqual([A.id, B.id].sort());
    expect(p.audit.map((a: { action: string }) => a.action)).toEqual(["PROGRAM_CREATED"]);
    expect(p.audit[0].actor).toBe("Super Admin");
  });

  test("a program for a period stores the LAST day: start + duration - 1 day", async () => {
    const six = await detail(
      await makeProgram({ name: "Six", kind: "FIXED_TERM", startsOn: "2026-11-03", duration: { value: 6, unit: "MONTHS" } }),
    );
    expect([six.startsOn, six.endsOn]).toEqual(["2026-11-03", "2027-05-02"]);
    const three = await detail(
      await makeProgram({ name: "Three", kind: "FIXED_TERM", startsOn: "2026-11-03", duration: { value: 3, unit: "YEARS" } }),
    );
    expect(three.endsOn).toBe("2029-11-02");
    const dated = await detail(await makeProgram({ name: "Dated", kind: "FIXED_TERM", startsOn: "2026-11-03", endsOn: "2027-01-31" }));
    expect(dated.endsOn).toBe("2027-01-31");
  });

  test("bad input is refused with a field message: dates, names, branches, levels, unknown keys", async () => {
    const base = { name: "Y", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] };
    const refused = async (change: Record<string, unknown>, field?: string) => {
      const res = await post(PROGRAMS, sa, { ...base, ...change });
      expect(res.status, JSON.stringify(change)).toBe(400);
      if (field) expect(res.json.error.details.some((d: { path: string }) => d.path.startsWith(`body.${field}`))).toBe(true);
    };
    await refused({ name: "   " }, "name");
    await refused({ kind: "FIXED_TERM", startsOn: "2026-02-30", duration: { value: 6, unit: "MONTHS" } }, "startsOn");
    await refused({ kind: "FIXED_TERM", startsOn: "2026-11-03" }, "duration");
    await refused({ kind: "FIXED_TERM", startsOn: "2026-11-03", endsOn: "2026-11-03" }, "endsOn");
    await refused({ endsOn: "2027-01-01" }, "endsOn");
    await refused({ branchIds: [] }, "branchIds");
    await refused({ branchIds: [A.id, A.id] }, "branchIds");
    await refused({ branchIds: ["no-such-branch"] }, "branchIds");
    await refused({ levelLabels: [] }, "levelLabels");
    await refused({ levelLabels: ["A", "B", "C", "D", "E"] }, "levelLabels");
    await refused({ levelLabels: ["Class", "class"] }, "levelLabels");
    await refused({ status: "ACTIVE" });
    await refused({ createdByUserId: "someone" });
    expect(await db.program.count()).toBe(0);
  });

  test("a live name is unique, in any letter case; an archived program frees its name", async () => {
    const id = await makeProgram();
    const again = await post(PROGRAMS, sa, { name: "  quran   MEMORISATION ", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    expect(again.status).toBe(409);
    expect(again.json.error.details[0].path).toBe("body.name");
    expect((await post(`${PROGRAMS}/${id}/status`, sa, { action: "archive" })).status).toBe(200);
    expect(
      (await post(PROGRAMS, sa, { name: "Quran memorisation", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] })).status,
    ).toBe(201);
  });

  test("a branch of its own is created with the program, linked, and cannot be taken away from it", async () => {
    const id = await makeProgram({ branchIds: [], ownBranch: { name: "Daarul-Hadeeth" } });
    const p = await detail(id);
    expect(p.branches).toHaveLength(1);
    expect(p.branches[0]).toMatchObject({ name: "Daarul-Hadeeth", own: true });
    expect(p.ownBranchId).toBe(p.branches[0].id);
    expect(await db.auditLog.count({ where: { action: "BRANCH_CREATED", targetId: p.ownBranchId } })).toBe(1);
    expect((await send("DELETE", `${PROGRAMS}/${id}/branches/${p.ownBranchId}`, sa)).status).toBe(409);
    // a branch name that is taken is refused, and no program is left half made
    const clash = await post(PROGRAMS, sa, {
      name: "Another",
      kind: "ONGOING",
      branchIds: [],
      ownBranch: { name: A.name },
      levelLabels: ["Class"],
    });
    expect(clash.status).toBe(409);
    expect(await db.program.count({ where: { name: "Another" } })).toBe(0);
  });
});

test.describe("who sees which program", () => {
  test("a super admin sees all; a branch admin only the programs that run in their branch; staff with no place see none", async () => {
    const both = await makeProgram({ name: "In A and B", branchIds: [A.id, B.id] });
    const onlyB = await makeProgram({ name: "Only B", branchIds: [B.id] });
    const ids = async (who: Person) => (await get(PROGRAMS, who)).json.data.programs.map((p: { id: string }) => p.id).sort();
    expect(await ids(sa)).toEqual([both, onlyB].sort());
    expect(await ids(adminA)).toEqual([both]);
    expect(await ids(adminB)).toEqual([both, onlyB].sort());
    expect(await ids(teacherA)).toEqual([]);
    expect(await ids(teacherC)).toEqual([]);
  });

  test("a program you have no place in is 'not found', the same answer as one that does not exist", async () => {
    const onlyB = await makeProgram({ name: "Only B", branchIds: [B.id] });
    const hidden = await get(`${PROGRAMS}/${onlyB}`, adminA);
    const missing = await get(`${PROGRAMS}/does-not-exist`, adminA);
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.json.error.message).toBe(missing.json.error.message);
    expect(hidden.json.error.code).toBe(missing.json.error.code);
    expect((await get(`${PROGRAMS}/${onlyB}`, teacherA)).status).toBe(404);
  });

  test("a branch admin reads the program but cannot change it; they see no history and no e-mail addresses", async () => {
    const id = await makeProgram();
    const p = await detail(id, adminA);
    expect(p.access).toBe("BRANCH");
    expect(p.can).toEqual({ editDetails: false, editStructure: false, administer: false, restore: false });
    expect(p.audit).toBeNull();
    for (const res of [
      await send("PATCH", `${PROGRAMS}/${id}`, adminA, { name: "Hijacked" }),
      await post(`${PROGRAMS}/${id}/status`, adminA, { action: "activate" }),
      await addGroup(id, "Juz A", null, adminA),
      await send("PUT", `${PROGRAMS}/${id}/levels`, adminA, { labels: ["X"] }),
      await post(`${PROGRAMS}/${id}/branches`, adminA, { branchId: C.id }),
      await post(`${PROGRAMS}/${id}/staff`, adminA, { userId: teacherA.id, branchId: A.id }),
    ]) {
      expect(res.status, res.text).toBe(403);
    }
    expect((await detail(id)).name).toBe("Quran memorisation");
  });
});

test.describe("program admins", () => {
  const name = (id: string, who: Person, branch = A) => post(`${PROGRAMS}/${id}/staff`, sa, { userId: who.id, branchId: branch.id });

  test("a super admin names a teacher of a linked branch; the teacher then runs the program but cannot name anyone", async () => {
    const id = await makeProgram();
    expect((await get(`${PROGRAMS}/${id}`, teacherA)).status).toBe(404);
    expect((await name(id, teacherA)).status).toBe(201);
    const p = await detail(id, teacherA);
    expect(p.access).toBe("ADMIN");
    expect(p.can).toEqual({ editDetails: true, editStructure: true, administer: false, restore: false });
    expect((await get(PROGRAMS, teacherA)).json.data.programs.map((x: { id: string }) => x.id)).toEqual([id]);
    // may change the structure and details ...
    expect((await send("PATCH", `${PROGRAMS}/${id}`, teacherA, { name: "Renamed by the program admin" })).status).toBe(200);
    expect((await addGroup(id, "Juz A", null, teacherA)).status).toBe(201);
    // ... but cannot name others, link branches, restore, or create programs
    expect((await post(`${PROGRAMS}/${id}/staff`, teacherA, { userId: adminA.id, branchId: A.id })).status).toBe(403);
    expect((await post(`${PROGRAMS}/${id}/branches`, teacherA, { branchId: C.id })).status).toBe(403);
    expect((await get(`${PROGRAMS}/${id}/staff/candidates`, teacherA)).status).toBe(403);
    expect((await post(PROGRAMS, teacherA, { name: "Mine", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] })).status).toBe(403);
    expect((await post(`${PROGRAMS}/${id}/status`, teacherA, { action: "archive" })).status).toBe(200);
    expect((await post(`${PROGRAMS}/${id}/status`, teacherA, { action: "restore" })).status).toBe(403);
  });

  test("the person must be staff of a branch the program runs in", async () => {
    const id = await makeProgram();
    const notLinked = await name(id, teacherC, C); // C is not one of the program's branches
    expect(notLinked.status).toBe(400);
    const wrongBranch = await post(`${PROGRAMS}/${id}/staff`, sa, { userId: teacherA.id, branchId: B.id }); // teacherA has no membership in B
    expect(wrongBranch.status).toBe(400);
    const stranger = await post(`${PROGRAMS}/${id}/staff`, sa, { userId: "no-such-user", branchId: A.id });
    expect(stranger.status).toBe(400);
    // a deactivated membership is not staff
    await db.membership.update({
      where: { userId_branchId: { userId: teacherA.id, branchId: A.id } },
      data: { deactivatedAt: new Date() },
    });
    expect((await name(id, teacherA)).status).toBe(400);
    expect(await db.programStaff.count()).toBe(0);
  });

  test("the authority stops at once when the membership is deactivated, or the place is ended", async () => {
    const id = await makeProgram();
    // a second, active membership elsewhere keeps the coarse role gate open, so what is tested is the PROGRAM rule: the place stands on the membership it was made through
    await db.membership.create({ data: { userId: teacherA.id, branchId: C.id, role: Role.TEACHING_STAFF } });
    const placed = await name(id, teacherA);
    expect((await get(`${PROGRAMS}/${id}`, teacherA)).status).toBe(200);
    await db.membership.update({
      where: { userId_branchId: { userId: teacherA.id, branchId: A.id } },
      data: { deactivatedAt: new Date() },
    });
    expect((await get(`${PROGRAMS}/${id}`, teacherA)).status).toBe(404); // also signed out by the deactivation, but the program rule stands on its own
    await db.membership.update({ where: { userId_branchId: { userId: teacherA.id, branchId: A.id } }, data: { deactivatedAt: null } });
    const again = await login(teacherA);
    expect((await get(`${PROGRAMS}/${id}`, again)).status).toBe(200);
    expect((await send("DELETE", `${PROGRAMS}/${id}/staff/${placed.json.data.id}`, sa)).status).toBe(200);
    expect((await get(`${PROGRAMS}/${id}`, again)).status).toBe(404);
    // naming the same person again brings the place back (one row per person and role)
    expect((await name(id, teacherA)).status).toBe(201);
    expect(await db.programStaff.count()).toBe(1);
    expect((await get(`${PROGRAMS}/${id}`, again)).status).toBe(200);
  });

  test("a branch cannot be removed while someone serves through it; candidates exclude those already named", async () => {
    const id = await makeProgram();
    await name(id, teacherA);
    const blocked = await send("DELETE", `${PROGRAMS}/${id}/branches/${A.id}`, sa);
    expect(blocked.status).toBe(409);
    const candidates = (await get(`${PROGRAMS}/${id}/staff/candidates`, sa)).json.data as { userId: string }[];
    expect(candidates.some((c) => c.userId === teacherA.id)).toBe(false);
    expect(candidates.some((c) => c.userId === adminB.id)).toBe(true);
    expect(candidates.some((c) => c.userId === teacherC.id)).toBe(false); // C is not one of the program's branches
    expect((await name(id, teacherA)).status).toBe(409);
  });
});

test.describe("the structure: levels and groups", () => {
  test("groups sit one level below their parent; the path of a group is read from the top", async () => {
    const id = await makeProgram({ levelLabels: ["Section", "Class", "Category"] });
    const jss = (await addGroup(id, "JSS")).json.data.id;
    const two = (await addGroup(id, "2", jss)).json.data.id;
    const c = (await addGroup(id, "C", two)).json.data.id;
    const p = await detail(id);
    expect(p.groups.find((g: { id: string }) => g.id === c)).toMatchObject({ levelIndex: 2, path: "JSS–2–C" });
    expect((await addGroup(id, "Deeper", c)).status).toBe(409); // there is no fourth level
  });

  test("a name is unique among live siblings in any letter case, and free under another parent", async () => {
    const id = await makeProgram();
    const a = (await addGroup(id, "Juz A")).json.data.id;
    const b = (await addGroup(id, "Juz B")).json.data.id;
    expect((await addGroup(id, " juz   a ")).status).toBe(409);
    expect((await addGroup(id, "Group 1", a)).status).toBe(201);
    expect((await addGroup(id, "Group 1", b)).status).toBe(201);
    expect((await addGroup(id, "group 1", a)).status).toBe(409);
    const rename = await send("PATCH", `${PROGRAMS}/${id}/groups/${b}`, sa, { name: "JUZ A" });
    expect(rename.status).toBe(409);
  });

  test("parallel requests for the same group name: one wins, the other is told it is taken", async () => {
    const id = await makeProgram();
    const results = await Promise.all(Array.from({ length: 5 }, () => addGroup(id, "Juz A")));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await db.programGroup.count({ where: { programId: id } })).toBe(1);
  });

  test("move up and down swap with the neighbour, the ends stay put, and nobody shares a place", async () => {
    const id = await makeProgram();
    const ids: string[] = [];
    for (const n of ["One", "Two", "Three"]) ids.push((await addGroup(id, n)).json.data.id);
    const order = async () =>
      (await detail(id)).groups
        .sort((x: { sortOrder: number }, y: { sortOrder: number }) => x.sortOrder - y.sortOrder)
        .map((g: { name: string }) => g.name);
    expect(await order()).toEqual(["One", "Two", "Three"]);
    await send("PATCH", `${PROGRAMS}/${id}/groups/${ids[2]}`, sa, { move: "up" });
    expect(await order()).toEqual(["One", "Three", "Two"]);
    await send("PATCH", `${PROGRAMS}/${id}/groups/${ids[0]}`, sa, { move: "up" }); // already first
    await send("PATCH", `${PROGRAMS}/${id}/groups/${ids[1]}`, sa, { move: "down" }); // already last
    expect(await order()).toEqual(["One", "Three", "Two"]);
    expect(new Set((await detail(id)).groups.map((g: { sortOrder: number }) => g.sortOrder)).size).toBe(3);
  });

  test("a group with live groups inside cannot be archived; archive inner first; restore needs a live parent", async () => {
    const id = await makeProgram();
    const a = (await addGroup(id, "Juz A")).json.data.id;
    const g1 = (await addGroup(id, "Group 1", a)).json.data.id;
    const patch = (gid: string, body: unknown) => send("PATCH", `${PROGRAMS}/${id}/groups/${gid}`, sa, body);
    expect((await patch(a, { archived: true })).status).toBe(409);
    expect((await patch(g1, { archived: true })).status).toBe(200);
    expect((await patch(a, { archived: true })).status).toBe(200);
    expect((await patch(g1, { archived: false })).status).toBe(409); // its parent is archived
    expect((await patch(a, { archived: false })).status).toBe(200);
    expect((await patch(g1, { archived: false })).status).toBe(200);
    // a new group with the name of an archived one is allowed, and then the archived one cannot come back over it
    expect((await patch(g1, { archived: true })).status).toBe(200);
    expect((await addGroup(id, "Group 1", a)).status).toBe(201);
    expect((await patch(g1, { archived: false })).status).toBe(409);
  });

  test("level names: a level in use cannot be taken away, a new one can be added, at most four", async () => {
    const id = await makeProgram({ levelLabels: ["Juz", "Group"] });
    const a = (await addGroup(id, "Juz A")).json.data.id;
    await addGroup(id, "Group 1", a);
    const put = (labels: string[]) => send("PUT", `${PROGRAMS}/${id}/levels`, sa, { labels });
    expect((await put(["Juz"])).status).toBe(409);
    expect((await put(["Juz", "Group", "Row"])).status).toBe(200);
    expect((await detail(id)).levelLabels).toEqual(["Juz", "Group", "Row"]);
    expect((await put(["Juz", "Group", "Row", "Seat", "Extra"])).status).toBe(400);
    expect((await put(["Surah", "Group", "Row"])).status).toBe(200); // renaming a level in use is fine
    expect((await detail(id)).groups.find((g: { name: string }) => g.name === "Juz A").levelIndex).toBe(0);
  });

  test("one program cannot reach another's groups", async () => {
    const one = await makeProgram({ name: "One" });
    const two = await makeProgram({ name: "Two" });
    const inOne = (await addGroup(one, "Juz A")).json.data.id;
    expect((await addGroup(two, "Group 1", inOne)).status).toBe(404);
    expect((await send("PATCH", `${PROGRAMS}/${two}/groups/${inOne}`, sa, { name: "Stolen" })).status).toBe(404);
    expect((await detail(one)).groups[0].name).toBe("Juz A");
  });

  test("odd ids in the path are 'not found', never a server error", async () => {
    const id = await makeProgram();
    for (const odd of ["%00", "a".repeat(300), "..%2F..%2Fetc", "%E0%A4%A", '\'; DROP TABLE "Program"; --']) {
      const res = await get(`${PROGRAMS}/${odd}`, sa);
      expect([400, 404], odd).toContain(res.status);
      const group = await send("PATCH", `${PROGRAMS}/${id}/groups/${odd}`, sa, { name: "x" });
      expect([400, 404], odd).toContain(group.status);
    }
    expect(await db.program.count()).toBe(1);
  });
});

test.describe("the lifecycle", () => {
  test("draft -> active -> archived (read only) -> restored as a draft; only the buttons that apply work", async () => {
    const id = await makeProgram();
    const status = (who: Person, action: string) => post(`${PROGRAMS}/${id}/status`, who, { action });
    expect((await status(sa, "restore")).status).toBe(409); // a draft cannot be restored
    expect((await status(sa, "activate")).status).toBe(200);
    expect((await status(sa, "activate")).status).toBe(409);
    expect((await status(sa, "archive")).status).toBe(200);
    expect((await detail(id)).status).toBe("ARCHIVED");
    // read only: nothing can be changed
    for (const res of [
      await send("PATCH", `${PROGRAMS}/${id}`, sa, { name: "Late" }),
      await addGroup(id, "Juz A"),
      await send("PUT", `${PROGRAMS}/${id}/levels`, sa, { labels: ["X"] }),
      await post(`${PROGRAMS}/${id}/branches`, sa, { branchId: C.id }),
      await status(sa, "activate"),
      await status(sa, "archive"),
    ]) {
      expect(res.status, res.text).toBe(409);
    }
    expect((await detail(id)).can).toEqual({ editDetails: false, editStructure: false, administer: false, restore: true });
    expect((await status(sa, "restore")).status).toBe(200);
    expect((await detail(id)).status).toBe("DRAFT");
    expect(await db.program.findUniqueOrThrow({ where: { id } }).then((p) => p.archivedAt)).toBeNull();
  });

  test("a program cannot be restored over another that took its name", async () => {
    const id = await makeProgram();
    await post(`${PROGRAMS}/${id}/status`, sa, { action: "archive" });
    await makeProgram(); // same name, now free
    expect((await post(`${PROGRAMS}/${id}/status`, sa, { action: "restore" })).status).toBe(409);
  });

  test("details: the dates of a period stay consistent; the kind and the status cannot be changed here", async () => {
    const fixed = await makeProgram({ name: "Fixed", kind: "FIXED_TERM", startsOn: "2026-11-03", duration: { value: 6, unit: "MONTHS" } });
    const patch = (id: string, body: unknown) => send("PATCH", `${PROGRAMS}/${id}`, sa, body);
    expect((await patch(fixed, { endsOn: "2026-11-03" })).status).toBe(400);
    expect((await patch(fixed, { endsOn: null })).status).toBe(400);
    expect((await patch(fixed, { endsOn: "2027-06-30" })).status).toBe(200);
    expect((await detail(fixed)).endsOn).toBe("2027-06-30");
    expect((await patch(fixed, { kind: "ONGOING" })).status).toBe(400);
    expect((await patch(fixed, { status: "COMPLETED" })).status).toBe(400);
    const ongoing = await makeProgram({ name: "Ongoing" });
    expect((await patch(ongoing, { endsOn: "2027-01-01" })).status).toBe(400);
    expect((await patch(ongoing, { name: "Ongoing", description: null })).status).toBe(200);
  });

  test("every change is in the history, with who did it; changing nothing writes nothing", async () => {
    const id = await makeProgram();
    await send("PATCH", `${PROGRAMS}/${id}`, sa, { name: "Quran memorisation" }); // the same name: no change
    await send("PATCH", `${PROGRAMS}/${id}`, sa, { description: "Daily" });
    const a = (await addGroup(id, "Juz A")).json.data.id;
    await send("PATCH", `${PROGRAMS}/${id}/groups/${a}`, sa, { name: "Juz Aa" });
    await send("PUT", `${PROGRAMS}/${id}/levels`, sa, { labels: ["Juz", "Group", "Row"] });
    await post(`${PROGRAMS}/${id}/branches`, sa, { branchId: C.id });
    await post(`${PROGRAMS}/${id}/status`, sa, { action: "activate" });
    const actions = (await db.programAudit.findMany({ where: { programId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(
      (row) => row.action,
    );
    expect(actions).toEqual([
      "PROGRAM_CREATED",
      "PROGRAM_CHANGED",
      "GROUP_ADDED",
      "GROUP_RENAMED",
      "LEVELS_CHANGED",
      "BRANCH_LINKED",
      "PROGRAM_ACTIVATED",
    ]);
    const rows = await db.programAudit.findMany({ where: { programId: id } });
    expect(rows.every((row) => row.actorUserId === sa.id)).toBe(true);
    // there is no route that changes or removes a history row
    for (const method of ["PUT", "PATCH", "DELETE"]) expect((await send(method, `${PROGRAMS}/${id}/audit`, sa, {})).status).toBe(404);
  });
});

test.describe("the programs switch (the school's value is the ceiling)", () => {
  const setSwitch = (who: Person, body: unknown) => send("PATCH", SWITCH, who, body);

  test("with the school switch off nothing can be created or changed, and only a super admin can still read", async () => {
    const id = await makeProgram();
    expect((await setSwitch(sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    const res = await post(PROGRAMS, sa, { name: "New", kind: "ONGOING", branchIds: [A.id], levelLabels: ["Class"] });
    expect([res.status, res.json.error.code]).toEqual([409, "PROGRAMS_OFF"]);
    expect((await addGroup(id, "Juz A")).json.error.code).toBe("PROGRAMS_OFF");
    expect((await send("PATCH", `${PROGRAMS}/${id}`, sa, { name: "Late" })).status).toBe(409);
    const asSuper = (await get(PROGRAMS, sa)).json.data;
    expect([asSuper.enabled, asSuper.programs.length]).toEqual([false, 1]);
    const asBranchAdmin = (await get(PROGRAMS, adminA)).json.data;
    expect([asBranchAdmin.enabled, asBranchAdmin.programs.length]).toEqual([false, 0]);
    expect((await detail(id)).switchedOff).toBe(true);
    // turned back on, it all works again
    expect((await setSwitch(sa, { scope: "GLOBAL", enabled: null })).status).toBe(200);
    expect((await addGroup(id, "Juz A")).status).toBe(201);
  });

  test("only a super admin changes the school's value; a branch admin changes only their own branch's", async () => {
    expect((await setSwitch(adminA, { scope: "GLOBAL", enabled: false })).status).toBe(403);
    expect((await setSwitch(teacherA, { scope: "GLOBAL", enabled: false })).status).toBe(403);
    expect((await setSwitch(adminA, { scope: "BRANCH", branchId: B.id, enabled: false })).status).toBe(404); // not theirs: like an unknown branch
    expect((await setSwitch(adminA, { scope: "BRANCH", branchId: "no-such-branch", enabled: false })).status).toBe(404);
    expect((await setSwitch(adminA, { scope: "BRANCH", branchId: A.id, enabled: false })).status).toBe(200);
    const view = (await get(SWITCH, adminA)).json.data;
    expect(view.branches.map((b: { id: string }) => b.id)).toEqual([A.id]);
    expect(view.canEditSchool).toBe(false);
    const all = (await get(SWITCH, sa)).json.data;
    expect(all.branches).toHaveLength(4);
    expect(all.branches.find((b: { id: string }) => b.id === A.id)).toMatchObject({ stored: false, effective: false });
  });

  test("a branch can only turn it off: 'on' for a branch while the school has it off is refused", async () => {
    await setSwitch(sa, { scope: "GLOBAL", enabled: false });
    const widen = await setSwitch(sa, { scope: "BRANCH", branchId: A.id, enabled: true });
    expect(widen.status).toBe(400);
    expect(await db.settingValue.count({ where: { key: "programs.enabled", scope: "BRANCH" } })).toBe(0);
    // a hand-written row cannot widen it either: the school's "off" wins
    await db.settingValue.create({ data: { scope: "BRANCH", branchId: A.id, key: "programs.enabled", value: true } });
    const view = (await get(SWITCH, sa)).json.data;
    expect(view.branches.find((b: { id: string }) => b.id === A.id).effective).toBe(false);
  });

  test("a branch that turned programs off cannot be added to a program, and is flagged on one it was already in", async () => {
    const id = await makeProgram();
    await setSwitch(sa, { scope: "BRANCH", branchId: C.id, enabled: false });
    const link = await post(`${PROGRAMS}/${id}/branches`, sa, { branchId: C.id });
    expect([link.status, link.json.error.code]).toEqual([409, "BRANCH_PROGRAMS_OFF"]);
    const create = await post(PROGRAMS, sa, { name: "With C", kind: "ONGOING", branchIds: [C.id], levelLabels: ["Class"] });
    expect([create.status, create.json.error.code]).toEqual([409, "BRANCH_PROGRAMS_OFF"]);
    await setSwitch(sa, { scope: "BRANCH", branchId: B.id, enabled: false });
    const p = await detail(id);
    expect(p.branches.find((b: { id: string }) => b.id === B.id).takingPart).toBe(false);
    expect(p.branches.find((b: { id: string }) => b.id === A.id).takingPart).toBe(true);
  });

  test("every change is audited with the old and the new value; saving the same value writes nothing", async () => {
    await setSwitch(sa, { scope: "GLOBAL", enabled: false, reason: "Not ready" });
    await setSwitch(sa, { scope: "GLOBAL", enabled: false });
    await setSwitch(sa, { scope: "GLOBAL", enabled: null });
    const rows = await db.auditLog.findMany({ where: { action: "PROGRAMS_SETTING_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ actorUserId: sa.id, beforeValue: null, afterValue: false, reason: "Not ready" });
    expect(rows[1]).toMatchObject({ beforeValue: false, afterValue: null });
  });

  test("a setting body that names a branch for the school, or no branch for a branch, or an unknown key, is refused", async () => {
    for (const body of [
      { scope: "GLOBAL", branchId: A.id, enabled: false },
      { scope: "BRANCH", enabled: false },
      { scope: "GLOBAL", enabled: "no" },
      { scope: "GLOBAL", enabled: false, key: "bank.access.pupils" },
      { scope: "PLANET", enabled: false },
    ]) {
      expect((await setSwitch(sa, body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

test.describe("what the database itself refuses (the migration's own rules)", () => {
  test("a live program name, a live sibling name, a too-deep level and a top group with a parent are refused even by a direct write", async () => {
    const base = { kind: "ONGOING", createdByUserId: sa.id } as const;
    const p = await db.program.create({ data: { ...base, name: "Direct" } });
    await expect(db.program.create({ data: { ...base, name: "DIRECT" } })).rejects.toThrow();
    await db.program.create({ data: { ...base, name: "Gone", status: "ARCHIVED" } });
    await db.program.create({ data: { ...base, name: "gone" } }); // an archived program frees its name
    await db.programGroup.create({ data: { programId: p.id, levelIndex: 0, name: "Juz A" } });
    await expect(db.programGroup.create({ data: { programId: p.id, levelIndex: 0, name: "juz a" } })).rejects.toThrow(); // top level: no parent, still unique
    await expect(db.programGroup.create({ data: { programId: p.id, levelIndex: 4, name: "Deep", parentId: null } })).rejects.toThrow();
    await expect(db.programGroup.create({ data: { programId: p.id, levelIndex: 0, name: "Has parent", parentId: "x" } })).rejects.toThrow();
    await expect(db.programLevelLabel.create({ data: { programId: p.id, levelIndex: 4, name: "Fifth" } })).rejects.toThrow();
  });

  test("a period needs an end after its start, an ongoing program never has one, and a program admin must hold a membership in that branch", async () => {
    const base = { createdByUserId: sa.id } as const;
    await expect(db.program.create({ data: { ...base, name: "No dates", kind: "FIXED_TERM" } })).rejects.toThrow();
    await expect(
      db.program.create({
        data: { ...base, name: "Backwards", kind: "FIXED_TERM", startsOn: new Date("2026-11-03"), endsOn: new Date("2026-11-03") },
      }),
    ).rejects.toThrow();
    await expect(
      db.program.create({ data: { ...base, name: "Endless with end", kind: "ONGOING", endsOn: new Date("2027-01-01") } }),
    ).rejects.toThrow();
    const p = await db.program.create({ data: { ...base, name: "Ok", kind: "ONGOING" } });
    await expect(
      db.programStaff.create({ data: { programId: p.id, userId: teacherC.id, branchId: A.id, role: "ADMIN", createdByUserId: sa.id } }),
    ).rejects.toThrow();
  });
});
