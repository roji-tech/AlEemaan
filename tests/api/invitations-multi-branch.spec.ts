import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { mailAfterGrace, waitForMail, type SentEmail } from "../support/outbox";
import { hashInvitationToken } from "@/lib/invitations/token";

// One person, SEVERAL branches in one request (task 0092): POST /api/v1/invitations with `branchIds`. It is all or none, it asks the single invitation's own question about every branch
// (so an administrator learns nothing about a branch that is not theirs), and it sends ONE e-mail with a link per branch. The old `branchId` contract is checked here too: it did not change.

const INVITATIONS = "/api/v1/invitations";
const NO_PERMISSION = { data: null, meta: {}, error: { code: "FORBIDDEN", message: "You don't have permission to do that" } };
const OUT_OF_SCOPE = {
  data: null,
  meta: {},
  error: { code: "FORBIDDEN", message: "You can only invite people to the branches you administer." },
};
const FRESH = "a-fresh-unseen-passphrase-3";
const unique = (label: string) => `${label}-${crypto.randomBytes(3).toString("hex")}@multi.test`;

let branches: { id: string; name: string }[];
let lead: TestUser; // a superadmin used where the actor matters
let leadCookie: string;
const supers: string[] = []; // superadmins that take turns, because 30 invitations per administrator per 5 minutes is a real limit
let superTurn = 0;
let bola: TestUser; // administers branches 0 and 1 only
let bolaCookie: string;
let teacherCookie: string;

async function cookieFor(user: { email: string; password: string }) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const asSuper = () => supers[superTurn++ % supers.length];
type Extra = { role?: string; cookie?: string; origin?: string };
/// POST with a list of branches (or whatever `body` overrides).
const multi = (email: string, branchIds: unknown, extra: Extra = {}, body: Record<string, unknown> = {}) =>
  api(INVITATIONS, {
    method: "POST",
    cookie: extra.cookie ?? asSuper(),
    origin: extra.origin,
    body: { email, role: extra.role ?? "TEACHING_STAFF", branchIds, ...body },
  });
/// POST with ONE branch: the original contract.
const single = (email: string, branchId: string, extra: Extra = {}) =>
  api(INVITATIONS, { method: "POST", cookie: extra.cookie ?? asSuper(), body: { email, role: extra.role ?? "TEACHING_STAFF", branchId } });
