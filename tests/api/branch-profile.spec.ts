import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { SCHOOL, publishedWorld } from "../support/published-result";

// School details per branch over real HTTP (task 0115, task 0101 D4): a branch's own principal, phone, motto, address, e-mail and website, falling back to the school's for what it has not
// set. Who may read and change which branch comes first; then what is stored and audited; then what the one reader that prints these details (the report card) shows.

const ROUTE = "/api/v1/settings/branch-profile";
const SCHOOL_ROUTE = "/api/v1/settings/school";
const FIELDS = ["principal", "phone", "motto", "address", "email", "website"] as const;

let home: { id: string; name: string };
let other: { id: string; name: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  await db.schoolSettings.upsert({ where: { id: "global" }, update: SCHOOL, create: { id: "global", ...SCHOOL } });
});

const signedIn = async (user: { id: string; email: string; password: string }) => cookieHeader((await loginAs(user)).token!);
/// A branch administrator of `branchId` only (not a superadmin).
const branchAdmin = async (branchId = home.id) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role: Role.ADMIN } });
  return { user, cookie: await signedIn(user) };
};
const teacher = async () => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.TEACHING_STAFF } });
  return { user, cookie: await signedIn(user) };
};
// A superadmin holds at least one membership (a superadmin flag alone grants nothing): `role: ADMIN` gives both.
const superAdmin = async () => {
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: await signedIn(user) };
};
const read = (cookie: string, branchId = home.id) => api(`${ROUTE}?branchId=${branchId}`, { cookie });
const save = (cookie: string, body: Record<string, unknown>, branchId = home.id) =>
  api(ROUTE, { method: "PATCH", cookie, body: { branchId, ...body } });
const audits = () => db.auditLog.findMany({ where: { action: "BRANCH_PROFILE_UPDATED" }, orderBy: { createdAt: "asc" } });

test.describe("who may read and change a branch's details", () => {
  test("signed out is 401; a teacher is 403 on both; an administrator of another branch gets 404 reading and 403 saving", async () => {
    expect((await api(`${ROUTE}?branchId=${home.id}`)).status).toBe(401);
    expect((await api(ROUTE, { method: "PATCH", body: { branchId: home.id, motto: "x" } })).status).toBe(401);

    const t = await teacher();
    expect((await read(t.cookie)).status).toBe(403);
    expect((await save(t.cookie, { motto: "Teachers cannot" })).status).toBe(403);

    const elsewhere = await branchAdmin(other.id);
    expect((await read(elsewhere.cookie)).status).toBe(404); // a branch that is not theirs, from the address: the same answer as an unknown one
    expect((await save(elsewhere.cookie, { motto: "Not mine" })).status).toBe(403); // named in a body: 403
    expect(await db.branchProfile.count()).toBe(0);
    expect(await audits()).toHaveLength(0);
  });

  test("an administrator reads and saves their own branch; a superadmin any branch", async () => {
    const mine = await branchAdmin();
    expect((await read(mine.cookie)).status).toBe(200);
    expect((await save(mine.cookie, { principal: "Mrs Own" })).status).toBe(200);
    expect((await read(mine.cookie, other.id)).status).toBe(404);

    const boss = await superAdmin();
    expect((await save(boss.cookie, { principal: "Mr Other" }, other.id)).status).toBe(200);
    expect((await read(boss.cookie, other.id)).json.data.branch.principal).toBe("Mr Other");
    expect((await read(boss.cookie, home.id)).json.data.branch.principal).toBe("Mrs Own");
  });

  test("an unknown branch is 404 reading and 403 saving, for an administrator; the school-wide route is still the superadmin's alone", async () => {
    const mine = await branchAdmin();
    expect((await read(mine.cookie, "no-such-branch")).status).toBe(404);
    expect((await save(mine.cookie, { motto: "x" }, "no-such-branch")).status).toBe(403);
    expect((await api(SCHOOL_ROUTE, { method: "PATCH", cookie: mine.cookie, body: { name: "Mine now" } })).status).toBe(403);
    expect((await db.schoolSettings.findUniqueOrThrow({ where: { id: "global" } })).name).toBe(SCHOOL.name);
  });
});

