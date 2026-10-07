import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { BREACH_URL } from "../support/env";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance, uniqueIp, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs, sessionCookie } from "../support/http";
import { mailAfterGrace, tokenFrom, waitForMail } from "../support/outbox";
import { BREACHED_MESSAGE } from "@/lib/auth/pwned-password";
import { verifyPassword } from "@/lib/auth/password";
import { hashInvitationToken, newInvitationToken } from "@/lib/invitations/token";

// Invitations over real HTTP (domain-implementation-plan.md, "Build design — Users pages and invitations"): the administrator's side
// (invite, list, resend, revoke — hashed single-use links, mailed after the response, the same answer whatever the address), and the
// invitee's PUBLIC side (preview, accept) with its one rule: an existing account is attached only by its owner.

const NO_PERMISSION = { data: null, meta: {}, error: { code: "FORBIDDEN", message: "You don't have permission to do that" } };
const INVALID = {
  data: null,
  meta: {},
  error: { code: "INVALID_TOKEN", message: "This invitation link is invalid or has expired. Ask your administrator to send a new one." },
};
const BREACHED = "Tr0ub4dor&3-but-leaked";
const FRESH = "a-fresh-unseen-passphrase-3";

let admin: TestUser;
let teacher: TestUser;
let adminCookies: string[] = [];
let adminTurn = 0;
let teacherCookie: string;
let branches: { id: string; name: string }[];

const unique = (label: string) => `${label}-${crypto.randomBytes(3).toString("hex")}@invite.test`;
// The per-administrator invitation limit (30 per 5 minutes) is real, and this file sends more than that — so the school has a few
// administrators (all "Ada Admin") and the helpers take turns, exactly as a busy school's would.
const asAdmin = (extra: object = {}) => ({ cookie: adminCookies[adminTurn++ % adminCookies.length], ...extra });
const INVITATIONS = "/api/v1/invitations";
const invite = (email: string, role = "TEACHING_STAFF", extra: Record<string, unknown> = {}) =>
  api(INVITATIONS, asAdmin({ method: "POST", body: { email, role, branchId: branches[0].id, ...extra } }));
async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
/// Invites and returns the token the way the invitee gets it: from the mailed link.
async function invitedWithToken(email: string, role = "TEACHING_STAFF") {
  const res = await invite(email, role);
  expect(res.status).toBe(201);
  const mail = await waitForMail(email);
  return { res, token: tokenFrom(mail[mail.length - 1]), id: res.json.data.invitation.id as string };
}
const preview = (token: string, extra: object = {}) => api(`${INVITATIONS}/preview`, { body: { token }, ...extra });
const accept = (body: unknown, extra: object = {}) => api(`${INVITATIONS}/accept`, { body, ...extra });

test.beforeAll(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  admin = await createUser({ name: "Ada Admin", role: Role.ADMIN });
  teacher = await createUser({ name: "Tola Teacher", role: Role.TEACHING_STAFF });
  adminCookies = [await cookieFor(admin)];
  for (let i = 0; i < 5; i++) adminCookies.push(await cookieFor(await createUser({ name: "Ada Admin", role: Role.ADMIN })));
  teacherCookie = await cookieFor(teacher);
});