const escaped = (name: string) => name.replace(/[()]/g, "\\$&");
const ids = (...at: number[]) => at.map((i) => branches[i].id);
const tokensIn = (mail: SentEmail) => [...mail.text.matchAll(/#token=([A-Za-z0-9_-]{43})/g)].map((m) => m[1]);
const open = (email: string) => db.invitation.findMany({ where: { email, acceptedAt: null, revokedAt: null } });
async function memberOf(email: string, branch: number, role: Role = Role.TEACHING_STAFF) {
  const user = await createUser({ email });
  await db.membership.create({ data: { userId: user.id, branchId: branches[branch].id, role } });
  return user;
}

test.beforeAll(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  lead = await createUser({ name: "Lead Superadmin", role: Role.ADMIN });
  leadCookie = await cookieFor(lead);
  for (let i = 0; i < 5; i++) supers.push(await cookieFor(await createUser({ name: "Sade Superadmin", role: Role.ADMIN })));
  bola = await createUser({ name: "Bola Branchadmin", role: Role.ADMIN, superAdmin: false }); // administers branch 0 …
  await db.membership.create({ data: { userId: bola.id, branchId: branches[1].id, role: Role.ADMIN } }); // … and branch 1
  bolaCookie = await cookieFor(bola);
  teacherCookie = await cookieFor(await createUser({ name: "Tola Teacher", role: Role.TEACHING_STAFF }));
});

test.describe("several branches in one request", () => {
  test("one invitation per branch, ONE e-mail naming every branch with a link each, and one audit entry per invitation", async () => {
    const to = unique("many");
    const wanted = ids(0, 1, 3);
    const res = await multi(to, wanted, { role: "PARENT", cookie: leadCookie });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Object.keys(res.json.data)).toEqual(["invitations"]); // the several-branches answer is a list; the single one stays `invitation`
    const sent = res.json.data.invitations as {
      id: string;
      email: string;
      role: string;
      branchId: string;
      branchName: string;
      status: string;
      invitedByName: string;
    }[];
    expect(sent.map((i) => i.branchId)).toEqual(wanted); // in the order asked
    expect(sent.map((i) => i.branchName)).toEqual([BRANCH_NAMES[0], BRANCH_NAMES[1], BRANCH_NAMES[3]]);
    for (const i of sent) expect(i).toMatchObject({ email: to, role: "PARENT", status: "pending", invitedByName: "Lead Superadmin" });
    expect(res.text).not.toMatch(/token/i); // never a token or a hash in the answer

    const rows = await open(to);
    expect(rows.map((r) => r.branchId).sort()).toEqual([...wanted].sort());
    expect(new Set(rows.map((r) => r.tokenHash)).size).toBe(3); // a link of its own for each

    // ONE message, which names every branch and has one link under each name; the link under a name is that branch's own invitation.
    const [mail] = await waitForMail(to);
    expect(await mailAfterGrace(to, 600)).toHaveLength(1);
    expect(mail.subject).toBe("You're invited to join AlEemaan");
    expect(mail.text).toContain("Lead Superadmin invited you to join AlEemaan as Parent in 3 branches");
    expect(mail.text).not.toContain(BRANCH_NAMES[2]); // a branch that was not asked for is not in it
    const tokens = tokensIn(mail);
    expect(tokens).toHaveLength(3);
    for (const [at, name] of [
      [0, BRANCH_NAMES[0]],
      [1, BRANCH_NAMES[1]],
      [3, BRANCH_NAMES[3]],
    ] as const) {
      const link = new RegExp(`For ${escaped(name)}:\\n\\S*/accept-invite#token=([A-Za-z0-9_-]{43})`).exec(mail.text);
      expect(link, name).not.toBeNull();
      expect(rows.find((r) => r.branchId === branches[at].id)!.tokenHash, name).toBe(hashInvitationToken(link![1]));
    }
    expect(mail.text).not.toContain("?token="); // the fragment, as every invitation link

    // one audit entry per invitation, each with its own branch, none with a secret
    const audits = await db.auditLog.findMany({ where: { action: "INVITATION_CREATED", targetId: { in: rows.map((r) => r.id) } } });
    expect(audits).toHaveLength(3);
    expect(audits.map((a) => (a.afterValue as { branchId: string }).branchId).sort()).toEqual([...wanted].sort());
    for (const a of audits) {
      expect(a.actorUserId).toBe(lead.id);
      expect(a.afterValue).toMatchObject({ email: to, role: "PARENT" });
    }
    for (const token of tokens) expect(JSON.stringify(audits)).not.toContain(token);
    expect(await db.auditLog.count({ where: { action: "INVITATION_CREATED", afterValue: { path: ["email"], equals: to } } })).toBe(3);
  });

  test("a list with ONE branch is answered as a list and mailed as the ordinary one-branch invitation", async () => {
    const to = unique("listone");
    const res = await multi(to, ids(2), { role: "STUDENT" });
    expect(res.status).toBe(201);
    expect(res.json.data.invitations).toHaveLength(1);
    expect(res.json.data.invitations[0]).toMatchObject({ branchId: branches[2].id, role: "STUDENT" });
    const [mail] = await waitForMail(to);
    expect(mail.text).toContain(`invited you to join AlEemaan (${BRANCH_NAMES[2]}) as Student`); // the same words as the single route
    expect(tokensIn(mail)).toHaveLength(1);
  });

  test("the address is trimmed and lower-cased, and the per-address limit (3) is counted per request, not per branch", async () => {
    const base = unique("limit");
    const first = await multi(`  ${base.toUpperCase()}  `, ids(0, 1));
    expect(first.status).toBe(201);
    expect(first.json.data.invitations.map((i: { email: string }) => i.email)).toEqual([base, base]);
    expect((await multi(base, ids(2, 3))).status).toBe(201);
    expect((await multi(base, ids(0))).status).toBe(409); // a link is already waiting there: and that was the third request
    const fourth = await multi(base, ids(3));
    expect(fourth.status).toBe(429);
    expect(fourth.json.error.code).toBe("RATE_LIMITED");
  });
});

