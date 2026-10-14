import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Staff records and teaching assignments over real HTTP (Slice P1c). Reading takes a staff role held in the branch; writing an administrator of that branch;
// another branch is a 404 (URL / looked-up id) or a 403 (named in a body). Linking a sign-in account is the delicate part: same branch, active, matching role, once.

let home: { id: string };
let other: { id: string };
// These specs leave classes, subjects and staff behind; a later spec (the Academics screen) expects an empty branch, so leave the database as found.
test.afterAll(async () => {
  await resetDatabase();
});
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
const STAFF = "/api/v1/staff";
const person = (extra: object = {}) => ({ branchId: home.id, category: "TEACHING", firstName: "Amina", lastName: "Yusuf", ...extra });

test.describe("records", () => {
  test("who may use them: signed out 401; a parent 403; staff read; only the branch administrator writes; another branch is 404 / 403", async () => {
    expect((await api(`${STAFF}?branchId=${home.id}`)).status).toBe(401);
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const parent = await asRole(Role.PARENT);
    const otherAdmin = await asRole(Role.ADMIN, other.id);
    expect((await api(STAFF, { method: "POST", cookie: teacher.cookie, body: person() })).status).toBe(403);
    expect((await api(`${STAFF}?branchId=${home.id}`, { cookie: parent.cookie })).status).toBe(403);
    const made = await api(STAFF, { method: "POST", cookie: admin.cookie, body: person() });
    expect(made.status).toBe(201);
    expect(made.json.data.staff.account).toEqual({ state: "none" });
    expect((await api(`${STAFF}?branchId=${home.id}`, { cookie: teacher.cookie })).json.data.staff).toHaveLength(1);
    expect((await api(`${STAFF}?branchId=${other.id}`, { cookie: admin.cookie })).status).toBe(404);
    const forbidden = await api(STAFF, { method: "POST", cookie: admin.cookie, body: person({ branchId: other.id }) });
    expect([forbidden.status, forbidden.json.error.code]).toEqual([403, "FORBIDDEN"]);
    const theirs = (await api(STAFF, { method: "POST", cookie: otherAdmin.cookie, body: person({ branchId: other.id }) })).json.data.staff;
    const foreign = await api(`${STAFF}/${theirs.id}`, { method: "PATCH", cookie: admin.cookie, body: { firstName: "Hijack" } });
    const unknown = await api(`${STAFF}/nope`, { method: "PATCH", cookie: admin.cookie, body: { firstName: "Hijack" } });
    expect([foreign.status, foreign.json]).toEqual([404, unknown.json]);
    expect((await api(`${STAFF}/${theirs.id}`, { cookie: admin.cookie })).status).toBe(404);
    expect((await api(`${STAFF}/${theirs.id}/archive`, { method: "POST", cookie: admin.cookie })).status).toBe(404);
  });

  test("validation reaches the caller; a duplicate live email is a 409; edit, archive and restore are audited and idempotent; nothing returns exception text", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const bad = await api(STAFF, { method: "POST", cookie, body: person({ firstName: "  ", email: "nope" }) });
    expect(bad.status).toBe(400);
    expect((await api(STAFF, { method: "POST", cookie, body: { ...person(), extra: 1 } })).status).toBe(400);
    const a = (await api(STAFF, { method: "POST", cookie, body: person({ email: "Amina@Example.com" }) })).json.data.staff;
    expect(a.email).toBe("amina@example.com"); // lower-cased
    const dup = await api(STAFF, { method: "POST", cookie, body: person({ firstName: "Dup", email: "amina@example.com" }) });
    expect([dup.status, dup.json.error.code]).toEqual([409, "CONFLICT"]);
    const edited = await api(`${STAFF}/${a.id}`, { method: "PATCH", cookie, body: { lastName: "Bello", phone: "+234 801 234 5678" } });
    expect(edited.json.data.staff).toMatchObject({ lastName: "Bello", phone: "+234 801 234 5678" });
    expect((await api(`${STAFF}/${a.id}`, { method: "PATCH", cookie, body: {} })).status).toBe(400);
    expect((await api(`${STAFF}/${a.id}/archive`, { method: "POST", cookie })).json.data.staff.archived).toBe(true);
    expect((await api(`${STAFF}/${a.id}/archive`, { method: "POST", cookie })).status).toBe(200); // idempotent
    expect((await api(`${STAFF}/${a.id}`, { method: "PATCH", cookie, body: { lastName: "X" } })).status).toBe(409); // archived: restore first
    expect((await api(`${STAFF}?branchId=${home.id}`, { cookie })).json.data.staff).toHaveLength(0);
    expect((await api(`${STAFF}?branchId=${home.id}&status=archived`, { cookie })).json.data.staff).toHaveLength(1);
    expect((await api(`${STAFF}/${a.id}/restore`, { method: "POST", cookie })).json.data.staff.archived).toBe(false);
    const actions = (
      await db.auditLog.findMany({ where: { actorUserId: user.id, targetType: "StaffRecord" }, orderBy: { createdAt: "asc" } })
    ).map((r) => r.action);
    expect(actions).toEqual(["STAFF_CREATED", "STAFF_UPDATED", "STAFF_ARCHIVED", "STAFF_RESTORED"]);
  });
});

