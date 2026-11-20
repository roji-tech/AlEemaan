import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { mailAfterGrace, resetOutbox, tokenFrom, waitForMail } from "../support/outbox";

// Task 0101 D2 (task 0118): draft invitations. Saved, not sent: no link, no expiry, no e-mail until sent. A draft is the open invitation of its address and branch, never replaces a SENT one,
// is sent one at a time or all together, can be edited or deleted, and is read by the history. The accept route never matches one.

const INVITATIONS = "/api/v1/invitations";
const FRESH = "a-fresh-unseen-passphrase-3";
let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await resetOutbox();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});
const asRole = async (role: Role, branchIds: string[] = [home.id]) => {
  const user = await createUser();
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const superAdmin = async () => {
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
let n = 0;
const address = () => `draft${++n}-${Date.now()}@invite.test`;
const saveDraft = (cookie: string, email: string, extra: Record<string, unknown> = {}) =>
  api(INVITATIONS, { method: "POST", cookie, body: { email, role: "TEACHING_STAFF", branchId: home.id, draft: true, ...extra } });
const sendDraft = (cookie: string, id: string) => api(`${INVITATIONS}/${id}/send`, { method: "POST", cookie, body: {} });

test.describe("saving a draft", () => {
  test("no link, no expiry, no e-mail, audited; it is listed as a draft", async () => {
    const admin = await asRole(Role.ADMIN);
    const email = address();
    const saved = await saveDraft(admin.cookie, email);
    expect(saved.status, saved.text).toBe(201);
    const invitation = saved.json.data.invitation as { id: string; status: string; expiresAt: string | null; sentAt: string | null };
    expect(invitation).toMatchObject({ status: "draft", expiresAt: null, sentAt: null });
    expect(await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).toMatchObject({
      tokenHash: null,
      expiresAt: null,
      sentAt: null,
    });
    expect(await db.auditLog.count({ where: { action: "INVITATION_DRAFT_SAVED", targetId: invitation.id } })).toBe(1);
    expect(await mailAfterGrace(email)).toEqual([]);
    const list = await api(`${INVITATIONS}?limit=100`, { cookie: admin.cookie });
    expect(list.json.data.invitations.find((i: { id: string }) => i.id === invitation.id)).toMatchObject({ status: "draft" });
  });

  test("saving again for the same address and branch updates the draft; a SENT open invitation is never replaced by a draft; sending anew replaces a draft", async () => {
    const admin = await asRole(Role.ADMIN);
    const email = address();
    const first = await saveDraft(admin.cookie, email);
    const again = await saveDraft(admin.cookie, email, { role: "NON_TEACHING_STAFF" });
    expect(again.status).toBe(200);
    expect(again.json.data.invitation.id).toBe(first.json.data.invitation.id);
    expect(again.json.data.invitation.role).toBe("NON_TEACHING_STAFF");
    expect(await db.invitation.count({ where: { email } })).toBe(1);

    // A real invitation to the same pair replaces the draft (revoked, audited), as it replaces any open one.
    const real = await api(INVITATIONS, {
      method: "POST",
      cookie: admin.cookie,
      body: { email, role: "TEACHING_STAFF", branchId: home.id },
    });
    expect(real.status, real.text).toBe(201);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: first.json.data.invitation.id } })).revokedAt).not.toBeNull();
    // ...and now a draft for the same pair is refused: it must never silently kill a live link.
    const refused = await saveDraft(admin.cookie, email);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("INVITATION_PENDING");
    expect((await db.invitation.findUniqueOrThrow({ where: { id: real.json.data.invitation.id } })).revokedAt).toBeNull();
  });

  test("the rules of an invitation hold: a member, a branch that is not yours, an administrator by a branch administrator", async () => {
    const admin = await asRole(Role.ADMIN);
    const member = await asRole(Role.TEACHING_STAFF);
    const refusedMember = await saveDraft(admin.cookie, member.user.email);
    expect([refusedMember.status, refusedMember.json.error.code]).toEqual([409, "ALREADY_MEMBER"]);
    expect((await saveDraft(admin.cookie, address(), { branchId: other.id })).status).toBe(403);
    expect((await saveDraft(admin.cookie, address(), { role: "ADMIN" })).status).toBe(403);
    expect((await saveDraft(admin.cookie, address(), { branchId: "no-such-branch" })).status).toBe(400);
    const teacher = await asRole(Role.TEACHING_STAFF);
    expect((await saveDraft(teacher.cookie, address())).status).toBe(403);
    expect(await db.invitation.count()).toBe(0);
  });

  test("drafts for several branches are all or none", async () => {
    const boss = await superAdmin();
    const email = address();
    const both = await api(INVITATIONS, {
      method: "POST",
      cookie: boss.cookie,
      body: { email, role: "TEACHING_STAFF", branchIds: [home.id, other.id], draft: true },
    });
    expect(both.status, both.text).toBe(201);
    expect(both.json.data.invitations).toHaveLength(2);
    expect(await db.invitation.count({ where: { email, tokenHash: null } })).toBe(2);
    const member = await createUser();
    await db.membership.create({ data: { userId: member.id, branchId: other.id, role: Role.TEACHING_STAFF } });
    const none = await api(INVITATIONS, {
      method: "POST",
      cookie: boss.cookie,
      body: { email: member.email, role: "TEACHING_STAFF", branchIds: [home.id, other.id], draft: true },
    });
    expect(none.status).toBe(409);
    expect(await db.invitation.count({ where: { email: member.email } })).toBe(0); // nothing was kept for the branch that would have taken it
  });
});