test.describe("the old single-branch contract is unchanged", () => {
  test("`branchId` still answers `invitation`, still replaces the earlier open invitation to that branch, and the mail is the one-branch mail", async () => {
    const to = unique("old");
    const first = await single(to, branches[0].id, { role: "PARENT" });
    expect(first.status).toBe(201);
    expect(Object.keys(first.json.data)).toEqual(["invitation"]);
    expect(first.json.data.invitation).toMatchObject({ email: to, role: "PARENT", branchId: branches[0].id, status: "pending" });
    const again = await single(to, branches[0].id, { role: "PARENT" });
    expect(again.status).toBe(201); // a single invitation REPLACES a waiting one (several-branches refuses it: see below)
    expect(await open(to)).toHaveLength(1);
    const mail = await waitForMail(to, 2);
    expect(mail[0].text).toContain(`invited you to join AlEemaan (${BRANCH_NAMES[0]}) as Parent`);
    expect(
      await db.auditLog.count({
        where: { action: "INVITATION_REVOKED", reason: "replaced by a new invitation", afterValue: { path: ["email"], equals: to } },
      }),
    ).toBe(1);
  });

  test("the old refusals keep their words: already a member, deactivated, unknown branch, a branch that is not yours, an administrator by a branch administrator", async () => {
    const member = await memberOf(unique("old-member"), 0);
    const alreadyMember = await single(member.email, branches[0].id);
    expect(alreadyMember.status).toBe(409);
    expect(alreadyMember.json.error).toMatchObject({ code: "ALREADY_MEMBER", message: "That person is already a member." });

    const gone = await memberOf(unique("old-gone"), 1);
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    const deactivated = await single(gone.email, branches[1].id);
    expect(deactivated.json.error).toMatchObject({
      code: "DEACTIVATED_MEMBER",
      message: "That person was deactivated. Reactivate them instead.",
    });

    const missing = await single(unique("old-branch"), "no-such-branch");
    expect(missing.status).toBe(400);
    expect(missing.json.error.details).toEqual([{ path: "body.branchId", message: "Choose one of the school's branches." }]);

    expect((await single(unique("old-scope"), branches[2].id, { cookie: bolaCookie })).json).toEqual(OUT_OF_SCOPE);
    const admin = await single(unique("old-admin"), branches[0].id, { cookie: bolaCookie, role: "ADMIN" });
    expect(admin.status).toBe(403);
    expect(admin.json.error.message).toBe("Only a superadmin can invite an administrator.");
  });
});

