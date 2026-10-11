import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, DEFAULT_PASSWORD, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Branch administrators and superadmins over real HTTP (plan S3, S5; ADR 0012's interim bullet): what a branch administrator may do in their
// own branch, what only a superadmin may do, and how a superadmin grants and revokes the authority.

const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 8)}@invite.test`;

let branches: { id: string; name: string }[];
let superAdmin: TestUser; // ADMIN in branch 0 + the school-wide flag
let branchAdmin: TestUser; // ADMIN in branch 0 only
let teacherHere: TestUser; // branch 0
let teacherThere: TestUser; // branch 1
let cookie: Record<string, string> = {};
const membershipOf = (userId: string) => db.membership.findFirstOrThrow({ where: { userId } });
const as = (who: string, extra: object = {}) => ({ cookie: cookie[who], ...extra });
const FORBIDDEN = { data: null, meta: {}, error: { code: "FORBIDDEN", message: "You don't have permission to do that" } };

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
async function memberIn(role: Role, branch: number, name: string) {
  const user = await createUser({ name });
  const m = await db.membership.create({ data: { userId: user.id, branchId: branches[branch].id, role } });
  return { ...user, membershipId: m.id };
}

test.beforeAll(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  superAdmin = await createUser({ name: "Sade Superadmin", role: Role.ADMIN }); // flag by default
  branchAdmin = await createUser({ name: "Bola Branchadmin", role: Role.ADMIN, superAdmin: false });
  teacherHere = await createUser({ name: "Tola Here", role: Role.TEACHING_STAFF });
  teacherThere = await createUser({ name: "Uche There" });
  await db.membership.create({ data: { userId: teacherThere.id, branchId: branches[1].id, role: Role.TEACHING_STAFF } });
  cookie = { super: await cookieFor(superAdmin), branch: await cookieFor(branchAdmin), teacher: await cookieFor(teacherHere) };
});

test.describe("members — a branch administrator", () => {
  test("lists only the people of their own branch; a superadmin lists everyone", async () => {
    const mine = (await api("/api/v1/members?status=all", as("branch"))).json.data.members as { userId: string }[];
    expect(mine.map((m) => m.userId)).toEqual(expect.arrayContaining([branchAdmin.id, teacherHere.id]));
    expect(mine.map((m) => m.userId)).not.toContain(teacherThere.id);
    expect((await api(`/api/v1/members?branchId=${branches[1].id}`, as("branch"))).json.data.members).toEqual([]);

    const all = (await api("/api/v1/members?status=all", as("super"))).json.data.members as { userId: string }[];
    expect(all.map((m) => m.userId)).toContain(teacherThere.id);
  });

  test("changes a teacher of their own branch; another branch's member is a 404, the same as an unknown id", async () => {
    const here = await memberIn(Role.TEACHING_STAFF, 0, "Edit Me");
    const there = await memberIn(Role.TEACHING_STAFF, 1, "Not Yours");
    const ok = await api(
      `/api/v1/members/${here.membershipId}`,
      as("branch", { method: "PATCH", body: { role: Role.NON_TEACHING_STAFF } }),
    );
    expect(ok.status).toBe(200);
    expect(ok.json.data.member.role).toBe("NON_TEACHING_STAFF");

    const foreign = await api(`/api/v1/members/${there.membershipId}`, as("branch", { method: "PATCH", body: { role: Role.PARENT } }));
    const unknown = await api("/api/v1/members/no-such-membership", as("branch", { method: "PATCH", body: { role: Role.PARENT } }));
    expect(foreign.status).toBe(404);
    expect(foreign.json).toEqual(unknown.json);
    expect((await membershipOf(there.id)).role).toBe("TEACHING_STAFF");
    expect((await api(`/api/v1/members/${there.membershipId}/deactivate`, as("branch", { method: "POST", body: {} }))).status).toBe(404);
    expect((await api(`/api/v1/members/${there.membershipId}/reactivate`, as("branch", { method: "POST", body: {} }))).status).toBe(404);
  });

  test("cannot make an administrator, touch one, or touch a superadmin (403), and cannot move a person to another branch (403)", async () => {
    const here = await memberIn(Role.TEACHING_STAFF, 0, "Promote Me");
    const colleague = await createUser({ role: Role.ADMIN, superAdmin: false }); // another branch admin of branch 0
    const colleagueM = await membershipOf(colleague.id);
    const superM = await membershipOf(superAdmin.id);

    const promote = await api(`/api/v1/members/${here.membershipId}`, as("branch", { method: "PATCH", body: { role: Role.ADMIN } }));
    expect(promote.status).toBe(403);
    expect(promote.json.error.code).toBe("FORBIDDEN");
    for (const id of [colleagueM.id, superM.id]) {
      expect((await api(`/api/v1/members/${id}`, as("branch", { method: "PATCH", body: { role: Role.PARENT } }))).status).toBe(403);
      expect((await api(`/api/v1/members/${id}/deactivate`, as("branch", { method: "POST", body: {} }))).status).toBe(403);
      expect((await api(`/api/v1/members/${id}/reactivate`, as("branch", { method: "POST", body: {} }))).status).toBe(403);
    }
    const move = await api(`/api/v1/members/${here.membershipId}`, as("branch", { method: "PATCH", body: { branchId: branches[1].id } }));
    expect(move.status).toBe(403);
    expect(await db.membership.findUniqueOrThrow({ where: { id: here.membershipId } })).toMatchObject({
      role: "TEACHING_STAFF",
      branchId: branches[0].id,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: colleague.id } })).toMatchObject({ isSuperAdmin: false });
  });

  test("a superadmin can do the same things: make an administrator, move a person", async () => {
    const here = await memberIn(Role.TEACHING_STAFF, 0, "Promoted");
    const res = await api(
      `/api/v1/members/${here.membershipId}`,
      as("super", { method: "PATCH", body: { role: Role.ADMIN, branchId: branches[1].id } }),
    );
    expect(res.status).toBe(200);
    expect(res.json.data.member).toMatchObject({ role: "ADMIN", branchId: branches[1].id, isSuperAdmin: false });
  });

  test("a teacher is still a 403 on every members route", async () => {
    const m = await memberIn(Role.TEACHING_STAFF, 0, "Anyone");
    expect((await api("/api/v1/members", as("teacher"))).json).toEqual(FORBIDDEN);
    expect((await api(`/api/v1/members/${m.membershipId}`, as("teacher", { method: "PATCH", body: { role: Role.PARENT } }))).json).toEqual(
      FORBIDDEN,
    );
  });
});

test.describe("invitations — a branch administrator", () => {
  test("invites to their own branch below ADMIN; other branches and ADMIN are 403; a superadmin invites an administrator anywhere", async () => {
    const own = await api(
      "/api/v1/invitations",
      as("branch", { method: "POST", body: { email: unique("own"), role: Role.TEACHING_STAFF, branchId: branches[0].id } }),
    );
    expect(own.status).toBe(201);
    const elsewhere = await api(
      "/api/v1/invitations",
      as("branch", { method: "POST", body: { email: unique("else"), role: Role.TEACHING_STAFF, branchId: branches[1].id } }),
    );
    expect(elsewhere.status).toBe(403);
    const admin = await api(
      "/api/v1/invitations",
      as("branch", { method: "POST", body: { email: unique("adm"), role: Role.ADMIN, branchId: branches[0].id } }),
    );
    expect(admin.status).toBe(403);

    const asSuper = await api(
      "/api/v1/invitations",
      as("super", { method: "POST", body: { email: unique("sup"), role: Role.ADMIN, branchId: branches[1].id } }),
    );
    expect(asSuper.status).toBe(201);
  });

  test("lists, resends and revokes only the invitations of their own branch (and never an ADMIN one); the rest is a 404", async () => {
    const mine = await api(
      "/api/v1/invitations",
      as("super", { method: "POST", body: { email: unique("mine"), role: Role.PARENT, branchId: branches[0].id } }),
    );
    const theirs = await api(
      "/api/v1/invitations",
      as("super", { method: "POST", body: { email: unique("theirs"), role: Role.PARENT, branchId: branches[1].id } }),
    );
    const adminInvite = await api(
      "/api/v1/invitations",
      as("super", { method: "POST", body: { email: unique("adminvite"), role: Role.ADMIN, branchId: branches[0].id } }),
    );
    const listed = (await api("/api/v1/invitations", as("branch"))).json.data.invitations as { id: string }[];
    expect(listed.map((i) => i.id)).toContain(mine.json.data.invitation.id);
    expect(listed.map((i) => i.id)).not.toContain(theirs.json.data.invitation.id);
    expect(listed.map((i) => i.id)).not.toContain(adminInvite.json.data.invitation.id);

    for (const invitation of [theirs, adminInvite]) {
      const id = invitation.json.data.invitation.id;
      expect((await api(`/api/v1/invitations/${id}/resend`, as("branch", { method: "POST", body: {} }))).status).toBe(404);
      expect((await api(`/api/v1/invitations/${id}`, as("branch", { method: "DELETE" }))).status).toBe(404);
    }
    expect(
      (await api(`/api/v1/invitations/${mine.json.data.invitation.id}/resend`, as("branch", { method: "POST", body: {} }))).status,
    ).toBe(200);
    expect((await api(`/api/v1/invitations/${mine.json.data.invitation.id}`, as("branch", { method: "DELETE" }))).status).toBe(200);
  });
});

test.describe("PATCH /members/[id]/superadmin", () => {
  const put = (membershipId: string, who: string, body: unknown) =>
    api(`/api/v1/members/${membershipId}/superadmin`, as(who, { method: "PATCH", body }));

  test("only a superadmin: a branch administrator, a teacher and a signed-out caller are refused", async () => {
    const target = await memberIn(Role.TEACHING_STAFF, 0, "Candidate");
    expect((await put(target.membershipId, "branch", { superAdmin: true, password: DEFAULT_PASSWORD })).json).toEqual(FORBIDDEN);
    expect((await put(target.membershipId, "teacher", { superAdmin: true, password: DEFAULT_PASSWORD })).json).toEqual(FORBIDDEN);
    expect(
      (
        await api(`/api/v1/members/${target.membershipId}/superadmin`, {
          method: "PATCH",
          body: { superAdmin: true, password: DEFAULT_PASSWORD },
        })
      ).status,
    ).toBe(401);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).isSuperAdmin).toBe(false);
  });

  test("needs the caller's own password: a wrong one changes nothing; a right one grants, audits, and can be revoked again", async () => {
    const target = await memberIn(Role.TEACHING_STAFF, 0, "Candidate");
    const wrong = await put(target.membershipId, "super", { superAdmin: true, password: "not-the-password-1" });
    expect(wrong.status).toBe(400);
    expect(wrong.json.error.code).toBe("INVALID_PASSWORD");
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).isSuperAdmin).toBe(false);

    const granted = await put(target.membershipId, "super", { superAdmin: true, password: DEFAULT_PASSWORD });
    expect(granted.status).toBe(200);
    expect(granted.json.data).toMatchObject({ changed: true, member: { isSuperAdmin: true } });
    expect(await db.auditLog.findFirstOrThrow({ where: { targetId: target.id, action: "SUPERADMIN_GRANTED" } })).toMatchObject({
      actorUserId: superAdmin.id,
    });
    expect(JSON.stringify(await db.auditLog.findMany({ where: { targetId: target.id } }))).not.toContain(DEFAULT_PASSWORD);

    expect((await put(target.membershipId, "super", { superAdmin: true, password: DEFAULT_PASSWORD })).json.data.changed).toBe(false);
    const revoked = await put(target.membershipId, "super", { superAdmin: false, password: DEFAULT_PASSWORD });
    expect(revoked.json.data).toMatchObject({ changed: true, member: { isSuperAdmin: false } });
  });

  test("a body that is not exactly { superAdmin, password } is a 400; nobody changes their own (409 SELF); an unknown id is a 404", async () => {
    const target = await memberIn(Role.TEACHING_STAFF, 0, "Candidate");
    expect((await put(target.membershipId, "super", { superAdmin: true })).status).toBe(400);
    expect((await put(target.membershipId, "super", { superAdmin: "yes", password: DEFAULT_PASSWORD })).status).toBe(400);
    expect((await put(target.membershipId, "super", { superAdmin: true, password: DEFAULT_PASSWORD, userId: "x" })).status).toBe(400);
    const mine = await membershipOf(superAdmin.id);
    const self = await put(mine.id, "super", { superAdmin: false, password: DEFAULT_PASSWORD });
    expect(self.status).toBe(409);
    expect(self.json.error.code).toBe("SELF");
    expect((await put("no-such-membership", "super", { superAdmin: true, password: DEFAULT_PASSWORD })).status).toBe(404);
  });

  test("a new superadmin takes effect on their very next request", async () => {
    const target = await memberIn(Role.TEACHING_STAFF, 0, "Promoted Soon");
    const theirs = await cookieFor(target);
    expect((await api("/api/v1/members", { cookie: theirs })).status).toBe(403);
    expect((await put(target.membershipId, "super", { superAdmin: true, password: DEFAULT_PASSWORD })).status).toBe(200);
    expect((await api("/api/v1/members", { cookie: theirs })).status).toBe(200); // a superadmin satisfies ADMIN without an ADMIN membership
  });
});