test.describe("the sign-in account", () => {
  test("only an active member of the SAME branch with the matching role links, once; unlinking leaves the account alone; a linked record keeps its category", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const clerk = await asRole(Role.NON_TEACHING_STAFF);
    const away = await asRole(Role.TEACHING_STAFF, other.id);
    const gone = await asRole(Role.TEACHING_STAFF);
    await db.membership.updateMany({ where: { userId: gone.user.id }, data: { deactivatedAt: new Date() } });
    const rec = (await api(STAFF, { method: "POST", cookie: admin.cookie, body: person() })).json.data.staff;
    const link = (userId: string, id = rec.id) => api(`${STAFF}/${id}/account`, { method: "PUT", cookie: admin.cookie, body: { userId } });

    const offered = (await api(`${STAFF}/${rec.id}/account`, { cookie: admin.cookie })).json.data.accounts.map(
      (a: { userId: string }) => a.userId,
    );
    expect(offered).toEqual([teacher.user.id]); // not the clerk (role), not the other branch, not the deactivated member
    for (const wrong of [clerk.user.id, away.user.id, gone.user.id, "nobody"]) {
      const refused = await link(wrong);
      expect([refused.status, refused.json.error.code]).toEqual([409, "CONFLICT"]);
    }
    const linked = await link(teacher.user.id);
    expect(linked.json.data.staff.account).toMatchObject({
      state: "linked",
      userId: teacher.user.id,
      role: "TEACHING_STAFF",
      roleDiffers: false,
    });
    expect((await link(teacher.user.id)).status).toBe(409); // already linked
    const second = (await api(STAFF, { method: "POST", cookie: admin.cookie, body: person({ firstName: "Second" }) })).json.data.staff;
    expect((await link(teacher.user.id, second.id)).status).toBe(409); // that person is taken
    expect((await api(`${STAFF}/${rec.id}`, { method: "PATCH", cookie: admin.cookie, body: { category: "NON_TEACHING" } })).status).toBe(
      409,
    );
    expect((await api(`${STAFF}/${rec.id}/account`, { cookie: teacher.cookie })).status).toBe(403); // staff cannot manage links

    const unlinked = await api(`${STAFF}/${rec.id}/account`, { method: "DELETE", cookie: admin.cookie });
    expect(unlinked.json.data.staff.account).toEqual({ state: "none" });
    expect((await api(`${STAFF}/${rec.id}/account`, { method: "DELETE", cookie: admin.cookie })).status).toBe(409);
    expect(await db.membership.count({ where: { userId: teacher.user.id, branchId: home.id, deactivatedAt: null } })).toBe(1);
  });
});

test.describe("assignments", () => {
  test("the class must study the subject; everything live and in the branch; no duplicates; archiving needs them removed; every step audited", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
    const maths = await db.subject.create({ data: { branchId: home.id, name: "Maths" } });
    const art = await db.subject.create({ data: { branchId: home.id, name: "Art" } });
    const theirs = await db.subject.create({ data: { branchId: other.id, name: "Maths" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: group.id, subjectId: maths.id } });
    const rec = (await api(STAFF, { method: "POST", cookie, body: person() })).json.data.staff;
    const assign = (subjectId: string, classArmId: string) =>
      api(`${STAFF}/${rec.id}/assignments`, { method: "POST", cookie, body: { subjectId, classArmId } });

    expect((await assign(art.id, arm.id)).status).toBe(409); // JSS 1 does not study Art
    expect((await assign(theirs.id, arm.id)).status).toBe(409); // another branch's subject
    expect((await assign("nope", arm.id)).status).toBe(409);
    const made = await assign(maths.id, arm.id);
    expect(made.status).toBe(201);
    expect(made.json.data.assignment).toMatchObject({ subjectName: "Maths", armName: "A", classGroupName: "JSS 1" });
    expect((await assign(maths.id, arm.id)).status).toBe(409); // duplicate

    const detail = (await api(`${STAFF}/${rec.id}`, { cookie })).json.data;
    expect(detail.assignments).toHaveLength(1);
    expect(detail.staff.assignmentCount).toBe(1);
    const blocked = await api(`${STAFF}/${rec.id}/archive`, { method: "POST", cookie });
    expect([blocked.status, blocked.json.error.code]).toEqual([409, "CONFLICT"]);

    const wrongRecord = (await api(STAFF, { method: "POST", cookie, body: person({ firstName: "Other" }) })).json.data.staff;
    const notTheirs = await api(`${STAFF}/${wrongRecord.id}/assignments/${made.json.data.assignment.id}`, { method: "DELETE", cookie });
    expect(notTheirs.status).toBe(404);
    expect((await api(`${STAFF}/${rec.id}/assignments/${made.json.data.assignment.id}`, { method: "DELETE", cookie })).status).toBe(200);
    expect((await api(`${STAFF}/${rec.id}/assignments/${made.json.data.assignment.id}`, { method: "DELETE", cookie })).status).toBe(404);
    expect((await api(`${STAFF}/${rec.id}/archive`, { method: "POST", cookie })).status).toBe(200);
    expect((await assign(maths.id, arm.id)).status).toBe(409); // archived record: restore first

    const actions = (
      await db.auditLog.findMany({
        where: { actorUserId: user.id, action: { in: ["STAFF_ASSIGNED", "STAFF_UNASSIGNED"] } },
        orderBy: { createdAt: "asc" },
      })
    ).map((r) => r.action);
    expect(actions).toEqual(["STAFF_ASSIGNED", "STAFF_UNASSIGNED"]);
  });
});