test.describe("what the request may say", () => {
  test("exactly one of `branchId` and `branchIds`, at least one branch, at most ten, each once, only strings: anything else is a 400 and nothing is created", async () => {
    const before = await db.invitation.count();
    const email = unique("shape");
    const eleven = Array.from({ length: 11 }, (_, i) => `branch-${i}`);
    const cases: [string, Record<string, unknown>, string][] = [
      ["both", { email, role: "PARENT", branchId: branches[0].id, branchIds: ids(1) }, "body.branchIds"],
      ["neither", { email, role: "PARENT" }, "body.branchId"],
      ["an empty list", { email, role: "PARENT", branchIds: [] }, "body.branchIds"],
      ["eleven branches", { email, role: "PARENT", branchIds: eleven }, "body.branchIds"],
      ["a branch twice", { email, role: "PARENT", branchIds: [branches[0].id, branches[1].id, branches[0].id] }, "body.branchIds"],
      ["not a list", { email, role: "PARENT", branchIds: branches[0].id }, "body.branchIds"],
      ["a number in the list", { email, role: "PARENT", branchIds: [5] }, "body.branchIds.0"],
      ["an empty id in the list", { email, role: "PARENT", branchIds: [""] }, "body.branchIds.0"],
      ["an extra key", { email, role: "PARENT", branchIds: ids(0), tokenHash: "x" }, "body"],
      ["a role that does not exist", { email, role: "OWNER", branchIds: ids(0) }, "body.role"],
      ["not an address", { email: "nope", role: "PARENT", branchIds: ids(0) }, "body.email"],
    ];
    for (const [what, body, path] of cases) {
      const res = await api(INVITATIONS, { method: "POST", cookie: asSuper(), body });
      expect(res.status, what).toBe(400);
      expect(res.json.error.code, what).toBe("VALIDATION");
      expect(JSON.stringify(res.json.error.details), what).toContain(`"path":"${path}`);
    }
    expect((await api(INVITATIONS, { method: "POST", cookie: asSuper(), rawBody: "nope" })).json.error.code).toBe("INVALID_BODY");
    expect(await db.invitation.count()).toBe(before);
  });

  test("exactly ten branches are accepted (and each invitation counts once against the administrator's limit of 30 in five minutes)", async () => {
    // (the extra branches stay for the rest of the file, which only ever names branches by position 0 to 3)
    for (let i = 0; i < 6; i++) await db.branch.create({ data: { name: `Extra branch ${i}-${crypto.randomBytes(2).toString("hex")}` } });
    const all = (await db.branch.findMany({ orderBy: { createdAt: "asc" } })).map((b) => b.id);
    expect(all).toHaveLength(10);
    const cookie = await cookieFor(await createUser({ name: "Limit Superadmin", role: Role.ADMIN }));

    const ok = await multi(unique("ten"), all, { cookie });
    expect(ok.status).toBe(201);
    expect(ok.json.data.invitations).toHaveLength(10);
    expect((await multi(unique("ten"), all, { cookie })).status).toBe(201); // 20 of 30
    expect((await multi(unique("ten"), all, { cookie })).status).toBe(201); // 30 of 30
    const oneMore = unique("one-more");
    const refused = await multi(oneMore, ids(0), { cookie });
    expect(refused.status).toBe(429);
    expect(refused.json.error.code).toBe("RATE_LIMITED");
    expect(await db.invitation.count({ where: { email: oneMore } })).toBe(0);
  });
});