test.describe("POST /invitations — the administrator invites", () => {
  test("201 with the invitation (no token, no hash); the mail carries a FRAGMENT link; only the hash is stored; the audit row has no secret", async () => {
    const to = unique("new");
    const res = await invite(to, "PARENT", { branchId: branches[1].id });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.json.data.invitation).toMatchObject({
      email: to,
      role: "PARENT",
      branchId: branches[1].id,
      branchName: BRANCH_NAMES[1],
      status: "pending",
      invitedByName: "Ada Admin",
    });
    expect(res.text).not.toMatch(/token/i);

    const [mail] = await waitForMail(to);
    expect(mail.subject).toBe("You're invited to join AlEemaan");
    expect(mail.text).toContain(`Ada Admin invited you to join AlEemaan (${BRANCH_NAMES[1]}) as Parent`);
    expect(mail.text).toMatch(/\/accept-invite#token=[A-Za-z0-9_-]{43}\b/);
    expect(mail.text).not.toContain("?token=");
    const token = tokenFrom(mail);

    const row = await db.invitation.findUniqueOrThrow({ where: { id: res.json.data.invitation.id } });
    expect(row.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(await db.auditLog.findMany({ where: { targetId: row.id } }))).not.toContain(token);
    expect((await preview(token)).status).toBe(200); // and the mailed link really works
  });

  test("the SAME answer whether or not the address has an account: the administrator learns nothing about who is registered", async () => {
    const withAccount = await createUser(); // an account, no membership
    const known = await invite(withAccount.email, "PARENT");
    const unknown = await invite(unique("stranger"), "PARENT");
    expect(known.status).toBe(unknown.status);
    expect(Object.keys(known.json.data.invitation).sort()).toEqual(Object.keys(unknown.json.data.invitation).sort());
    expect(Object.keys(known.json.data)).toEqual(Object.keys(unknown.json.data));
    expect(known.json.meta).toEqual(unknown.json.meta);
    // …and both are mailed alike
    expect((await waitForMail(withAccount.email))[0].text).toContain("accept-invite#token=");
  });

  test("inviting the same address again revokes the earlier link (only the newest works)", async () => {
    const to = unique("again");
    const first = await invitedWithToken(to);
    const second = await invite(to);
    expect(second.status).toBe(201);
    const newest = tokenFrom((await waitForMail(to, 2))[1]);
    expect((await preview(first.token)).json).toEqual(INVALID);
    expect((await preview(newest)).status).toBe(200);
    expect(await db.invitation.count({ where: { email: to, acceptedAt: null, revokedAt: null } })).toBe(1);
  });

  test("an address that is already a member (409), one deactivated (409 — reactivate instead) and a bad branch (400) create nothing and send nothing", async () => {
    const gone = await createUser({ role: Role.PARENT });
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    const before = await db.invitation.count();
    const member = await invite(teacher.email);
    expect(member.status).toBe(409);
    expect(member.json.error.code).toBe("ALREADY_MEMBER");
    const deactivated = await invite(gone.email);
    expect(deactivated.status).toBe(409);
    expect(deactivated.json.error.code).toBe("DEACTIVATED_MEMBER");
    const missing = await invite(unique("branch"), "TEACHING_STAFF", { branchId: "no-such-branch" });
    expect(missing.status).toBe(400);
    expect(missing.json.error.details).toEqual([{ path: "body.branchId", message: "Choose one of the school's branches." }]);
    expect(await db.invitation.count()).toBe(before);
    expect(await mailAfterGrace(gone.email, 600)).toEqual([]);
  });

  test("validation: not an address, empty, too long, a role that does not exist, no branch, a body with extra keys — all 400, nothing created", async () => {
    const before = await db.invitation.count();
    const branchId = branches[0].id;
    for (const body of [
      { email: "not-an-address", role: "PARENT", branchId },
      { email: "", role: "PARENT", branchId },
      { email: `${"x".repeat(250)}@x.test`, role: "PARENT", branchId },
      { role: "PARENT", branchId },
      { email: unique("v"), role: "OWNER", branchId },
      { email: unique("v"), branchId },
      { email: unique("v"), role: "PARENT" },
      { email: unique("v"), role: "PARENT", branchId, tokenHash: "x" },
      { email: unique("v"), role: "PARENT", branchId: 5 },
    ]) {
      const res = await api(INVITATIONS, asAdmin({ method: "POST", body }));
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
    }
    expect((await api(INVITATIONS, asAdmin({ method: "POST", rawBody: "nope" }))).json.error.code).toBe("INVALID_BODY");
    expect(await db.invitation.count()).toBe(before);
  });

  test("the address is trimmed and lower-cased; the per-address limit (3) answers the 4th with a 429", async () => {
    const base = unique("limit");
    const res = await invite(`  ${base.toUpperCase()}  `);
    expect(res.json.data.invitation.email).toBe(base);
    expect((await invite(base)).status).toBe(201);
    expect((await invite(base)).status).toBe(201);
    const fourth = await invite(base);
    expect(fourth.status).toBe(429);
    expect(fourth.json.error.code).toBe("RATE_LIMITED");
  });

  test("a non-admin is refused with the one 403 body, and CSRF is enforced", async () => {
    const as = await api(INVITATIONS, {
      cookie: teacherCookie,
      method: "POST",
      body: { email: unique("t"), role: "PARENT", branchId: branches[0].id },
    });
    expect(as.status).toBe(403);
    expect(as.json).toEqual(NO_PERMISSION);
    const csrf = await api(
      INVITATIONS,
      asAdmin({ method: "POST", body: { email: unique("c"), role: "PARENT", branchId: branches[0].id }, origin: "https://evil.example" }),
    );
    expect(csrf.status).toBe(403);
    expect(csrf.json.error.code).toBe("CSRF");
  });

  test("a non-admin cannot RESEND or REVOKE either: the same one 403 body", async () => {
    const { id } = await invitedWithToken(unique("rs"));
    const resend = await api(`${INVITATIONS}/${id}/resend`, { cookie: teacherCookie, method: "POST", body: {} });
    expect(resend.status).toBe(403);
    expect(resend.json).toEqual(NO_PERMISSION);
    const revoke = await api(`${INVITATIONS}/${id}`, { cookie: teacherCookie, method: "DELETE" });
    expect(revoke.status).toBe(403);
    expect(revoke.json).toEqual(NO_PERMISSION);
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).revokedAt).toBeNull();
  });
});