test.describe("reading, saving and clearing", () => {
  test("a branch with nothing of its own shows the school's, every field's source being the school", async () => {
    const mine = await branchAdmin();
    const { data } = (await read(mine.cookie)).json;
    for (const f of FIELDS) expect(data.branch[f], `branch.${f}`).toBeNull();
    expect(data.school).toMatchObject({ principal: SCHOOL.principal, phone: SCHOOL.phone, motto: SCHOOL.motto, address: SCHOOL.address });
    expect(data.effective.values).toEqual(data.school);
    for (const f of FIELDS) expect(data.effective.source[f], `source.${f}`).toBe("school");
    expect(await db.branchProfile.count()).toBe(0); // reading creates nothing
  });

  test("a school with no row at all reads as empty, and reading does not create it", async () => {
    const mine = await branchAdmin(); // signed in first, so nothing that happens at sign-in can put the row back
    await db.schoolSettings.deleteMany();
    const { data } = (await read(mine.cookie)).json;
    for (const f of FIELDS) expect(data.school[f]).toBeNull();
    expect(await db.schoolSettings.count()).toBe(0);
  });

  test("saving writes the trimmed value, names what changed, and audits only that; the branch then shows it with the branch as its source", async () => {
    const mine = await branchAdmin();
    const saved = await save(mine.cookie, { principal: "  Mrs Bello  ", motto: "Truth and service" });
    expect(saved.status).toBe(200);
    expect(saved.json.data.changed).toEqual(["principal", "motto"]);
    expect(saved.json.data.branch).toMatchObject({ principal: "Mrs Bello", motto: "Truth and service", phone: null });
    expect(saved.json.data.effective.values).toMatchObject({
      principal: "Mrs Bello",
      motto: "Truth and service",
      phone: SCHOOL.phone,
      address: SCHOOL.address,
    });
    expect(saved.json.data.effective.source).toMatchObject({ principal: "branch", motto: "branch", phone: "school", address: "school" });

    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: mine.user.id, targetType: "BranchProfile" });
    expect(rows[0].beforeValue).toEqual({ branchId: home.id, principal: null, motto: null });
    expect(rows[0].afterValue).toEqual({ branchId: home.id, principal: "Mrs Bello", motto: "Truth and service" });
  });

  test("saving what is already there changes and audits nothing; a field not sent is left as it is", async () => {
    const mine = await branchAdmin();
    await save(mine.cookie, { principal: "Mrs Bello", phone: "0801 111 2222" });
    expect(await audits()).toHaveLength(1);

    const again = await save(mine.cookie, { principal: "Mrs Bello", phone: " 0801 111 2222 " });
    expect(again.json.data.changed).toEqual([]);
    expect(await audits()).toHaveLength(1);

    const onlyMotto = await save(mine.cookie, { motto: "Light" });
    expect(onlyMotto.json.data.changed).toEqual(["motto"]);
    expect(onlyMotto.json.data.branch).toMatchObject({ principal: "Mrs Bello", phone: "0801 111 2222", motto: "Light" });
    const rows = await audits();
    expect(rows).toHaveLength(2);
    expect(rows[1].afterValue).toEqual({ branchId: home.id, motto: "Light" });
    expect(rows[1].beforeValue).toEqual({ branchId: home.id, motto: null });
  });

  test("empty, only spaces, or null clears the branch's value: the school's shows again, and the clearing is audited", async () => {
    const mine = await branchAdmin();
    await save(mine.cookie, { principal: "Mrs Bello", motto: "Own motto", address: "Own road" });
    for (const [field, blank] of [
      ["principal", ""],
      ["motto", "   "],
      ["address", null],
    ] as const) {
      const cleared = await save(mine.cookie, { [field]: blank });
      expect(cleared.status, field).toBe(200);
      expect(cleared.json.data.branch[field], field).toBeNull();
      expect(cleared.json.data.effective.values[field], field).toBe(SCHOOL[field]);
      expect(cleared.json.data.effective.source[field], field).toBe("school");
    }
    const rows = await audits();
    expect(rows).toHaveLength(4);
    expect(rows[3].beforeValue).toEqual({ branchId: home.id, address: "Own road" });
    expect(rows[3].afterValue).toEqual({ branchId: home.id, address: null });
  });

  test("a branch's own value is its own: the school changing its details later does not move it, and does move a branch that has none", async () => {
    const boss = await superAdmin();
    await save(boss.cookie, { principal: "Branch Head" }, other.id);
    const changed = await api(SCHOOL_ROUTE, {
      method: "PATCH",
      cookie: boss.cookie,
      body: { name: SCHOOL.name, principal: "New School Head", motto: "New school motto" },
    });
    expect(changed.status).toBe(200);
    const { data } = (await read(boss.cookie, other.id)).json;
    expect(data.effective.values).toMatchObject({ principal: "Branch Head", motto: "New school motto" });
    expect(data.effective.source).toMatchObject({ principal: "branch", motto: "school" });
    expect((await read(boss.cookie, home.id)).json.data.effective.values.principal).toBe("New School Head");
  });

  test("one branch's details never reach another's", async () => {
    const boss = await superAdmin();
    await save(boss.cookie, { principal: "Home Head", website: "https://home.example" }, home.id);
    const { data } = (await read(boss.cookie, other.id)).json;
    for (const f of FIELDS) expect(data.branch[f], f).toBeNull();
    expect(data.effective.values.principal).toBe(SCHOOL.principal);
    expect(await db.branchProfile.count()).toBe(1);
  });

  test("deleting a branch deletes its details", async () => {
    const extra = await db.branch.create({ data: { name: `Cascade ${Date.now()}` } });
    await db.branchProfile.create({ data: { branchId: extra.id, principal: "Gone with it" } });
    await db.branch.delete({ where: { id: extra.id } });
    expect(await db.branchProfile.count({ where: { branchId: extra.id } })).toBe(0);
  });
});

