import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0126 over real HTTP: staff with no branch yet, in bulk. A superadmin's file (import) and list (export); a branch administrator and a teacher are refused; every record is saved with no branch
// and no sign-in, all or none; an address already used by a live unplaced record is a problem on its row; the export holds only unplaced records and is audited without the data.

let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});
const asUser = async (opts: { role: Role; superAdmin?: boolean }) => {
  const user = await createUser({ superAdmin: opts.superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: opts.role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const asSuper = () => asUser({ role: Role.ADMIN, superAdmin: true });
let n = 0;
const row = (line: number, values: Record<string, string> = {}) => ({
  line,
  values: { category: "Teaching", firstName: `Loose${++n}`, lastName: "Person", ...values },
});
const IMPORT = "/api/v1/staff/unplaced/import";
const EXPORT = "/api/v1/staff/unplaced/export";
const send = (cookie: string, rows: unknown[], dryRun: boolean, extra: Record<string, unknown> = {}) =>
  api(IMPORT, { method: "POST", cookie, body: { dryRun, rows, ...extra } });

test.describe("import", () => {
  test("who may: signed out 401; a branch administrator and a teacher 403; a superadmin may", async () => {
    const rows = [row(2)];
    expect((await api(IMPORT, { method: "POST", body: { dryRun: true, rows } })).status).toBe(401);
    expect((await send((await asUser({ role: Role.ADMIN })).cookie, rows, true)).status).toBe(403);
    expect((await send((await asUser({ role: Role.TEACHING_STAFF })).cookie, rows, true)).status).toBe(403);
    expect((await send((await asSuper()).cookie, rows, true)).status).toBe(200);
  });

  test("a dry run writes nothing; the save puts every record in no branch with no sign-in, audited; drafts when asked", async () => {
    const su = await asSuper();
    const rows = [row(2, { email: "loose.one@example.test" }), row(3), row(4, { corpsMember: "yes" })];
    const dry = await send(su.cookie, rows, true);
    expect(dry.json.data.verdicts.map((v: { status: string }) => v.status)).toEqual(["ready", "ready", "ready"]);
    expect(await db.staffRecord.count({ where: { branchId: null } })).toBe(0);

    const saved = await send(su.cookie, rows, false);
    expect(saved.status, saved.text).toBe(201);
    expect(saved.json.data.saved).toBe(3);
    const made = await db.staffRecord.findMany({ where: { branchId: null } });
    expect(made).toHaveLength(3);
    expect(made.every((m) => m.userId === null && !m.isDraft)).toBe(true);
    expect(await db.auditLog.count({ where: { action: "STAFF_CREATED", targetId: { in: made.map((m) => m.id) } } })).toBe(3);
    expect(await db.auditLog.count({ where: { action: "STAFF_UNPLACED_BULK_IMPORTED" } })).toBe(1);

    const drafts = await send(su.cookie, [row(2)], false, { asDraft: true });
    expect(drafts.status, drafts.text).toBe(201);
    expect(await db.staffRecord.count({ where: { branchId: null, isDraft: true } })).toBe(1);
  });

  test("an address a live unplaced record already uses is a problem on its row and nothing is saved; a branch's own record with that address is not in the way", async () => {
    const su = await asSuper();
    expect((await send(su.cookie, [row(2, { email: "same@example.test" })], false)).status).toBe(201);
    await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Placed", lastName: "Elsewhere", email: "placed@example.test" },
    });
    const res = await send(su.cookie, [row(2, { email: "SAME@example.test" }), row(3, { email: "placed@example.test" }), row(4)], false);
    expect(res.status).toBe(422);
    const verdicts = res.json.data.verdicts as { line: number; status: string; problems: { column: string }[] }[];
    expect(verdicts.find((v) => v.line === 2)).toMatchObject({ status: "error", problems: [{ column: "email" }] });
    expect(verdicts.find((v) => v.line === 3)?.status).toBe("ready");
    expect(await db.staffRecord.count({ where: { branchId: null } })).toBe(1); // only the first, earlier save
  });

  test("a strict body: an extra key, no rows, and a branchId are refused", async () => {
    const su = await asSuper();
    expect((await send(su.cookie, [row(2)], true, { extra: 1 })).status).toBe(400);
    expect((await send(su.cookie, [], true)).status).toBe(400);
    expect((await send(su.cookie, [row(2)], true, { branchId: home.id })).status).toBe(400);
  });
});

test.describe("export", () => {
  test("who may; only unplaced records; the archived only when asked; audited without the data", async () => {
    const su = await asSuper();
    await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Placed", lastName: "Person" },
    });
    await db.staffRecord.create({
      data: { branchId: null, category: "TEACHING", firstName: "Loose", lastName: "Live", email: "loose@example.test" },
    });
    await db.staffRecord.create({
      data: { branchId: null, category: "NON_TEACHING", firstName: "Loose", lastName: "Gone", archivedAt: new Date() },
    });

    expect((await api(EXPORT, { method: "POST", body: { scope: "all" } })).status).toBe(401);
    expect(
      (await api(EXPORT, { method: "POST", cookie: (await asUser({ role: Role.ADMIN })).cookie, body: { scope: "all" } })).status,
    ).toBe(403);

    const live = await api(EXPORT, { method: "POST", cookie: su.cookie, body: { scope: "all" } });
    expect(live.status, live.text).toBe(200);
    expect(live.json.data.count).toBe(1);
    expect(JSON.stringify(live.json.data.rows)).toContain("Live");
    expect(JSON.stringify(live.json.data.rows)).not.toContain("Placed");
    expect(live.json.data.fileStem).toMatch(/^staff-not-placed-in-a-branch-/);

    const all = await api(EXPORT, { method: "POST", cookie: su.cookie, body: { scope: "all", includeArchived: true } });
    expect(all.json.data.count).toBe(2);

    const audits = await db.auditLog.findMany({ where: { action: "EXPORT_CREATED", targetId: "unplaced" } });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits.map((a) => a.afterValue))).not.toContain("loose@example.test");
  });

  test("'shown' exports only the ids named, and only unplaced ones (a placed record's id gives nothing)", async () => {
    const su = await asSuper();
    const placed = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Placed", lastName: "Person" },
    });
    const loose = await db.staffRecord.create({ data: { branchId: null, category: "TEACHING", firstName: "Loose", lastName: "Live" } });
    const res = await api(EXPORT, { method: "POST", cookie: su.cookie, body: { scope: "shown", ids: [placed.id, loose.id] } });
    expect(res.json.data.count).toBe(1);
    expect(JSON.stringify(res.json.data.rows)).toContain("Loose");
    expect((await api(EXPORT, { method: "POST", cookie: su.cookie, body: { scope: "all", extra: 1 } })).status).toBe(400);
  });
});