test.describe("all or none", () => {
  test("a branch the caller may not invite to refuses the WHOLE request with the single route's 403, wherever it is in the list, and names no branch", async () => {
    for (const list of [ids(0, 2), ids(2, 0), ids(2), ids(0, 1, 3)]) {
      const to = unique("forbidden");
      const res = await multi(to, list, { cookie: bolaCookie });
      expect(res.status, list.join()).toBe(403);
      expect(res.json, list.join()).toEqual(OUT_OF_SCOPE);
      for (const name of BRANCH_NAMES) expect(res.text).not.toContain(name);
      expect(await db.invitation.count({ where: { email: to } }), "nothing was created for the branches that were allowed either").toBe(0);
      expect(await mailAfterGrace(to, 300)).toEqual([]);
      expect(await db.auditLog.count({ where: { action: "INVITATION_CREATED", afterValue: { path: ["email"], equals: to } } })).toBe(0);
    }
    // the same words and status as the single-branch route gives for that branch
    const alone = await single(unique("forbidden-single"), branches[2].id, { cookie: bolaCookie });
    expect(alone.status).toBe(403);
    expect(alone.json).toEqual(OUT_OF_SCOPE);
  });

  test("a branch that does not exist is a 400 for the whole request (nothing created); the order of the list changes nothing", async () => {
    for (const list of [
      [branches[0].id, "no-such-branch"],
      ["no-such-branch", branches[0].id],
    ]) {
      const to = unique("unknown");
      const res = await multi(to, list);
      expect(res.status).toBe(400);
      expect(res.json.error.details).toEqual([{ path: "body.branchIds", message: "Choose only the school's branches." }]);
      expect(await db.invitation.count({ where: { email: to } })).toBe(0);
    }
  });

  test("what is known about a branch the caller may not see is never told: a person who belongs to it is a 403 too, not a 409", async () => {
    const hidden = await memberOf(unique("hidden"), 2); // a member of branch 2, which Bola does not administer
    for (const list of [ids(2), ids(0, 2), ids(2, 0)]) {
      const res = await multi(hidden.email, list, { cookie: bolaCookie });
      expect(res.status, list.join()).toBe(403);
      expect(res.json, list.join()).toEqual(OUT_OF_SCOPE);
    }
    expect(await db.invitation.count({ where: { email: hidden.email } })).toBe(0);
  });

  test("a branch the person already belongs to refuses the whole request (409, naming it): nothing is created for the other branches, nothing is mailed", async () => {
    const member = await memberOf(unique("member"), 1);
    const res = await multi(member.email, ids(0, 1, 2));
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("ALREADY_MEMBER");
    expect(res.json.error.message).toBe(`That person is already a member of ${BRANCH_NAMES[1]}. Nothing was sent.`);
    expect(res.json.error.details).toEqual([{ path: "body.branchIds", message: res.json.error.message }]);
    expect(await db.invitation.count({ where: { email: member.email } })).toBe(0);
    expect(await mailAfterGrace(member.email, 400)).toEqual([]);
    expect(
      await db.auditLog.count({ where: { action: "INVITATION_CREATED", afterValue: { path: ["email"], equals: member.email } } }),
    ).toBe(0);

    // leaving that branch out is what makes it work
    const fixed = await multi(member.email, ids(0, 2));
    expect(fixed.status).toBe(201);
    expect(fixed.json.data.invitations.map((i: { branchId: string }) => i.branchId)).toEqual(ids(0, 2));
  });

  test("a person who was deactivated is a 409 naming a branch (reactivate instead), and nothing is created", async () => {
    const gone = await memberOf(unique("gone"), 1);
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    const res = await multi(gone.email, ids(2, 1));
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DEACTIVATED_MEMBER");
    // (the first branch of the list that cannot take them: a person with no active membership anywhere is refused everywhere)
    expect(res.json.error.message).toBe(
      `That person was deactivated, so they can't be added to ${BRANCH_NAMES[2]}. Reactivate them instead. Nothing was sent.`,
    );
    expect(await db.invitation.count({ where: { email: gone.email } })).toBe(0);
  });

  test("a branch that already has a link WAITING refuses the whole request (409, naming it) and the waiting link is left alone; an EXPIRED one is replaced", async () => {
    const to = unique("waiting");
    const first = await single(to, branches[1].id, { role: "PARENT" });
    expect(first.status).toBe(201);
    const waiting = first.json.data.invitation.id as string;

    const res = await multi(to, ids(0, 1, 2), { role: "PARENT" });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("INVITATION_PENDING");
    expect(res.json.error.message).toBe(
      `An invitation to ${BRANCH_NAMES[1]} is already waiting for that address. Revoke it or leave ${BRANCH_NAMES[1]} out. Nothing was sent.`,
    );
    const left = await open(to);
    expect(left.map((r) => r.id)).toEqual([waiting]); // untouched: still the only open one, nothing new for 0 or 2
    expect(await waitForMail(to)).toHaveLength(1);
    expect(await mailAfterGrace(to, 400)).toHaveLength(1); // and nothing more was mailed

    await db.invitation.update({ where: { id: waiting }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const replaced = await multi(to, ids(0, 1, 2), { role: "PARENT" });
    expect(replaced.status).toBe(201);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: waiting } })).revokedAt).not.toBeNull();
    expect(
      await db.auditLog.count({ where: { action: "INVITATION_REVOKED", targetId: waiting, reason: "replaced by a new invitation" } }),
    ).toBe(1);
    expect(await open(to)).toHaveLength(3);
  });

  test("two requests for the same person and branches at the same instant: one wins, the other is told a link is waiting, and there is one invitation per branch", async () => {
    const to = unique("race");
    const results = await Promise.all([multi(to, ids(0, 1, 2)), multi(to, ids(0, 1, 2))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.json.error.code).toBe("INVITATION_PENDING");
    expect(await open(to)).toHaveLength(3);
  });
});

