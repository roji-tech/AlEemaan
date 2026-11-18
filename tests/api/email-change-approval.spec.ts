import { test, expect } from "@playwright/test";
import { Role, createUser, db, uniqueEmail } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { mailAfterGrace, mailTo, tokenFrom, waitForMail } from "../support/outbox";

// Changing the address needs approval (task 0088): a member's by an administrator of their branch (or a superadmin), an administrator's by a superadmin,
// a superadmin's by nobody. The link to the new address is only mailed once the request is approved.

const REQUEST = "/api/v1/email-change-requests";
const ASK = "/api/v1/auth/email-change/request";
const CONFIRM = "/api/v1/auth/email-change/confirm";

async function signedIn(opts: { role?: Role; superAdmin?: boolean; branchId?: string } = {}) {
  const user = await createUser({ role: opts.role ?? Role.TEACHING_STAFF, superAdmin: opts.superAdmin });
  if (opts.branchId) {
    await db.membership.updateMany({ where: { userId: user.id }, data: { branchId: opts.branchId } });
  }
  const res = await loginAs(user);
  return { user, cookie: cookieHeader(res.token!) };
}
type Person = Awaited<ReturnType<typeof signedIn>>;

const ask = (p: Person, newEmail: string, password = p.user.password) => api(ASK, { body: { newEmail, password }, cookie: p.cookie });
const decide = (by: Person, id: string, decision: "approve" | "deny", reason?: string) =>
  api(`${REQUEST}/${id}`, { body: { decision, ...(reason ? { reason } : {}) }, cookie: by.cookie });
const waiting = (userId: string) => db.emailChangeRequest.findFirstOrThrow({ where: { userId, status: "PENDING" } });

test.describe("asking: who has to wait", () => {
  test("a member's request WAITS: nothing is mailed to the new address, no link exists, the old address is told, the answer says so", async () => {
    const member = await signedIn({ role: Role.TEACHING_STAFF });
    const newEmail = uniqueEmail("new");
    const res = await ask(member, newEmail);
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ requested: true, needsApproval: true });

    const [notice] = await waitForMail(member.user.email);
    expect(notice.subject).toMatch(/change of email address was requested/);
    expect(notice.text).toMatch(/administrator has to approve/);
    expect(notice.text).not.toContain("#token=");
    expect(await mailAfterGrace(newEmail)).toHaveLength(0); // nothing reaches the new address yet
    expect(await db.emailChangeToken.count({ where: { userId: member.user.id } })).toBe(0);
    const row = await waiting(member.user.id);
    expect(row.newEmail).toBe(newEmail);
    expect(row.requiredLevel).toBe("ADMIN");
  });

  test("an administrator's request waits for a SUPERADMIN; a superadmin's is immediate (a link, no row)", async () => {
    const admin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    expect((await ask(admin, uniqueEmail("new"))).json.data.needsApproval).toBe(true);
    expect((await waiting(admin.user.id)).requiredLevel).toBe("SUPERADMIN");

    const sa = await signedIn({ role: Role.ADMIN, superAdmin: true });
    const target = uniqueEmail("sa");
    const res = await ask(sa, target);
    expect(res.json.data).toEqual({ requested: true }); // no needsApproval
    const [link] = await waitForMail(target);
    expect(link.text).toMatch(/#token=/);
    expect(await db.emailChangeRequest.count({ where: { userId: sa.user.id } })).toBe(0);
  });

  test("asking again replaces the waiting request; a pupil and a parent wait too", async () => {
    const member = await signedIn();
    await ask(member, uniqueEmail("one"));
    const second = uniqueEmail("two");
    await ask(member, second);
    expect(await db.emailChangeRequest.count({ where: { userId: member.user.id } })).toBe(1);
    expect((await waiting(member.user.id)).newEmail).toBe(second);

    for (const role of [Role.STUDENT, Role.PARENT, Role.NON_TEACHING_STAFF]) {
      const p = await signedIn({ role });
      expect((await ask(p, uniqueEmail("n"))).json.data.needsApproval, role).toBe(true);
    }
  });

  test("a taken address and a free one look the same to the person asking (no probing for accounts)", async () => {
    const member = await signedIn();
    const taken = await createUser();
    const a = await ask(member, uniqueEmail("free"));
    const b = await ask(member, taken.email);
    expect(a.status).toBe(200);
    expect(b.json).toEqual(a.json);
    expect(await mailAfterGrace(taken.email)).toHaveLength(0); // the stranger is not mailed until an administrator approves
  });

  test("a wrong password still creates nothing", async () => {
    const member = await signedIn();
    const res = await ask(member, uniqueEmail("new"), "not-my-password-1");
    expect(res.status).toBe(400);
    expect(await db.emailChangeRequest.count({ where: { userId: member.user.id } })).toBe(0);
  });

  test("the person can withdraw their own waiting request", async () => {
    const member = await signedIn();
    await ask(member, uniqueEmail("new"));
    const gone = await api(ASK, { method: "DELETE", cookie: member.cookie });
    expect(gone.status).toBe(200);
    expect(gone.json.data).toEqual({ cancelled: true });
    expect(await db.emailChangeRequest.count({ where: { userId: member.user.id } })).toBe(0);
    expect((await api(ASK, { method: "DELETE", cookie: member.cookie })).json.data).toEqual({ cancelled: false });
    expect((await api(ASK, { method: "DELETE" })).status).toBe(401); // and only signed in
  });
});

