import "../support/env";
import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { hashInvitationToken } from "@/lib/invitations/token";

// Task 0117 over real HTTP (the maintainer, 2026-11-20): the staff of every branch in one list, a superadmin deleting a record that has no history, and the history of invitations.

let home: { id: string; name: string };
let other: { id: string; name: string };
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
  // A superadmin holds at least one membership (a superadmin flag alone grants nothing); `role: ADMIN` gives both.
  const user = await createUser({ role: Role.ADMIN, name: "Sam Super" });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
let n = 0;
const record = (branchId: string, extra: object = {}) =>
  db.staffRecord.create({
    data: {
      branchId,
      category: "TEACHING",
      firstName: `Amina${++n}`,
      lastName: "Yusuf",
      email: `amina${n}-${Date.now()}@school.example`,
      ...extra,
    },
  });
const STAFF = "/api/v1/staff";

test.describe("GET /staff?branchId=all", () => {
  test("a superadmin gets every branch, each record naming its branch; a branch administrator and a teacher only their own; a parent and a stranger none", async () => {
    const a = await record(home.id, { firstName: "Zed", lastName: "Home" });
    const b = await record(other.id, { firstName: "Yan", lastName: "Other" });
    const boss = await superAdmin();
    const all = await api(`${STAFF}?branchId=all`, { cookie: boss.cookie });
    expect(all.status).toBe(200);
    const byId = new Map<string, { branchId: string; branchName: string }>(
      all.json.data.staff.map((s: { id: string; branchId: string; branchName: string }) => [s.id, s]),
    );
    expect(byId.get(a.id)).toMatchObject({ branchId: home.id, branchName: home.name });
    expect(byId.get(b.id)).toMatchObject({ branchId: other.id, branchName: other.name });
    expect(all.json.data.truncated).toBe(false);

    const homeAdmin = await asRole(Role.ADMIN);
    const mine = await api(`${STAFF}?branchId=all`, { cookie: homeAdmin.cookie });
    const ids = mine.json.data.staff.map((s: { id: string }) => s.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await api(`${STAFF}?branchId=all`, { cookie: teacher.cookie })).json.data.staff.map((s: { id: string }) => s.id)).not.toContain(
      b.id,
    );
    // Someone in two branches sees both.
    const both = await asRole(Role.TEACHING_STAFF, [home.id, other.id]);
    expect((await api(`${STAFF}?branchId=all`, { cookie: both.cookie })).json.data.staff.map((s: { id: string }) => s.id)).toEqual(
      expect.arrayContaining([a.id, b.id]),
    );
    const parent = await asRole(Role.PARENT);
    expect((await api(`${STAFF}?branchId=all`, { cookie: parent.cookie })).status).toBe(403);
    expect((await api(`${STAFF}?branchId=all`)).status).toBe(401);
  });

  test("search and the archived filter work across branches; a single branch's id is still a 404 for someone outside it", async () => {
    const a = await record(home.id, { firstName: "Findme", lastName: "Alpha" });
    await record(other.id, { firstName: "Findme", lastName: "Beta", archivedAt: new Date() });
    await record(other.id, { firstName: "Someone", lastName: "Else" });
    const boss = await superAdmin();
    const found = await api(`${STAFF}?branchId=all&q=Findme`, { cookie: boss.cookie });
    expect(found.json.data.staff.map((s: { lastName: string }) => s.lastName)).toEqual(["Alpha"]); // the archived one is not "live"
    const archived = await api(`${STAFF}?branchId=all&q=Findme&status=archived`, { cookie: boss.cookie });
    expect(archived.json.data.staff.map((s: { lastName: string }) => s.lastName)).toEqual(["Beta"]);
    const outsider = await asRole(Role.ADMIN, [other.id]);
    expect((await api(`${STAFF}?branchId=${home.id}`, { cookie: outsider.cookie })).status).toBe(404);
    expect(a.id).toBeTruthy();
  });
});