test.describe("GET, resend, revoke", () => {
  test("the list shows the OPEN invitations with status, never a token or hash; a non-admin and a bad page are refused", async () => {
    const mine = unique("listed");
    await invite(mine, "PARENT");
    const res = await api(INVITATIONS, asAdmin());
    expect(res.status).toBe(200);
    expect(res.json.data.invitations.map((i: { email: string }) => i.email)).toContain(mine);
    expect(res.json.meta).toMatchObject({ page: 1 });
    expect(res.text).not.toMatch(/token/i);
    expect((await api(`${INVITATIONS}?page=0`, asAdmin())).status).toBe(400);
    expect((await api(INVITATIONS, { cookie: teacherCookie })).json).toEqual(NO_PERMISSION);
    expect((await api(INVITATIONS)).status).toBe(401);
  });

  test("resend: a NEW mail and link; the old link stops working at once; limited to 3; an unknown id is the one 404", async () => {
    const to = unique("resend");
    const first = await invitedWithToken(to);
    const resent = await api(`${INVITATIONS}/${first.id}/resend`, asAdmin({ method: "POST", body: {} }));
    expect(resent.status).toBe(200);
    expect(resent.text).not.toMatch(/token/i);
    const second = tokenFrom((await waitForMail(to, 2))[1]);
    expect(second).not.toBe(first.token);
    expect((await preview(first.token)).json).toEqual(INVALID);
    expect((await preview(second)).status).toBe(200);

    await api(`${INVITATIONS}/${first.id}/resend`, asAdmin({ method: "POST", body: {} }));
    await api(`${INVITATIONS}/${first.id}/resend`, asAdmin({ method: "POST", body: {} }));
    expect((await api(`${INVITATIONS}/${first.id}/resend`, asAdmin({ method: "POST", body: {} }))).status).toBe(429);

    const unknown = await api(`${INVITATIONS}/no-such-invitation/resend`, asAdmin({ method: "POST", body: {} }));
    expect(unknown.status).toBe(404);
    expect(unknown.json.error.code).toBe("NOT_FOUND");
  });

  test("revoke: the link dies, a second revoke and an unknown id are the same 404, a non-admin is refused", async () => {
    const to = unique("revoke");
    const { token, id } = await invitedWithToken(to);
    expect((await api(`${INVITATIONS}/${id}`, { cookie: teacherCookie, method: "DELETE" })).json).toEqual(NO_PERMISSION);
    const done = await api(`${INVITATIONS}/${id}`, asAdmin({ method: "DELETE" }));
    expect(done.status).toBe(200);
    expect(done.json.data).toEqual({ revoked: true });
    expect((await preview(token)).json).toEqual(INVALID);
    const again = await api(`${INVITATIONS}/${id}`, asAdmin({ method: "DELETE" }));
    const unknown = await api(`${INVITATIONS}/no-such-invitation`, asAdmin({ method: "DELETE" }));
    expect(again.status).toBe(404);
    expect(again.json).toEqual(unknown.json);
    expect(await db.auditLog.count({ where: { action: "INVITATION_REVOKED", targetId: id } })).toBe(1);
  });
});

