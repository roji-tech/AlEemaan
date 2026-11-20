import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0125 over real HTTP: New or Returning for many pupils at once. Who may use it, what it reaches (active enrolment, not archived, not a draft, one class when asked), that a dry run
// writes nothing, that a pupil set by hand is left alone unless asked, and that one audit entry holds each pupil's earlier setting.

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
let n = 0;

async function world() {
  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2027-07-30T00:00:00Z"),
      status: "ACTIVE",
    },
  });
  const group = (name: string) => db.classGroup.create({ data: { branchId: home.id, name, sortOrder: ++n } });
  const b1 = await group("Basic 1");
  const b2 = await group("Basic 2");
  const arm = (classGroupId: string) => db.classArm.create({ data: { branchId: home.id, classGroupId, name: "A" } });
  const a1 = await arm(b1.id);
  const a2 = await arm(b2.id);
  const pupil = async (
    firstName: string,
    where: { arm?: { id: string }; group?: { name: string }; status?: "ACTIVE" | "WITHDRAWN" },
    extra: Record<string, unknown> = {},
  ) => {
    const p = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName,
        lastName: "Many",
        gender: Gender.MALE,
        admissionNo: `AM/${Date.now() % 100000}/${++n}`,
        ...extra,
      },
    });
    if (where.arm)
      await db.studentEnrollment.create({
        data: {
          studentId: p.id,
          branchId: home.id,
          sessionId: session.id,
          className: where.group?.name ?? "Basic 1",
          arm: "A",
          classArmId: where.arm.id,
          status: where.status ?? "ACTIVE",
        },
      });
    return p;
  };
  return { b1, b2, a1, a2, pupil };
}
const setting = async (id: string) => (await db.studentRecord.findUniqueOrThrow({ where: { id } })).feeAdmission;
const call = (cookie: string, body: Record<string, unknown>, branchId = home.id) =>
  api(`/api/v1/finance/admission-status?branchId=${branchId}`, { method: "POST", cookie, body });

test("who may use it: signed out 401; a teacher 403; the administrator of another branch is refused; a branch administrator may", async () => {
  await world();
  const body = { admission: "RETURNING", onlyUnset: true, dryRun: true };
  expect((await api(`/api/v1/finance/admission-status?branchId=${home.id}`, { method: "POST", body })).status).toBe(401);
  expect((await call((await asRole(Role.TEACHING_STAFF)).cookie, body)).status).toBe(403);
  const away = await asRole(Role.ADMIN, [other.id]);
  expect([403, 404]).toContain((await call(away.cookie, body)).status);
  expect((await call((await asRole(Role.ADMIN)).cookie, body)).status).toBe(200);
});

test("it reaches active, undrafted, unarchived pupils; a dry run counts and writes nothing; the real run sets them and writes one audit entry with the earlier values", async () => {
  const w = await world();
  const admin = await asRole(Role.ADMIN);
  const one = await w.pupil("One", { arm: w.a1, group: w.b1 });
  const two = await w.pupil("Two", { arm: w.a2, group: w.b2 });
  const hand = await w.pupil("Hand", { arm: w.a1, group: w.b1 }, { feeAdmission: "NEW" });
  const gone = await w.pupil("Gone", { arm: w.a1, group: w.b1, status: "WITHDRAWN" });
  const draft = await w.pupil("Draft", { arm: w.a1, group: w.b1 }, { isDraft: true });
  const old = await w.pupil("Old", { arm: w.a1, group: w.b1 }, { archivedAt: new Date() });
  const unplaced = await w.pupil("Unplaced", {});

  const dry = await call(admin.cookie, { admission: "RETURNING", onlyUnset: true, dryRun: true });
  expect(dry.json.data).toEqual({ inScope: 2, willChange: 2, changed: 0, dryRun: true });
  expect(await setting(one.id)).toBeNull();

  const done = await call(admin.cookie, { admission: "RETURNING", onlyUnset: true, dryRun: false });
  expect(done.json.data).toEqual({ inScope: 2, willChange: 2, changed: 2, dryRun: false });
  expect([await setting(one.id), await setting(two.id)]).toEqual(["RETURNING", "RETURNING"]);
  expect(await setting(hand.id)).toBe("NEW");
  for (const left of [gone, draft, old, unplaced]) expect(await setting(left.id), left.firstName).toBeNull();

  const log = await db.auditLog.findMany({ where: { action: "STUDENT_FEE_ADMISSION_SET_MANY" } });
  expect(log).toHaveLength(1);
  expect(log[0].beforeValue).toEqual({ [one.id]: null, [two.id]: null });
  expect(log[0].afterValue).toMatchObject({ admission: "RETURNING", changed: 2, onlyUnset: true });

  // Again: nothing left to change, and no second audit entry.
  const again = await call(admin.cookie, { admission: "RETURNING", onlyUnset: true, dryRun: false });
  expect(again.json.data).toMatchObject({ willChange: 0, changed: 0 });
  expect(await db.auditLog.count({ where: { action: "STUDENT_FEE_ADMISSION_SET_MANY" } })).toBe(1);
});

test("one class only; leaving out 'only unset' overrides a hand setting; 'work it out' clears it", async () => {
  const w = await world();
  const admin = await asRole(Role.ADMIN);
  const one = await w.pupil("One", { arm: w.a1, group: w.b1 });
  const two = await w.pupil("Two", { arm: w.a2, group: w.b2 });
  const hand = await w.pupil("Hand", { arm: w.a1, group: w.b1 }, { feeAdmission: "NEW" });

  await call(admin.cookie, { admission: "RETURNING", classGroupId: w.b1.id, onlyUnset: true, dryRun: false });
  expect([await setting(one.id), await setting(two.id), await setting(hand.id)]).toEqual(["RETURNING", null, "NEW"]);

  await call(admin.cookie, { admission: "RETURNING", classGroupId: w.b1.id, onlyUnset: false, dryRun: false });
  expect(await setting(hand.id)).toBe("RETURNING");

  const cleared = await call(admin.cookie, { admission: null, onlyUnset: false, dryRun: false });
  expect(cleared.json.data).toMatchObject({ inScope: 3, changed: 2 });
  expect([await setting(one.id), await setting(hand.id)]).toEqual([null, null]);
});

test("a class of another branch is 404 and writes nothing; a bad body is 400", async () => {
  const w = await world();
  const admin = await asRole(Role.ADMIN);
  const mine = await w.pupil("Mine", { arm: w.a1, group: w.b1 });
  const foreign = await db.classGroup.create({ data: { branchId: other.id, name: "Foreign", sortOrder: 1 } });
  const res = await call(admin.cookie, { admission: "RETURNING", classGroupId: foreign.id, onlyUnset: true, dryRun: false });
  expect(res.status).toBe(404);
  expect(await setting(mine.id)).toBeNull();
  expect((await call(admin.cookie, { admission: "OLD", onlyUnset: true, dryRun: false })).status).toBe(400);
  expect((await call(admin.cookie, { admission: "NEW", onlyUnset: true, dryRun: false, extra: 1 })).status).toBe(400);
});