test.describe("what is refused", () => {
  test("the school's own rules: a bad e-mail or website, too long, an unknown field, or no branch is a 400 naming the field, and nothing is written", async () => {
    const mine = await branchAdmin();
    const refused = async (body: Record<string, unknown>, path: string) => {
      const res = await save(mine.cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      if (path) expect(JSON.stringify(res.json.error.details), JSON.stringify(body)).toContain(path);
    };
    await refused({ email: "not-an-email" }, "body.email");
    await refused({ website: "javascript:alert(1)" }, "body.website");
    await refused({ website: "ftp://files.example" }, "body.website");
    await refused({ principal: "x".repeat(121) }, "body.principal");
    await refused({ phone: "9".repeat(41) }, "body.phone");
    await refused({ motto: "m".repeat(201) }, "body.motto");
    await refused({ address: "a".repeat(301) }, "body.address");
    await refused({ name: "A new school name" }, ""); // the school's name is not a branch's to set
    expect((await api(ROUTE, { method: "PATCH", cookie: mine.cookie, body: { motto: "no branch" } })).status).toBe(400);
    expect(await db.branchProfile.count()).toBe(0);
    expect(await audits()).toHaveLength(0);
  });

  test("a valid e-mail and a web address are kept as written (trimmed)", async () => {
    const mine = await branchAdmin();
    const ok = await save(mine.cookie, { email: " office@branch.example ", website: "https://branch.example/about" });
    expect(ok.status).toBe(200);
    expect(ok.json.data.branch).toMatchObject({ email: "office@branch.example", website: "https://branch.example/about" });
  });

  test("30 saves in five minutes per administrator, then 429; another administrator is not held up", async () => {
    const mine = await branchAdmin();
    for (let i = 1; i <= 30; i++) expect((await save(mine.cookie, { motto: `Motto ${i}` })).status, `save ${i}`).toBe(200);
    const held = await save(mine.cookie, { motto: "One too many" });
    expect(held.status).toBe(429);
    expect(held.json.error.code).toBe("RATE_LIMITED");
    expect((await read(mine.cookie)).json.data.branch.motto).toBe("Motto 30");
    const second = await branchAdmin();
    expect((await save(second.cookie, { motto: "Fine" })).status).toBe(200);
  });
});

test.describe("what the report card shows", () => {
  const CARD = (studentId: string, periodId: string) => `/api/v1/students/${studentId}/report-card?periodId=${periodId}`;

  test("the school's details where the branch has none, the branch's own where it has, the school's name always the school's", async () => {
    const { home: branch, w } = await publishedWorld({ remarks: false });
    const boss = await superAdmin();
    const card = async () => (await api(CARD(w.student.id, w.period.id), { cookie: boss.cookie })).json.data.card;

    expect((await card()).school).toEqual({
      name: SCHOOL.name,
      principal: SCHOOL.principal,
      motto: SCHOOL.motto,
      address: SCHOOL.address,
      phone: SCHOOL.phone,
    });

    expect((await save(boss.cookie, { principal: "Mr Branch Head", address: "5 Branch Lane" }, branch.id)).status).toBe(200);
    expect((await card()).school).toEqual({
      name: SCHOOL.name,
      principal: "Mr Branch Head",
      motto: SCHOOL.motto,
      address: "5 Branch Lane",
      phone: SCHOOL.phone,
    });

    // Back to the school's once cleared.
    expect((await save(boss.cookie, { principal: "", address: "" }, branch.id)).status).toBe(200);
    expect((await card()).school.principal).toBe(SCHOOL.principal);
    expect((await card()).school.address).toBe(SCHOOL.address);
  });

  test("another branch's own details do not appear on this branch's card", async () => {
    const { home: branch, w } = await publishedWorld({ remarks: false });
    const boss = await superAdmin();
    const away = await db.branch.findFirstOrThrow({ where: { id: { not: branch.id } }, orderBy: { name: "asc" } });
    expect((await save(boss.cookie, { principal: "Someone Elsewhere", motto: "Elsewhere", phone: "0900 000 0000" }, away.id)).status).toBe(
      200,
    );
    const card = (await api(CARD(w.student.id, w.period.id), { cookie: boss.cookie })).json.data.card;
    expect(card.school).toMatchObject({ principal: SCHOOL.principal, motto: SCHOOL.motto, phone: SCHOOL.phone });
  });
  test("a branch's own school name is on its card; another branch and a blank name use the school's; too short is refused; only an administrator of that branch may set it", async () => {
    const { home: branch, w } = await publishedWorld({ remarks: false });
    const boss = await superAdmin();
    const away = await db.branch.findFirstOrThrow({ where: { id: { not: branch.id } }, orderBy: { name: "asc" } });
    expect((await save(boss.cookie, { schoolName: "A" }, branch.id)).status).toBe(400); // at least 2 characters
    expect((await save(boss.cookie, { schoolName: "Al-Eeman Nursery and Primary School" }, branch.id)).status).toBe(200);
    const own = (await api(CARD(w.student.id, w.period.id), { cookie: boss.cookie })).json.data.card;
    expect(own.school.name).toBe("Al-Eeman Nursery and Primary School");
    const elsewhere = await branchAdmin(away.id);
    expect((await save(elsewhere.cookie, { schoolName: "Hijack" }, branch.id)).status).toBe(403); // not their branch
    expect((await save(boss.cookie, { schoolName: "   " }, branch.id)).status).toBe(200); // blank = the school's again
    const back = (await api(CARD(w.student.id, w.period.id), { cookie: boss.cookie })).json.data.card;
    expect(back.school.name).not.toBe("Al-Eeman Nursery and Primary School");
  });
});