test.describe("who may invite, and as what", () => {
  test("a branch administrator invites to SEVERAL of their own branches; each invitation is theirs and each shows in their list", async () => {
    const to = unique("bola");
    const res = await multi(to, ids(0, 1), { cookie: bolaCookie, role: "TEACHING_STAFF" });
    expect(res.status).toBe(201);
    expect(res.json.data.invitations.map((i: { invitedByName: string }) => i.invitedByName)).toEqual([
      "Bola Branchadmin",
      "Bola Branchadmin",
    ]);
    const list = await api(`${INVITATIONS}?limit=100`, { cookie: bolaCookie });
    expect((list.json.data.invitations as { email: string }[]).filter((i) => i.email === to)).toHaveLength(2);
  });

  test("only a superadmin may invite an ADMINISTRATOR, to several branches too: a branch administrator gets the single route's 403 and nothing is created", async () => {
    const refused = unique("admin-no");
    const no = await multi(refused, ids(0, 1), { cookie: bolaCookie, role: "ADMIN" });
    expect(no.status).toBe(403);
    expect(no.json.error).toEqual({ code: "FORBIDDEN", message: "Only a superadmin can invite an administrator." });
    expect(await db.invitation.count({ where: { email: refused } })).toBe(0);

    const allowed = unique("admin-yes");
    const yes = await multi(allowed, ids(0, 1, 2), { role: "ADMIN" });
    expect(yes.status).toBe(201);
    expect((yes.json.data.invitations as { role: string }[]).map((i) => i.role)).toEqual(["ADMIN", "ADMIN", "ADMIN"]);
  });

  test("a superadmin may invite to any branch, all four in one request", async () => {
    const to = unique("all-four");
    const res = await multi(to, ids(0, 1, 2, 3), { role: "NON_TEACHING_STAFF" });
    expect(res.status).toBe(201);
    expect((res.json.data.invitations as { branchName: string }[]).map((i) => i.branchName)).toEqual([...BRANCH_NAMES]);
    const [mail] = await waitForMail(to);
    expect(mail.text).toContain("as Non-teaching staff in 4 branches");
    expect(tokensIn(mail)).toHaveLength(4);
  });

  test("a branch administrator never sees an invitation to a branch that is not theirs, even one made in the same request by a superadmin", async () => {
    const to = unique("seen");
    expect((await multi(to, ids(1, 2))).status).toBe(201);
    const list = await api(`${INVITATIONS}?limit=100`, { cookie: bolaCookie });
    const mine = (list.json.data.invitations as { email: string; branchId: string }[]).filter((i) => i.email === to);
    expect(mine.map((i) => i.branchId)).toEqual([branches[1].id]);
    expect(list.text).not.toContain(BRANCH_NAMES[2]);
  });

  test("a non-administrator gets the one 403 body, and CSRF is enforced", async () => {
    const as = await multi(unique("teacher"), ids(0, 1), { cookie: teacherCookie });
    expect(as.status).toBe(403);
    expect(as.json).toEqual(NO_PERMISSION);
    const csrf = await multi(unique("csrf"), ids(0, 1), { origin: "https://evil.example" });
    expect(csrf.status).toBe(403);
    expect(csrf.json.error.code).toBe("CSRF");
    expect((await api(INVITATIONS, { method: "POST", body: { email: unique("anon"), role: "PARENT", branchIds: ids(0) } })).status).toBe(
      401,
    );
  });
});