test.describe("DELETE /staff/[id]", () => {
  test("a superadmin deletes a record with no history, audited; the account and its membership stay", async () => {
    const boss = await superAdmin();
    const member = await createUser({ name: "Main Super" });
    await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.ADMIN } });
    const mine = await record(home.id, { firstName: "Mistake", lastName: "Entry", email: member.email, userId: member.id });
    const res = await api(`${STAFF}/${mine.id}`, { method: "DELETE", cookie: boss.cookie });
    expect([res.status, res.json.data.deleted.id]).toEqual([200, mine.id]);
    expect(await db.staffRecord.count({ where: { id: mine.id } })).toBe(0);
    expect(await db.membership.count({ where: { userId: member.id, branchId: home.id } })).toBe(1);
    expect(await db.user.count({ where: { id: member.id } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "STAFF_DELETED", targetId: mine.id } });
    expect(audit.actorUserId).toBe(boss.user.id);
    expect(audit.beforeValue).toMatchObject({ branchId: home.id, firstName: "Mistake", lastName: "Entry", linkedUserId: member.id });
    // Gone: the same call is a 404.
    expect((await api(`${STAFF}/${mine.id}`, { method: "DELETE", cookie: boss.cookie })).status).toBe(404);
  });

  test("who may: an administrator of the branch is 403 (archive instead), a teacher 403, another branch's administrator 404, signed out 401", async () => {
    const mine = await record(home.id);
    const homeAdmin = await asRole(Role.ADMIN);
    const refused = await api(`${STAFF}/${mine.id}`, { method: "DELETE", cookie: homeAdmin.cookie });
    expect([refused.status, refused.json.error.code]).toEqual([403, "FORBIDDEN"]);
    expect((await api(`${STAFF}/${mine.id}`, { method: "DELETE", cookie: (await asRole(Role.TEACHING_STAFF)).cookie })).status).toBe(403);
    expect((await api(`${STAFF}/${mine.id}`, { method: "DELETE", cookie: (await asRole(Role.ADMIN, [other.id])).cookie })).status).toBe(
      404,
    );
    expect((await api(`${STAFF}/${mine.id}`, { method: "DELETE" })).status).toBe(401);
    expect(await db.staffRecord.count({ where: { id: mine.id } })).toBe(1);
  });

  test("a record with history is refused with the reasons and what to do instead, and nothing is deleted", async () => {
    const boss = await superAdmin();
    const teacher = await record(home.id);
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 1 } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A", classTeacherId: teacher.id } });
    const maths = await db.subject.create({ data: { branchId: home.id, name: "Maths" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: group.id, subjectId: maths.id } });
    await db.staffSubjectAssignment.create({
      data: { branchId: home.id, staffRecordId: teacher.id, subjectId: maths.id, classArmId: arm.id },
    });
    const res = await api(`${STAFF}/${teacher.id}`, { method: "DELETE", cookie: boss.cookie });
    expect([res.status, res.json.error.code]).toEqual([409, "CONFLICT"]);
    expect(res.json.error.message).toContain("teaches 1 subject in a class");
    expect(res.json.error.message).toContain("class teacher of 1 class arm");
    expect(res.json.error.message).toContain("Archive it instead");
    expect(await db.staffRecord.count({ where: { id: teacher.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "STAFF_DELETED" } })).toBe(0);
  });
});

