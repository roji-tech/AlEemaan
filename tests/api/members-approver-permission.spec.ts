import "../support/env";
import { test, expect } from "@playwright/test";
import { Permission } from "@prisma/client";
import { Role, codeFor, createUser, db, enableMfa, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Who may approve results is a superadmin's decision, confirmed with a fresh proof (task 0039, decisions 1, 2 and 4). PATCH /members/[id] { canApproveResults, stepUp }:
// turning it on gives the person the permission and a General scope (the whole branch) for the superadmin to narrow; turning it off, a role that cannot hold it, or a
// move to another branch removes where they approve. Every change is audited, and nothing is half done.

let branches: { id: string; name: string }[];
let superAdmin: TestUser;
let branchAdmin: TestUser;
const cookie: Record<string, string> = {};

const member = (id: string) => `/api/v1/members/${id}`;
const password = (who: TestUser) => ({ type: "password", value: who.password });
const patch = (who: string, membershipId: string, body: object) =>
  api(member(membershipId), { method: "PATCH", cookie: cookie[who], body });
const grant = (membershipId: string, extra: object = {}) =>
  patch("super", membershipId, { canApproveResults: true, stepUp: password(superAdmin), ...extra });

async function newMember(role: Role = Role.TEACHING_STAFF, branch = 0) {
  const user = await createUser({ name: "New Member", superAdmin: false });
  const m = await db.membership.create({ data: { userId: user.id, branchId: branches[branch].id, role } });
  return { user, membershipId: m.id, branchId: branches[branch].id };
}
const holds = async (membershipId: string) =>
  (await db.membership.findUniqueOrThrow({ where: { id: membershipId } })).permissions.includes(Permission.CAN_APPROVE_RESULTS);
const scopesOf = async (userId: string, branchId: string) =>
  db.resultApprovalScope.findMany({ where: { userId, branchId }, orderBy: { id: "asc" } });
const auditRows = (action: string, targetId: string) =>
  db.auditLog.findMany({ where: { action, targetId }, orderBy: { createdAt: "asc" } });

test.beforeAll(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  superAdmin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
  branchAdmin = await createUser({ name: "Bola BranchAdmin", superAdmin: false });
  await db.membership.create({ data: { userId: branchAdmin.id, branchId: branches[0].id, role: Role.ADMIN } });
  for (const [key, who] of [
    ["super", superAdmin],
    ["branch", branchAdmin],
  ] as const) {
    const res = await loginAs(who);
    expect(res.status).toBe(200);
    cookie[key] = cookieHeader(res.token!);
  }
});
test.afterAll(async () => {
  await resetDatabase();
});

test.describe("turning it on", () => {
  test("a superadmin with a password gives the permission and a General scope, and both changes are audited", async () => {
    const m = await newMember();
    const res = await grant(m.membershipId);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.member.canApproveResults).toBe(true);
    expect(res.json.data.changed).toBe(true);
    expect(await holds(m.membershipId)).toBe(true);
    const scopes = await scopesOf(m.user.id, m.branchId);
    expect(scopes.map((s) => s.kind)).toEqual(["GENERAL"]);
    expect(scopes[0].createdById).toBe(superAdmin.id);
    const permission = await auditRows("MEMBER_PERMISSIONS_CHANGED", m.membershipId);
    expect(permission).toHaveLength(1);
    expect([permission[0].beforeValue, permission[0].afterValue]).toEqual([{ canApproveResults: false }, { canApproveResults: true }]);
    const scope = await auditRows("RESULT_APPROVAL_SCOPE_CHANGED", m.membershipId);
    expect(scope[0].afterValue).toMatchObject({ scopes: [{ kind: "GENERAL" }], grantedWith: "CAN_APPROVE_RESULTS" });
  });

  test("the list says who approves, and turning it on again changes nothing and writes nothing", async () => {
    const m = await newMember(Role.NON_TEACHING_STAFF);
    expect((await grant(m.membershipId)).status).toBe(200);
    const list = await api(`/api/v1/members?q=New`, { cookie: cookie.super });
    expect(list.json.data.members.find((x: { id: string }) => x.id === m.membershipId).canApproveResults).toBe(true);
    const again = await grant(m.membershipId);
    expect(again.status).toBe(200);
    expect(again.json.data.changed).toBe(false);
    expect(await scopesOf(m.user.id, m.branchId)).toHaveLength(1);
    expect(await auditRows("MEMBER_PERMISSIONS_CHANGED", m.membershipId)).toHaveLength(1);
  });

  test("a narrowed scope survives a change that leaves the permission alone", async () => {
    const m = await newMember();
    expect((await grant(m.membershipId)).status).toBe(200);
    const group = await db.classGroup.create({ data: { branchId: m.branchId, name: `JSS ${Math.random()}` } });
    await db.resultApprovalScope.deleteMany({ where: { userId: m.user.id, branchId: m.branchId } });
    await db.resultApprovalScope.create({ data: { branchId: m.branchId, userId: m.user.id, kind: "CLASS", classGroupId: group.id } });
    expect((await patch("super", m.membershipId, { role: "NON_TEACHING_STAFF" })).status).toBe(200);
    expect((await scopesOf(m.user.id, m.branchId)).map((s) => s.kind)).toEqual(["CLASS"]);
    expect(await holds(m.membershipId)).toBe(true);
  });
});