test.describe("a draft is not a link", () => {
  test("it cannot be resent, previewed or accepted, and it is neither accepted-looking nor expired", async () => {
    const admin = await asRole(Role.ADMIN);
    const saved = await saveDraft(admin.cookie, address());
    const id = saved.json.data.invitation.id as string;
    expect((await api(`${INVITATIONS}/${id}/resend`, { method: "POST", cookie: admin.cookie, body: {} })).status).toBe(404);
    for (const token of ["a".repeat(43), "draft", "null"]) {
      expect((await api(`${INVITATIONS}/accept`, { body: { token, name: "Nobody", password: FRESH } })).status).toBeGreaterThanOrEqual(400);
      expect((await api(`${INVITATIONS}/preview`, { body: { token } })).status).not.toBe(200);
    }
    expect(await db.user.count({ where: { email: saved.json.data.invitation.email } })).toBe(0);
    const history = await api(`${INVITATIONS}/history?limit=100`, { cookie: admin.cookie });
    expect(history.json.data.invitations.map((i: { id: string }) => i.id)).not.toContain(id); // it is open, not history
  });
});

test.describe("sending a draft", () => {
  test("makes the link, e-mails it once, audits it; a second send is a 404; the link signs the person up", async () => {
    const admin = await asRole(Role.ADMIN);
    const email = address();
    const id = (await saveDraft(admin.cookie, email)).json.data.invitation.id as string;
    const sent = await sendDraft(admin.cookie, id);
    expect(sent.status, sent.text).toBe(200);
    expect(sent.json.data.invitation).toMatchObject({ status: "pending" });
    expect(sent.json.data.invitation.expiresAt).not.toBeNull();
    const row = await db.invitation.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).not.toBeNull();
    expect(row.sentAt).not.toBeNull();
    expect(Math.abs(row.expiresAt!.getTime() - (Date.now() + 7 * 864e5))).toBeLessThan(120_000);
    expect(await db.auditLog.count({ where: { action: "INVITATION_DRAFT_SENT", targetId: id } })).toBe(1);
    const mail = await waitForMail(email);
    expect(mail).toHaveLength(1);
    expect((await sendDraft(admin.cookie, id)).status).toBe(404);
    const accepted = await api(`${INVITATIONS}/accept`, { body: { token: tokenFrom(mail[0]), name: "Drafted Person", password: FRESH } });
    expect(accepted.status, accepted.text).toBe(200);
  });

  test("the membership rule is asked again: someone who joined since is a 409 and the draft stays", async () => {
    const admin = await asRole(Role.ADMIN);
    const joiner = await createUser();
    const id = (await saveDraft(admin.cookie, joiner.email)).json.data.invitation.id as string;
    await db.membership.create({ data: { userId: joiner.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const sent = await sendDraft(admin.cookie, id);
    expect([sent.status, sent.json.error.code]).toEqual([409, "ALREADY_MEMBER"]);
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).tokenHash).toBeNull();
    expect(await mailAfterGrace(joiner.email)).toEqual([]);
  });

  test("who may: another branch's administrator and a teacher are refused; a sent invitation is not a draft", async () => {
    const admin = await asRole(Role.ADMIN);
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const id = (await saveDraft(admin.cookie, address())).json.data.invitation.id as string;
    expect((await sendDraft(elsewhere.cookie, id)).status).toBe(404);
    expect((await sendDraft(teacher.cookie, id)).status).toBe(403);
    expect((await sendDraft(admin.cookie, "no-such-draft-id-0000000000")).status).toBe(404);
    const real = await api(INVITATIONS, {
      method: "POST",
      cookie: admin.cookie,
      body: { email: address(), role: "TEACHING_STAFF", branchId: home.id },
    });
    expect((await sendDraft(admin.cookie, real.json.data.invitation.id)).status).toBe(404);
  });
});