test.describe("the list an administrator sees", () => {
  test("a branch administrator sees their branch's members, never another branch's, never an administrator's, never their own", async () => {
    const adminA = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const other = await db.branch.create({ data: { name: `Other ${Date.now()}-${Math.random()}` } });
    const mine = await signedIn({ role: Role.TEACHING_STAFF });
    const theirs = await signedIn({ role: Role.TEACHING_STAFF, branchId: other.id });
    const fellowAdmin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    for (const p of [mine, theirs, fellowAdmin]) await ask(p, uniqueEmail("new"));
    await ask(adminA, uniqueEmail("mine"));

    const list = await api(REQUEST, { cookie: adminA.cookie });
    expect(list.status).toBe(200);
    const ids = (list.json.data.requests as { person: { id: string } }[]).map((r) => r.person.id);
    expect(ids).toContain(mine.user.id);
    expect(ids).not.toContain(theirs.user.id);
    expect(ids).not.toContain(fellowAdmin.user.id);
    expect(ids).not.toContain(adminA.user.id);
  });

  test("a superadmin sees every kind, including an administrator's", async () => {
    const sa = await signedIn({ role: Role.ADMIN, superAdmin: true });
    const admin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const member = await signedIn();
    await ask(admin, uniqueEmail("a"));
    await ask(member, uniqueEmail("m"));
    const ids = ((await api(REQUEST, { cookie: sa.cookie })).json.data.requests as { person: { id: string }; needs: string }[]).map(
      (r) => r.person.id,
    );
    expect(ids).toEqual(expect.arrayContaining([admin.user.id, member.user.id]));
  });

  test("a teacher, a pupil and a signed-out caller get nothing", async () => {
    expect((await api(REQUEST)).status).toBe(401);
    const teacher = await signedIn({ role: Role.TEACHING_STAFF });
    expect((await api(REQUEST, { cookie: teacher.cookie })).status).toBe(403);
    const pupil = await signedIn({ role: Role.STUDENT });
    expect((await api(REQUEST, { cookie: pupil.cookie })).status).toBe(403);
  });
});

test.describe("the list is paged (the shared shape: rows under requests, paging under meta)", () => {
  test("limit and page cut the list, meta tells the rest, and a bad parameter is a 400 naming it", async () => {
    const sa = await signedIn({ role: Role.ADMIN, superAdmin: true });
    const members = [await signedIn(), await signedIn(), await signedIn()];
    for (const m of members) await ask(m, uniqueEmail("n"));
    const first = await api(`${REQUEST}?limit=2&page=1`, { cookie: sa.cookie });
    expect(first.status).toBe(200);
    expect(first.json.meta).toMatchObject({ page: 1, limit: 2, pages: Math.ceil(first.json.meta.total / 2), hasNext: true });
    expect(first.json.data.requests).toHaveLength(2);
    const last = await api(`${REQUEST}?limit=2&page=${first.json.meta.pages}`, { cookie: sa.cookie });
    expect(last.json.meta.hasNext).toBe(false);
    expect(last.json.data.requests.length).toBeGreaterThan(0);
    const bad = await api(`${REQUEST}?limit=500`, { cookie: sa.cookie });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details[0].path).toBe("query.limit");
    expect((await api(`${REQUEST}?page=abc`, { cookie: sa.cookie })).status).toBe(400);
  });
});