test.describe("accepting: each link adds ITS branch, and the person ends up in each", () => {
  const accept = (body: unknown, extra: { cookie?: string } = {}) => api(`${INVITATIONS}/accept`, { body, ...extra });

  test("a person who already has an account, signed in, accepts each link in turn and belongs to every branch (as the role invited), one audit entry each", async () => {
    const owner = await createUser({ name: "Olu Owner" });
    const res = await multi(owner.email, ids(0, 1, 2), { role: "PARENT" });
    expect(res.status).toBe(201);
    const tokens = tokensIn((await waitForMail(owner.email))[0]);
    expect(tokens).toHaveLength(3);
    const cookie = await cookieFor(owner);

    for (const [i, token] of tokens.entries()) {
      const joined = await accept({ token }, { cookie });
      expect(joined.status, `link ${i + 1}`).toBe(200);
      expect(joined.json.data).toEqual({ accepted: true, newAccount: false });
    }
    const me = await api("/api/v1/auth/me", { cookie });
    expect((me.json.data.memberships as { branchId: string; role: string }[]).map((m) => `${m.branchId}:${m.role}`).sort()).toEqual(
      ids(0, 1, 2)
        .map((id) => `${id}:PARENT`)
        .sort(),
    );
    expect(await db.membership.count({ where: { userId: owner.id, deactivatedAt: null } })).toBe(3);
    expect(await db.auditLog.count({ where: { action: "INVITATION_ACCEPTED", actorUserId: owner.id } })).toBe(3);
    expect((await accept({ token: tokens[0] }, { cookie })).status).toBe(400); // each link works once
  });

  test("accepting ONE link adds that branch only; the others stay open until they are used", async () => {
    const owner = await createUser({ name: "Pia Partial" });
    await multi(owner.email, ids(1, 3), { role: "TEACHING_STAFF" });
    const [mail] = await waitForMail(owner.email);
    const second = new RegExp(`For ${escaped(BRANCH_NAMES[3])}:\\n\\S*/accept-invite#token=([A-Za-z0-9_-]{43})`).exec(mail.text)![1];
    expect((await accept({ token: second }, { cookie: await cookieFor(owner) })).status).toBe(200);
    const held = await db.membership.findMany({ where: { userId: owner.id } });
    expect(held.map((m) => m.branchId)).toEqual([branches[3].id]);
    const stillOpen = await open(owner.email);
    expect(stillOpen.map((r) => r.branchId)).toEqual([branches[1].id]);
  });

  test("a NEW person chooses a password on the first link; the others need that account to be signed in, and then each adds its branch", async () => {
    const to = unique("newbie");
    await multi(to, ids(0, 2), { role: "TEACHING_STAFF" });
    const [first, second] = tokensIn((await waitForMail(to))[0]);

    const created = await accept({ token: first, name: "Nia Newbie", password: FRESH });
    expect(created.status).toBe(200);
    expect(created.json.data).toEqual({ accepted: true, newAccount: true });

    const anonymous = await accept({ token: second, name: "Nia Newbie", password: FRESH });
    expect(anonymous.status).toBe(409); // the account exists now: signing in is the way, not a second password
    expect(anonymous.json.error.code).toBe("SIGN_IN_REQUIRED");

    const cookie = await cookieFor({ email: to, password: FRESH });
    const joined = await accept({ token: second }, { cookie });
    expect(joined.status).toBe(200);
    expect(joined.json.data).toEqual({ accepted: true, newAccount: false });
    expect(await db.membership.count({ where: { user: { email: to }, deactivatedAt: null } })).toBe(2);
  });
});