test.describe("the history of invitations", () => {
  const openInvitation = (email: string, extra: object = {}, branchId = home.id, role: Role = Role.TEACHING_STAFF) =>
    db.invitation.create({
      data: {
        email,
        role,
        branchId,
        sentAt: new Date(),
        tokenHash: hashInvitationToken(randomBytes(32).toString("base64url")),
        expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        ...extra,
      },
    });

  test("a manual revoke is audited with the address, role and branch; the history lists it with who revoked and why; open invitations are not in it", async () => {
    const admin = await asRole(Role.ADMIN);
    const open = await openInvitation(`open-${Date.now()}@school.example`);
    const doomed = await openInvitation(`doomed-${Date.now()}@school.example`);
    const revoke = await api(`/api/v1/invitations/${doomed.id}`, { method: "DELETE", cookie: admin.cookie });
    expect(revoke.status).toBe(200);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "INVITATION_REVOKED", targetId: doomed.id } });
    expect(audit.actorUserId).toBe(admin.user.id);
    expect(audit.afterValue).toMatchObject({ email: doomed.email, role: Role.TEACHING_STAFF, branchId: home.id });
    expect(audit.reason).toBe("revoked by an administrator");

    const history = await api("/api/v1/invitations/history", { cookie: admin.cookie });
    expect(history.status).toBe(200);
    const rows = history.json.data.invitations as {
      id: string;
      revokedByName: string | null;
      revokedWhy: string | null;
      revokedAt: string | null;
    }[];
    expect(rows.map((r) => r.id)).toEqual([doomed.id]);
    expect(rows[0].revokedByName).toBeTruthy();
    expect(rows[0].revokedWhy).toBe("revoked by an administrator");
    expect(rows.map((r) => r.id)).not.toContain(open.id);
  });

  test("accepted and run-out invitations are in the history; replacing an open invitation records the older one as replaced", async () => {
    const admin = await asRole(Role.ADMIN);
    const accepted = await openInvitation(`accepted-${Date.now()}@school.example`, { acceptedAt: new Date() });
    const ranOut = await openInvitation(`ranout-${Date.now()}@school.example`, { expiresAt: new Date(Date.now() - 24 * 3600 * 1000) });
    const email = `again-${Date.now()}@school.example`;
    const first = await openInvitation(email);
    const second = await api("/api/v1/invitations", {
      method: "POST",
      cookie: admin.cookie,
      body: { email, role: "TEACHING_STAFF", branchId: home.id },
    });
    expect(second.status).toBe(201);
    const rows = (await api("/api/v1/invitations/history", { cookie: admin.cookie })).json.data.invitations as {
      id: string;
      acceptedAt: string | null;
      revokedWhy: string | null;
    }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(accepted.id)?.acceptedAt).toBeTruthy();
    expect(byId.has(ranOut.id)).toBe(true);
    expect(byId.get(first.id)?.revokedWhy).toBe("replaced by a new invitation");
    expect(byId.has(second.json.data.invitation.id)).toBe(false); // the new one is open
  });

  test("scope: a branch administrator sees only their branches' history and never an administrator's; a superadmin sees all; a teacher is refused", async () => {
    const mineRevoked = await openInvitation(`mine-${Date.now()}@school.example`, { revokedAt: new Date() });
    const elsewhere = await openInvitation(`else-${Date.now()}@school.example`, { revokedAt: new Date() }, other.id);
    const anAdmin = await openInvitation(`boss-${Date.now()}@school.example`, { revokedAt: new Date() }, home.id, Role.ADMIN);
    const branchAdmin = await asRole(Role.ADMIN);
    const seen = (await api("/api/v1/invitations/history", { cookie: branchAdmin.cookie })).json.data.invitations.map(
      (r: { id: string }) => r.id,
    );
    expect(seen).toContain(mineRevoked.id);
    expect(seen).not.toContain(elsewhere.id);
    expect(seen).not.toContain(anAdmin.id);
    const boss = await superAdmin();
    const everything = (await api("/api/v1/invitations/history", { cookie: boss.cookie })).json.data.invitations.map(
      (r: { id: string }) => r.id,
    );
    expect(everything).toEqual(expect.arrayContaining([mineRevoked.id, elsewhere.id, anAdmin.id]));
    expect((await api("/api/v1/invitations/history", { cookie: (await asRole(Role.TEACHING_STAFF)).cookie })).status).toBe(403);
    expect((await api("/api/v1/invitations/history")).status).toBe(401);
  });
});