test.describe("editing and deleting a draft", () => {
  test("PATCH changes the address or the role of a draft only; the rules apply to the new address", async () => {
    const admin = await asRole(Role.ADMIN);
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    const member = await asRole(Role.TEACHING_STAFF);
    const id = (await saveDraft(admin.cookie, address())).json.data.invitation.id as string;
    const next = address();
    const changed = await api(`${INVITATIONS}/${id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { email: next.toUpperCase(), role: "NON_TEACHING_STAFF" },
    });
    expect(changed.status, changed.text).toBe(200);
    expect(changed.json.data.invitation).toMatchObject({ email: next, role: "NON_TEACHING_STAFF", status: "draft" });
    expect((await api(`${INVITATIONS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { email: member.user.email } })).status).toBe(
      409,
    );
    expect((await api(`${INVITATIONS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: {} })).status).toBe(400);
    expect((await api(`${INVITATIONS}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { role: "ADMIN" } })).status).toBe(403);
    expect((await api(`${INVITATIONS}/${id}`, { method: "PATCH", cookie: elsewhere.cookie, body: { role: "PARENT" } })).status).toBe(404);
    expect(
      (await api(`${INVITATIONS}/${id}`, { method: "PATCH", cookie: (await asRole(Role.TEACHING_STAFF)).cookie, body: { role: "PARENT" } }))
        .status,
    ).toBe(403);
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).role).toBe("NON_TEACHING_STAFF"); // unchanged by every refused attempt
    // Two drafts cannot end up at one address in one branch.
    const second = (await saveDraft(admin.cookie, address())).json.data.invitation.id as string;
    expect((await api(`${INVITATIONS}/${second}`, { method: "PATCH", cookie: admin.cookie, body: { email: next } })).status).toBe(409);
    // A SENT invitation is not edited.
    const sent = await api(INVITATIONS, {
      method: "POST",
      cookie: admin.cookie,
      body: { email: address(), role: "TEACHING_STAFF", branchId: home.id },
    });
    expect(
      (await api(`${INVITATIONS}/${sent.json.data.invitation.id}`, { method: "PATCH", cookie: admin.cookie, body: { role: "PARENT" } }))
        .status,
    ).toBe(404);
  });

  test("deleting a draft is audited as its own event, keeps the row for the history, and is read there as a deleted draft", async () => {
    const admin = await asRole(Role.ADMIN);
    const id = (await saveDraft(admin.cookie, address())).json.data.invitation.id as string;
    const gone = await api(`${INVITATIONS}/${id}`, { method: "DELETE", cookie: admin.cookie });
    expect(gone.status, gone.text).toBe(200);
    expect(await db.auditLog.count({ where: { action: "INVITATION_DRAFT_DELETED", targetId: id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "INVITATION_REVOKED", targetId: id } })).toBe(0);
    const history = await api(`${INVITATIONS}/history?limit=100`, { cookie: admin.cookie });
    const row = history.json.data.invitations.find((i: { id: string }) => i.id === id);
    expect(row).toMatchObject({ revokedWhy: "draft deleted", sentAt: null });
    // The pair is free again.
    expect((await saveDraft(admin.cookie, row.email)).status).toBe(201);
  });
});