test.describe("who may, and the proof", () => {
  test("it needs the proof: none is a 400, and a wrong password is a 403 that changes nothing", async () => {
    const m = await newMember();
    const none = await patch("super", m.membershipId, { canApproveResults: true });
    expect(none.status).toBe(400);
    const wrong = await grant(m.membershipId, { stepUp: { type: "password", value: "not-the-password-1" } });
    expect(wrong.status).toBe(403);
    expect(wrong.json.error.code).toBe("WRONG_PASSWORD");
    expect(await holds(m.membershipId)).toBe(false);
    expect(await scopesOf(m.user.id, m.branchId)).toHaveLength(0);
  });

  test("a branch administrator cannot, even with the right password: only a superadmin says who approves results", async () => {
    const m = await newMember();
    const res = await patch("branch", m.membershipId, { canApproveResults: true, stepUp: password(branchAdmin) });
    expect(res.status).toBe(403);
    expect(await holds(m.membershipId)).toBe(false);
    // the rest of the dialog still works for them
    expect((await patch("branch", m.membershipId, { role: "NON_TEACHING_STAFF" })).status).toBe(200);
  });

  test("with two-step verification on, the code is the proof and the password is not accepted", async () => {
    const mfaAdmin = await createUser({ name: "Mia Mfa", role: Role.ADMIN });
    const cookieMfa = cookieHeader((await loginAs(mfaAdmin)).token!);
    const factor = await enableMfa(mfaAdmin.id);
    const m = await newMember();
    const withPassword = await api(member(m.membershipId), {
      method: "PATCH",
      cookie: cookieMfa,
      body: { canApproveResults: true, stepUp: password(mfaAdmin) },
    });
    expect(withPassword.status).toBe(403);
    expect(withPassword.json.error.code).toBe("INVALID_MFA_CODE");
    expect(await holds(m.membershipId)).toBe(false);
    const withCode = await api(member(m.membershipId), {
      method: "PATCH",
      cookie: cookieMfa,
      body: { canApproveResults: true, stepUp: { type: "totp", value: codeFor(factor.secret) } },
    });
    expect(withCode.status, withCode.text).toBe(200);
    expect(await holds(m.membershipId)).toBe(true);
  });

  test("only teaching and non-teaching staff can hold it: an administrator, a pupil and a parent are refused", async () => {
    for (const role of [Role.ADMIN, Role.STUDENT, Role.PARENT]) {
      const m = await newMember(role);
      const res = await grant(m.membershipId);
      expect(res.status, `${role}: ${res.text}`).toBe(409);
      expect(res.json.error.code).toBe("NOT_APPROVER_ROLE");
      expect(await holds(m.membershipId)).toBe(false);
    }
  });

  test("a body with an unknown key is refused, and nothing is changed", async () => {
    const m = await newMember();
    const res = await grant(m.membershipId, { permissions: ["CAN_MANAGE_FINANCE"] });
    expect(res.status).toBe(400);
    expect(await holds(m.membershipId)).toBe(false);
  });
});

test.describe("turning it off, and what else removes it", () => {
  test("turning it off removes the permission and every scope, and says so in the audit", async () => {
    const m = await newMember();
    expect((await grant(m.membershipId)).status).toBe(200);
    const off = await patch("super", m.membershipId, { canApproveResults: false, stepUp: password(superAdmin) });
    expect(off.status, off.text).toBe(200);
    expect(await holds(m.membershipId)).toBe(false);
    expect(await scopesOf(m.user.id, m.branchId)).toHaveLength(0);
    const scope = await auditRows("RESULT_APPROVAL_SCOPE_CHANGED", m.membershipId);
    expect(scope.at(-1)?.afterValue).toMatchObject({ scopes: [], removedWith: "CAN_APPROVE_RESULTS" });
  });

  test("a role that cannot hold it takes it away by itself, in the same change", async () => {
    const m = await newMember();
    expect((await grant(m.membershipId)).status).toBe(200);
    expect((await patch("super", m.membershipId, { role: "PARENT" })).status).toBe(200);
    expect(await holds(m.membershipId)).toBe(false);
    expect(await scopesOf(m.user.id, m.branchId)).toHaveLength(0);
  });

  test("a move to another branch keeps the permission and removes the scopes, which name sections and classes of one branch", async () => {
    const m = await newMember(Role.TEACHING_STAFF, 0);
    expect((await grant(m.membershipId)).status).toBe(200);
    const section = await db.section.create({ data: { branchId: branches[0].id, name: `Junior ${Math.random()}` } });
    await db.resultApprovalScope.deleteMany({ where: { userId: m.user.id } });
    await db.resultApprovalScope.create({ data: { branchId: branches[0].id, userId: m.user.id, kind: "SECTION", sectionId: section.id } });
    const moved = await patch("super", m.membershipId, { branchId: branches[1].id });
    expect(moved.status, moved.text).toBe(200);
    expect(await holds(m.membershipId)).toBe(true);
    expect(await scopesOf(m.user.id, branches[0].id)).toHaveLength(0);
    expect(await scopesOf(m.user.id, branches[1].id)).toHaveLength(0); // approves nothing in the new branch until given somewhere
    const scope = await auditRows("RESULT_APPROVAL_SCOPE_CHANGED", m.membershipId);
    expect(scope.at(-1)?.afterValue).toMatchObject({ scopes: [], removedWith: "branch change" });
  });

  test("a deactivated member must be reactivated first", async () => {
    const m = await newMember();
    await db.membership.update({ where: { id: m.membershipId }, data: { deactivatedAt: new Date() } });
    const res = await grant(m.membershipId);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DEACTIVATED");
  });
});
