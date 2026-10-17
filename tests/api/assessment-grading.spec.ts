import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Assessment schemes and grade scales over real HTTP (Slice P1b). Reading takes a staff role held in the branch; writing an administrator of that branch; another
// branch is a 404 (URL / looked-up id) or a 403 (named in a body). A scheme or scale is edited in place only while no result uses it; after that a change is a NEW
// VERSION. The maths (components + exam = total, contiguous bands) is the validated pure rule; here we prove it is enforced at the door.

let home: { id: string };
let other: { id: string };
// A locked scheme or scale (the tests below lock some) refuses row-level deletes by design, so the database is reset with a truncating reset, not deleteMany.
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const SCHEMES = "/api/v1/academics/assessment-schemes";
const SCALES = "/api/v1/academics/grade-scales";
const primary = (extra: object = {}) => ({
  branchId: home.id,
  name: "Primary",
  examMax: 60,
  components: [
    { name: "Test 1", maxScore: 20 },
    { name: "Test 2", maxScore: 20 },
  ],
  ...extra,
});
const bands = [
  { min: 0, max: 50, letter: "F", remark: "Fail" },
  { min: 50, max: 70, letter: "C", remark: "Credit" },
  { min: 70, max: 100, letter: "A", remark: "Excellent" },
];

test.describe("schemes", () => {
  test("who may use them: signed out 401; a parent 403; staff read; only the branch administrator writes; another branch is 404 / 403", async () => {
    expect((await api(`${SCHEMES}?branchId=${home.id}`)).status).toBe(401);
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const parent = await asRole(Role.PARENT);
    const otherAdmin = await asRole(Role.ADMIN, other.id);
    expect((await api(SCHEMES, { method: "POST", cookie: teacher.cookie, body: primary() })).status).toBe(403);
    expect((await api(`${SCHEMES}?branchId=${home.id}`, { cookie: parent.cookie })).status).toBe(403);
    expect((await api(SCHEMES, { method: "POST", cookie: admin.cookie, body: primary() })).status).toBe(201);
    expect((await api(`${SCHEMES}?branchId=${home.id}`, { cookie: teacher.cookie })).json.data.schemes).toHaveLength(1);
    expect((await api(`${SCHEMES}?branchId=${other.id}`, { cookie: admin.cookie })).status).toBe(404);
    const forbidden = await api(SCHEMES, { method: "POST", cookie: admin.cookie, body: primary({ branchId: other.id, name: "Sneaky" }) });
    expect([forbidden.status, forbidden.json.error.code]).toEqual([403, "FORBIDDEN"]);
    const theirs = (await api(SCHEMES, { method: "POST", cookie: otherAdmin.cookie, body: primary({ branchId: other.id }) })).json.data
      .scheme;
    const foreign = await api(`${SCHEMES}/${theirs.id}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Hijack" } });
    const unknown = await api(`${SCHEMES}/nope`, { method: "PATCH", cookie: admin.cookie, body: { name: "Hijack" } });
    expect([foreign.status, foreign.json]).toEqual([404, unknown.json]);
    expect((await api(`${SCHEMES}/${theirs.id}`, { cookie: admin.cookie })).status).toBe(404);
  });

  test("components + exam must equal the total exactly; the rule's messages reach the caller; a second default scheme is a 409", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const bad = await api(SCHEMES, { method: "POST", cookie, body: primary({ examMax: 50 }) });
    expect([bad.status, bad.json.error.message]).toEqual([400, "The components and the exam must add up to the total exactly."]);
    expect(
      (
        await api(SCHEMES, {
          method: "POST",
          cookie,
          body: primary({
            components: [
              { name: "A", maxScore: 20.123 },
              { name: "B", maxScore: 19.877 },
            ],
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(SCHEMES, {
          method: "POST",
          cookie,
          body: primary({
            components: [
              { name: "Same", maxScore: 20 },
              { name: "same", maxScore: 20 },
            ],
          }),
        })
      ).status,
    ).toBe(400);
    expect((await api(SCHEMES, { method: "POST", cookie, body: primary() })).status).toBe(201);
    expect((await api(SCHEMES, { method: "POST", cookie, body: primary({ name: "Second" }) })).status).toBe(409);
    expect((await api(SCHEMES, { method: "POST", cookie, body: { ...primary(), extra: 1 } })).status).toBe(400); // strict body
  });

  test("a class scheme needs a live class of this branch; an unlocked scheme is edited in place and audited; GET returns the canonical snapshot", async () => {
    const { cookie, user } = await asRole(Role.ADMIN);
    const cls = await db.classGroup.create({ data: { branchId: home.id, name: `Scheme class ${Date.now()}` } });
    const foreignCls = await db.classGroup.create({ data: { branchId: other.id, name: `Foreign class ${Date.now()}` } });
    expect((await api(SCHEMES, { method: "POST", cookie, body: primary({ classGroupId: foreignCls.id }) })).status).toBe(409);
    const made = await api(SCHEMES, { method: "POST", cookie, body: primary({ classGroupId: cls.id, name: "For one class" }) });
    expect(made.status, made.text).toBe(201);
    const id = made.json.data.scheme.id as string;
    const edited = await api(`${SCHEMES}/${id}`, {
      method: "PATCH",
      cookie,
      body: {
        examMax: 50,
        components: [
          { name: "Test 1", maxScore: 25 },
          { name: "Test 2", maxScore: 25 },
        ],
      },
    });
    expect([edited.status, edited.json.data.changed, edited.json.data.scheme.examMax]).toEqual([200, true, 50]);
    expect((await api(`${SCHEMES}/${id}`, { method: "PATCH", cookie, body: { name: "For one class" } })).json.data.changed).toBe(false);
    const got = await api(`${SCHEMES}/${id}`, { cookie });
    expect(got.json.data.snapshot.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(got.json.data.snapshot.json).examMax).toBe("50.00");
    expect(await db.auditLog.count({ where: { actorUserId: user.id, action: "ASSESSMENT_SCHEME_UPDATED" } })).toBe(1);
  });

  test("once a result uses a scheme it is locked: editing is a 409, a new version supersedes it, and the old one is archived", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const id = (await api(SCHEMES, { method: "POST", cookie, body: primary() })).json.data.scheme.id as string;
    expect((await api(`${SCHEMES}/${id}/versions`, { method: "POST", cookie, body: { examMax: 60 } })).status).toBe(409); // not locked yet: edit in place
    await db.assessmentScheme.update({ where: { id }, data: { lockedAt: new Date() } }); // what Slice P2 will do
    expect(
      (await api(`${SCHEMES}/${id}`, { method: "PATCH", cookie, body: { examMax: 50, components: [{ name: "T", maxScore: 50 }] } })).status,
    ).toBe(409);
    const v2 = await api(`${SCHEMES}/${id}/versions`, {
      method: "POST",
      cookie,
      body: { examMax: 50, components: [{ name: "T", maxScore: 50 }] },
    });
    expect(v2.status, v2.text).toBe(201);
    expect([v2.json.data.scheme.version, v2.json.data.scheme.supersedesId, v2.json.data.scheme.locked]).toEqual([2, id, false]);
    const live = (await api(`${SCHEMES}?branchId=${home.id}`, { cookie })).json.data.schemes;
    expect(live.map((s: { id: string }) => s.id)).toEqual([v2.json.data.scheme.id]);
    const all = (await api(`${SCHEMES}?branchId=${home.id}&includeArchived=true`, { cookie })).json.data.schemes;
    expect(all).toHaveLength(2);
    expect((await api(`${SCHEMES}/${v2.json.data.scheme.id}/archive`, { method: "POST", cookie, body: {} })).status).toBe(200);
    expect((await api(`${SCHEMES}/${v2.json.data.scheme.id}/archive`, { method: "POST", cookie, body: {} })).status).toBe(200); // safe to repeat
  });
});

test.describe("grade scales", () => {
  test("the first scale of a branch is its default; bands must be contiguous 0-100; the WAEC template is offered and is itself valid", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const gap = await api(SCALES, {
      method: "POST",
      cookie,
      body: {
        branchId: home.id,
        name: "Gappy",
        bands: [
          { min: 0, max: 40, letter: "F", remark: "Fail" },
          { min: 50, max: 100, letter: "A", remark: "Top" },
        ],
      },
    });
    expect(gap.status).toBe(400);
    const first = await api(SCALES, { method: "POST", cookie, body: { branchId: home.id, name: "Simple", bands } });
    expect([first.status, first.json.data.scale.isDefault]).toEqual([201, true]);
    const second = await api(SCALES, { method: "POST", cookie, body: { branchId: home.id, name: "Second", bands } });
    expect(second.json.data.scale.isDefault).toBe(false);
    const list = await api(`${SCALES}?branchId=${home.id}`, { cookie });
    expect(list.json.data.template).toHaveLength(9);
    const fromTemplate = await api(SCALES, {
      method: "POST",
      cookie,
      body: { branchId: home.id, name: "WAEC", bands: list.json.data.template },
    });
    expect(fromTemplate.status, fromTemplate.text).toBe(201); // the template passes the same band rule everyone else does
  });

  test("make default moves it; the default cannot be archived; a locked scale is a 409 to edit and a new version keeps the default; another branch is 404", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const otherAdmin = await asRole(Role.ADMIN, other.id);
    const a = (await api(SCALES, { method: "POST", cookie, body: { branchId: home.id, name: "A", bands } })).json.data.scale;
    const b = (await api(SCALES, { method: "POST", cookie, body: { branchId: home.id, name: "B", bands } })).json.data.scale;
    expect((await api(`${SCALES}/${a.id}/archive`, { method: "POST", cookie, body: {} })).status).toBe(409); // the default
    expect((await api(`${SCALES}/${b.id}/default`, { method: "POST", cookie, body: {} })).json.data.changed).toBe(true);
    expect((await api(`${SCALES}/${b.id}/default`, { method: "POST", cookie, body: {} })).json.data.changed).toBe(false);
    expect((await api(`${SCALES}/${a.id}/archive`, { method: "POST", cookie, body: {} })).status).toBe(200);
    await db.gradeScale.update({ where: { id: b.id }, data: { lockedAt: new Date() } });
    expect((await api(`${SCALES}/${b.id}`, { method: "PATCH", cookie, body: { name: "B2" } })).status).toBe(409);
    const v2 = await api(`${SCALES}/${b.id}/versions`, { method: "POST", cookie, body: { name: "B v2" } });
    expect([v2.status, v2.json.data.scale.version, v2.json.data.scale.isDefault]).toEqual([201, 2, true]);
    expect((await api(`${SCALES}/${b.id}/default`, { method: "POST", cookie: otherAdmin.cookie, body: {} })).status).toBe(404);
  });
});