test.describe("POST /invitations/preview — public", () => {
  test("shows the school, the branch, the role, a MASKED address and whether an account exists — with no-store", async () => {
    const to = unique("peek");
    const { token } = await invitedWithToken(to, "STUDENT");
    const res = await preview(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.json.data).toEqual({
      schoolName: "AlEemaan",
      branchName: BRANCH_NAMES[0],
      role: "STUDENT",
      roleLabel: "Student",
      email: expect.stringMatching(/^p\*\*\*@invite\.test$/),
      accountExists: false,
      viewer: "none",
    });
    expect(res.text).not.toContain(to);
  });

  test("tells a signed-in person whether they are the invitee or someone else", async () => {
    const owner = await createUser();
    const { token } = await invitedWithToken(owner.email, "PARENT");
    expect((await preview(token)).json.data).toMatchObject({ accountExists: true, viewer: "none" });
    expect((await preview(token, { cookie: await cookieFor(owner) })).json.data).toMatchObject({ viewer: "invitee" });
    expect((await preview(token, { cookie: teacherCookie })).json.data).toMatchObject({ viewer: "other" });
  });

  test("unknown, malformed, wrong-length, revoked, expired and used links all get the IDENTICAL answer (400, same body)", async () => {
    const revoked = await invitedWithToken(unique("rv"));
    await api(`${INVITATIONS}/${revoked.id}`, asAdmin({ method: "DELETE" }));
    const expired = await invitedWithToken(unique("ex"));
    await db.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const used = await invitedWithToken(unique("us"));
    await accept({ token: used.token, name: "Used Person", password: FRESH });
    for (const token of [
      newInvitationToken(),
      "short",
      "",
      "x".repeat(300),
      revoked.token,
      expired.token,
      used.token,
      "../../etc/passwd",
      "😀".repeat(20),
    ]) {
      const res = await preview(token);
      expect(res.status, token.slice(0, 20)).toBe(400);
      expect(res.json, token.slice(0, 20)).toEqual(INVALID);
    }
    expect((await api(`${INVITATIONS}/preview`, { body: { token: 42 } })).json).toEqual(INVALID);
    expect((await api(`${INVITATIONS}/preview`, { body: {} })).json).toEqual(INVALID);
    expect((await api(`${INVITATIONS}/preview`, { rawBody: "{" })).json.error.code).toBe("INVALID_BODY");
  });

  test("it is limited per IP: forty guesses are answered, the forty-first is a 429", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 40; i++) expect((await preview(newInvitationToken(), { ip })).status, `guess ${i + 1}`).toBe(400);
    const limited = await preview(newInvitationToken(), { ip });
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe("RATE_LIMITED");
    expect((await preview(newInvitationToken(), { ip: uniqueIp() })).status).toBe(400); // someone else is unaffected
  });

  test("it is public but not cross-site: a cross-origin request is a 403", async () => {
    const { token } = await invitedWithToken(unique("cs"));
    const res = await preview(token, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("CSRF");
  });
});