test.describe("Send all drafts", () => {
  test("sends every draft the caller may see, e-mails each, and says how many remain; another branch's drafts are left alone", async () => {
    const boss = await superAdmin();
    const admin = await asRole(Role.ADMIN);
    const mine = [address(), address(), address()];
    for (const email of mine) await saveDraft(admin.cookie, email);
    const theirs = address();
    await saveDraft(boss.cookie, theirs, { branchId: other.id });
    const adminOnly = address();
    await saveDraft(boss.cookie, adminOnly, { role: "ADMIN" }); // a branch administrator never sees or sends an administrator's invitation

    const all = await api(`${INVITATIONS}/drafts/send`, { method: "POST", cookie: admin.cookie, body: {} });
    expect(all.status, all.text).toBe(200);
    expect(all.json.data).toMatchObject({ sent: 3, remaining: 0, rateLimited: false });
    for (const email of mine) expect(await waitForMail(email)).toHaveLength(1);
    expect(await db.invitation.count({ where: { email: { in: mine }, tokenHash: { not: null } } })).toBe(3);
    expect((await db.invitation.findFirstOrThrow({ where: { email: theirs } })).tokenHash).toBeNull();
    expect((await db.invitation.findFirstOrThrow({ where: { email: adminOnly } })).tokenHash).toBeNull();
    expect(await db.auditLog.count({ where: { action: "INVITATION_DRAFT_SENT" } })).toBe(3);

    // A superadmin sends the rest; named ids send only those.
    const left = await api(`${INVITATIONS}/drafts/send`, {
      method: "POST",
      cookie: boss.cookie,
      body: { ids: [(await db.invitation.findFirstOrThrow({ where: { email: theirs } })).id] },
    });
    expect(left.json.data).toMatchObject({ sent: 1, remaining: 1 });
    // A teacher cannot.
    expect(
      (await api(`${INVITATIONS}/drafts/send`, { method: "POST", cookie: (await asRole(Role.TEACHING_STAFF)).cookie, body: {} })).status,
    ).toBe(403);
  });
});

test.describe("from staff records and from a file", () => {
  test("inviting staff records as drafts saves one draft each, links the record on send, and the card says it is a draft, not 'Invited'", async () => {
    const admin = await asRole(Role.ADMIN);
    const person = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Amina", lastName: "Yusuf", email: address() },
    });
    const made = await api("/api/v1/staff/invite", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, staffIds: [person.id], draft: true },
    });
    expect(made.status, made.text).toBe(200);
    expect(made.json.data).toMatchObject({ drafted: 1, invited: 0 });
    expect(made.json.data.outcomes[0]).toMatchObject({ result: "drafted" });
    const draft = await db.invitation.findFirstOrThrow({ where: { staffRecordId: person.id } });
    expect(draft.tokenHash).toBeNull();
    expect(await mailAfterGrace(person.email!)).toEqual([]);
    const card = (await api(`/api/v1/staff?branchId=${home.id}&status=live&q=`, { cookie: admin.cookie })).json.data.staff.find(
      (s: { id: string }) => s.id === person.id,
    );
    expect(card).toMatchObject({ invited: null, inviteDraft: true });

    expect((await sendDraft(admin.cookie, draft.id)).status).toBe(200);
    const mail = await waitForMail(person.email!);
    const accepted = await api(`${INVITATIONS}/accept`, { body: { token: tokenFrom(mail[0]), name: "Amina Yusuf", password: FRESH } });
    expect(accepted.status, accepted.text).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email: person.email! } });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: person.id } })).userId).toBe(user.id);
  });

  test("the bulk file saves every row as a draft when asked; nothing is e-mailed", async () => {
    const admin = await asRole(Role.ADMIN);
    const rows = [address(), address()].map((email, i) => ({ line: i + 2, values: { email, role: "Teaching staff" } }));
    const saved = await api(`${INVITATIONS}/import`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, asDraft: true, rows },
    });
    expect(saved.status, saved.text).toBe(201);
    expect(await db.invitation.count({ where: { branchId: home.id, tokenHash: null } })).toBe(2);
    for (const r of rows) expect(await mailAfterGrace(r.values.email, 300)).toEqual([]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "INVITATIONS_BULK_IMPORTED" } });
    expect((audit.afterValue as { asDraft?: boolean }).asDraft).toBe(true);
    // A second save of the same file is refused for the rows that already have an open draft? No: a draft is updated, so it saves again without duplicates.
    const again = await api(`${INVITATIONS}/import`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, dryRun: false, asDraft: true, rows },
    });
    expect(again.status, again.text).toBe(201);
    expect(await db.invitation.count({ where: { branchId: home.id } })).toBe(2);
  });
});