test.describe("completing a draft that has no branch (task 0127)", () => {
  const COMPLETE = (id: string) => `/api/v1/staff/unplaced/${id}/complete`;
  const draft = (extra: Record<string, unknown> = {}) =>
    db.staffRecord.create({ data: { branchId: null, category: "TEACHING", firstName: "Dee", lastName: "Raft", isDraft: true, ...extra } });

  test("a superadmin completes it when it has what a finished record needs; otherwise 409 lists what is missing and nothing changes; audited once", async () => {
    const su = await asSuper();
    const incomplete = await draft();
    const refused = await api(COMPLETE(incomplete.id), { method: "POST", cookie: su.cookie });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("INCOMPLETE");
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: incomplete.id } })).isDraft).toBe(true);

    const ready = await draft({ gender: "FEMALE", email: "dee.raft@example.test" });
    const done = await api(COMPLETE(ready.id), { method: "POST", cookie: su.cookie });
    expect(done.status, done.text).toBe(200);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: ready.id } })).isDraft).toBe(false);
    expect(await db.auditLog.count({ where: { action: "STAFF_COMPLETED", targetId: ready.id } })).toBe(1);
    // Again: returned as it is, no second audit entry.
    expect((await api(COMPLETE(ready.id), { method: "POST", cookie: su.cookie })).status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "STAFF_COMPLETED", targetId: ready.id } })).toBe(1);
  });

  test("who may: signed out 401; a branch administrator and a teacher get the same 404 as an unknown id; a placed record is a 404 here", async () => {
    const su = await asSuper();
    const ready = await draft({ gender: "FEMALE", email: "x.y@example.test" });
    expect((await api(COMPLETE(ready.id), { method: "POST" })).status).toBe(401);
    expect((await api(COMPLETE(ready.id), { method: "POST", cookie: (await asUser({ role: Role.ADMIN })).cookie })).status).toBe(404);
    expect((await api(COMPLETE(ready.id), { method: "POST", cookie: (await asUser({ role: Role.TEACHING_STAFF })).cookie })).status).toBe(
      403,
    );
    expect((await api(COMPLETE("nope"), { method: "POST", cookie: su.cookie })).status).toBe(404);
    const placed = await db.staffRecord.create({
      data: {
        branchId: home.id,
        category: "TEACHING",
        firstName: "Placed",
        lastName: "Draft",
        isDraft: true,
        gender: "MALE",
        email: "p@example.test",
      },
    });
    expect((await api(COMPLETE(placed.id), { method: "POST", cookie: su.cookie })).status).toBe(404);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: placed.id } })).isDraft).toBe(true);
  });
});