test.describe("deciding", () => {
  test("approve: the link goes to the NEW address, the old one is told, and following the link switches the address", async () => {
    const admin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const member = await signedIn();
    const newEmail = uniqueEmail("approved");
    await ask(member, newEmail);
    await waitForMail(member.user.email); // the "waiting" notice
    const row = await waiting(member.user.id);

    const res = await decide(admin, row.id, "approve", "Checked with them at the office");
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ decided: "approve" });
    const [link] = await waitForMail(newEmail);
    expect(link.subject).toMatch(/Confirm your new .* email address/);
    await waitForMail(member.user.email, 2); // and the old address heard again
    const decided = await db.emailChangeRequest.findUniqueOrThrow({ where: { id: row.id } });
    expect(decided).toMatchObject({ status: "APPROVED", deciderUserId: admin.user.id, decisionReason: "Checked with them at the office" });
    expect((await db.user.findUniqueOrThrow({ where: { id: member.user.id } })).email).toBe(member.user.email); // not yet

    expect((await api(CONFIRM, { body: { token: tokenFrom(link) } })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: member.user.id } })).email).toBe(newEmail);
    await expect.poll(() => db.auditLog.count({ where: { action: "EMAIL_CHANGE_APPROVED", targetId: member.user.id } })).toBe(1);
  });

  test("deny: nothing changes, the old address is told, the new one hears nothing, and a second decision is a 404", async () => {
    const admin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const member = await signedIn();
    const newEmail = uniqueEmail("denied");
    await ask(member, newEmail);
    const row = await waiting(member.user.id);
    expect((await decide(admin, row.id, "deny")).status).toBe(200);
    await expect.poll(async () => (await mailTo(member.user.email)).some((m) => /was not changed/.test(m.subject))).toBe(true);
    expect(await mailAfterGrace(newEmail)).toHaveLength(0);
    expect(await db.emailChangeToken.count({ where: { userId: member.user.id } })).toBe(0);
    expect((await db.emailChangeRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("DENIED");
    expect((await decide(admin, row.id, "approve")).status).toBe(404); // already decided
  });

  test("an administrator of ANOTHER branch, a teacher, and the person themselves all get the same 404; nothing changes", async () => {
    const other = await db.branch.create({ data: { name: `Other ${Date.now()}-${Math.random()}` } });
    const strangerAdmin = await signedIn({ role: Role.ADMIN, superAdmin: false, branchId: other.id });
    const teacher = await signedIn({ role: Role.TEACHING_STAFF });
    const member = await signedIn();
    await ask(member, uniqueEmail("new"));
    const row = await waiting(member.user.id);
    const unknown = await decide(strangerAdmin, "does-not-exist", "approve");
    for (const by of [strangerAdmin]) {
      const res = await decide(by, row.id, "approve");
      expect(res.status).toBe(404);
      expect(res.json.error.message).toBe(unknown.json.error.message); // indistinguishable from an id that is not there
    }
    expect((await decide(teacher, row.id, "approve")).status).toBe(403); // no admin authority at all: refused at the gate
    expect((await decide(member, row.id, "approve")).status).toBe(403);
    expect((await db.emailChangeRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
  });

  test("a branch administrator cannot decide another administrator's request, a superadmin can; nobody decides their own", async () => {
    const adminA = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const adminB = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const sa = await signedIn({ role: Role.ADMIN, superAdmin: true });
    await ask(adminB, uniqueEmail("new"));
    const row = await waiting(adminB.user.id);
    expect((await decide(adminA, row.id, "approve")).status).toBe(404);
    expect((await decide(adminB, row.id, "approve")).status).toBe(404); // their own
    expect((await decide(sa, row.id, "approve")).status).toBe(200);
  });

  test("two administrators deciding at once: exactly one wins, and one link exists", async () => {
    const a1 = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const a2 = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const member = await signedIn();
    await ask(member, uniqueEmail("new"));
    const row = await waiting(member.user.id);
    const [r1, r2] = await Promise.all([decide(a1, row.id, "approve"), decide(a2, row.id, "approve")]);
    expect([r1.status, r2.status].sort()).toEqual([200, 404]);
    expect(await db.emailChangeToken.count({ where: { userId: member.user.id } })).toBe(1);
  });

  test("approving an address that has been taken meanwhile sends that address a notice, no link, and says the same thing to the administrator", async () => {
    const admin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const member = await signedIn();
    const target = uniqueEmail("late");
    await ask(member, target);
    const row = await waiting(member.user.id);
    await createUser({ email: target });
    const res = await decide(admin, row.id, "approve");
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ decided: "approve" });
    const [notice] = await waitForMail(target);
    expect(notice.subject).toMatch(/Someone tried to use your email address/);
    expect(notice.text).not.toContain("#token=");
    expect(await db.emailChangeToken.count({ where: { userId: member.user.id } })).toBe(0);
  });

  test("a bad body is a 400 and a malformed id a 404; neither decides anything", async () => {
    const admin = await signedIn({ role: Role.ADMIN, superAdmin: false });
    const member = await signedIn();
    await ask(member, uniqueEmail("new"));
    const row = await waiting(member.user.id);
    expect((await api(`${REQUEST}/${row.id}`, { body: { decision: "maybe" }, cookie: admin.cookie })).status).toBe(400);
    expect((await api(`${REQUEST}/${row.id}`, { rawBody: "{nope", cookie: admin.cookie })).status).toBe(400);
    expect((await api(`${REQUEST}/${encodeURIComponent("a/b c")}`, { body: { decision: "deny" }, cookie: admin.cookie })).status).toBe(404);
    expect((await api(`${REQUEST}/${row.id}`, { body: { decision: "deny" } })).status).toBe(401);
    expect((await waiting(member.user.id)).id).toBe(row.id);
  });
});