test.describe("POST /invitations/accept — a person with no account", () => {
  test("creates the account and the membership; does NOT sign them in; they then sign in with the password they chose; the link is spent", async () => {
    const to = unique("newbie");
    const { token } = await invitedWithToken(to, "TEACHING_STAFF");
    const res = await accept({ token, name: "  Nia   Newbie ", password: FRESH });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.json.data).toEqual({ accepted: true, newAccount: true });
    expect(sessionCookie(res)).toBeUndefined(); // a link in a mailbox is not a session

    const user = await db.user.findUniqueOrThrow({ where: { email: to } });
    expect(user.name).toBe("Nia Newbie");
    expect(user.emailVerified).not.toBeNull();
    expect(await verifyPassword(FRESH, user.passwordHash)).toBe(true);
    const login = await loginAs({ email: to, password: FRESH });
    expect(login.status).toBe(200);
    const me = await api("/api/v1/auth/me", { cookie: cookieHeader(login.token!) });
    expect(me.json.data.memberships).toEqual([{ branchId: branches[0].id, branchName: BRANCH_NAMES[0], role: "TEACHING_STAFF" }]);

    expect((await accept({ token, name: "Again", password: FRESH })).json).toEqual(INVALID); // single use
    expect((await preview(token)).json).toEqual(INVALID);
    expect(await db.user.count({ where: { email: to } })).toBe(1);
  });

  test("a breached or weak password and a bad name are explained field by field BEFORE the link is spent — and the link then still works", async () => {
    const to = unique("fixme");
    const { token, id } = await invitedWithToken(to);
    // (the breach check runs only on the server that is wired to the stand-in for the range API — same database, same link)
    const breached = await accept({ token, name: "Fix Me", password: BREACHED }, { baseUrl: BREACH_URL });
    expect(breached.status).toBe(400);
    expect(breached.json.error).toMatchObject({ code: "VALIDATION", details: [{ path: "body.password", message: BREACHED_MESSAGE }] });
    const weak = await accept({ token, name: "Fix Me", password: "short" });
    expect(weak.json.error.details[0].path).toBe("body.password");
    const noPassword = await accept({ token, name: "Fix Me" });
    expect(noPassword.json.error.details).toEqual([{ path: "body.password", message: "Choose a password." }]);
    const badName = await accept({ token, name: "Evil\u202Ename", password: FRESH });
    expect(badName.json.error.details).toEqual([{ path: "body.name", message: expect.any(String) }]);
    const noName = await accept({ token, password: FRESH });
    expect(noName.json.error.details[0].path).toBe("body.name");
    expect(await db.user.count({ where: { email: to } })).toBe(0);
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).acceptedAt).toBeNull();
    expect((await accept({ token, name: "Fix Me", password: FRESH })).status).toBe(200);
  });

  test("two people opening one link at once: exactly one account is made", async () => {
    const to = unique("simul");
    const { token } = await invitedWithToken(to);
    const results = await Promise.all([
      accept({ token, name: "First", password: FRESH }),
      accept({ token, name: "Second", password: FRESH }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.user.count({ where: { email: to } })).toBe(1);
  });

  test("public but not cross-site (403), and garbage is the same generic 400", async () => {
    const { token } = await invitedWithToken(unique("csrf"));
    expect((await accept({ token, name: "X Y", password: FRESH }, { origin: "https://evil.example" })).json.error.code).toBe("CSRF");
    expect((await accept({ token: "nope", name: "X Y", password: FRESH })).json).toEqual(INVALID);
    expect((await accept("a string, not an object")).json).toEqual(INVALID);
  });

  test("failures are limited per IP (10); a success is refunded, so a person who fixes typos is never locked out", async () => {
    const ip = `10.66.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    const { token } = await invitedWithToken(unique("ratelimit"));
    for (let i = 0; i < 9; i++)
      expect((await accept({ token: newInvitationToken(), name: "X Y", password: FRESH }, { ip })).status).toBe(400);
    expect((await accept({ token, name: "Rate Limit", password: FRESH }, { ip })).status).toBe(200); // the 10th: allowed, and refunded
    // Refunded means the success cost nothing: the budget is back to where it was BEFORE it — nine failures spent, one left. So exactly ONE
    // more failure is still ANSWERED (400); without the refund the success would have spent the tenth and this one would be a 429.
    expect(
      (await accept({ token: newInvitationToken(), name: "X Y", password: FRESH }, { ip })).status,
      "the tenth failure: the success was refunded",
    ).toBe(400);
    const blocked = await accept({ token: newInvitationToken(), name: "X Y", password: FRESH }, { ip });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("RATE_LIMITED");
  });
});

test.describe("POST /invitations/accept — an account that already exists is attached only by its OWNER", () => {
  test("signed in as that account: the membership is created, with the invited role and branch, and the person can use the school", async () => {
    const owner = await createUser({ name: "Olu Owner" });
    const { token } = await invitedWithToken(owner.email, "PARENT");
    const ownerCookie = await cookieFor(owner);
    const res = await accept({ token }, { cookie: ownerCookie });
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ accepted: true, newAccount: false });
    expect((await api("/api/v1/auth/me", { cookie: ownerCookie })).json.data.memberships).toEqual([
      { branchId: branches[0].id, branchName: BRANCH_NAMES[0], role: "PARENT" },
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).name).toBe("Olu Owner"); // nothing about the account changed
  });

  test("nobody signed in: 409 SIGN_IN_REQUIRED — a name and password in the body are IGNORED, the account is untouched, the link unspent", async () => {
    const owner = await createUser();
    const { token, id } = await invitedWithToken(owner.email);
    const before = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    const res = await accept({ token, name: "Impostor", password: FRESH });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("SIGN_IN_REQUIRED");
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toEqual(before);
    expect(await db.membership.count({ where: { userId: owner.id } })).toBe(0);
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).acceptedAt).toBeNull();
    expect((await accept({ token }, { cookie: await cookieFor(owner) })).status).toBe(200); // and the owner can still use it
  });

  test("signed in as SOMEONE ELSE: 403 WRONG_ACCOUNT — and that is true even when the address has no account at all", async () => {
    const owner = await createUser();
    const { token, id } = await invitedWithToken(owner.email, "ADMIN");
    const wrong = await accept({ token }, { cookie: teacherCookie });
    expect(wrong.status).toBe(403);
    expect(wrong.json.error.code).toBe("WRONG_ACCOUNT");
    expect(await db.membership.count({ where: { userId: owner.id } })).toBe(0);
    expect((await db.membership.findFirstOrThrow({ where: { userId: teacher.id } })).role).toBe("TEACHING_STAFF"); // not promoted
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).acceptedAt).toBeNull();

    const fresh = await invitedWithToken(unique("noaccount"));
    const stillWrong = await accept({ token: fresh.token, name: "New Person", password: FRESH }, { cookie: teacherCookie });
    expect(stillWrong.json.error.code).toBe("WRONG_ACCOUNT"); // not a silent sign-up while signed in as someone else
  });

  test("already a member of THIS branch: 409 ALREADY_MEMBER and the link is not spent; a DEACTIVATED person cannot come back through a link (400)", async () => {
    const member = await createUser({ role: Role.TEACHING_STAFF });
    const token = newInvitationToken();
    const row = await db.invitation.create({
      data: {
        email: member.email,
        role: Role.ADMIN,
        branchId: branches[0].id,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const memberCookie = await cookieFor(member);
    const res = await accept({ token }, { cookie: memberCookie });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("ALREADY_MEMBER");
    expect((await db.invitation.findUniqueOrThrow({ where: { id: row.id } })).acceptedAt).toBeNull();

    // deactivated behind the API's back so the session survives: the old link is still no way back
    await db.membership.updateMany({ where: { userId: member.id }, data: { deactivatedAt: new Date() } });
    const back = await accept({ token }, { cookie: memberCookie });
    expect(back.status).toBe(400);
    expect(back.json).toEqual(INVALID);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: row.id } })).acceptedAt).toBeNull();
    expect((await db.membership.findFirstOrThrow({ where: { userId: member.id } })).deactivatedAt).not.toBeNull();
  });

  test("a member of ANOTHER branch can be invited to this one and joins it: two memberships, both listed, the first untouched", async () => {
    const member = await createUser({ name: "Two Branches", role: Role.TEACHING_STAFF }); // the first branch
    const memberCookie = await cookieFor(member);
    // same branch is refused …
    expect((await invite(member.email, "PARENT", { branchId: branches[0].id })).json.error.code).toBe("ALREADY_MEMBER");
    // … another is not
    const { token, id } = await (async () => {
      const res = await invite(member.email, "PARENT", { branchId: branches[1].id });
      expect(res.status).toBe(201);
      const mail = await waitForMail(member.email);
      return { token: tokenFrom(mail[mail.length - 1]), id: res.json.data.invitation.id as string };
    })();
    expect(id).toBeTruthy();
    const joined = await accept({ token }, { cookie: memberCookie });
    expect(joined.status).toBe(200);
    expect(joined.json.data).toEqual({ accepted: true, newAccount: false });
    const me = await api("/api/v1/auth/me", { cookie: memberCookie });
    expect(me.json.data.memberships.map((m: { branchId: string; role: string }) => [m.branchId, m.role]).sort()).toEqual(
      [
        [branches[0].id, "TEACHING_STAFF"],
        [branches[1].id, "PARENT"],
      ].sort(),
    );
    const listed = await api(`/api/v1/members?q=${encodeURIComponent("Two Branches")}`, asAdmin());
    expect(listed.json.data.members).toHaveLength(2);
  });
});
