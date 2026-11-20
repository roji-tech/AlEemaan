import "../support/env";
import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { hashInvitationToken } from "@/lib/invitations/token";

// Sweep 2 (task 0118, the maintainer 2026-11-20 "start in sweep"): (A) the accept rule and the unlisted list leave draft staff records alone; (B) staff with no branch yet: only a superadmin
// sees or changes them, they are in no branch's list, count, export or search, they can be placed in a branch, and until then nothing that needs a branch works on them.

const FRESH = "a-fresh-unseen-passphrase-3";
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
const superAdmin = async () => {
  // A superadmin holds at least one membership (a flag alone grants nothing); `role: ADMIN` gives both.
  const user = await createUser({ role: Role.ADMIN });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
let n = 0;
const record = (branchId: string | null, extra: object = {}) =>
  db.staffRecord.create({
    data: {
      branchId,
      category: "TEACHING",
      firstName: `Sweep${++n}`,
      lastName: "Person",
      email: `sweep${n}-${Date.now()}@school.example`,
      ...extra,
    },
  });
const UNPLACED = "/api/v1/staff/unplaced";
const newPerson = (extra: object = {}) => ({ category: "TEACHING", firstName: `Nobranch${++n}`, lastName: "Staff", ...extra });

test.describe("A: the accept rule and the unlisted list leave drafts alone", () => {
  const acceptAs = async (invitationId: string, name: string) => {
    const token = randomBytes(32).toString("base64url");
    await db.invitation.update({ where: { id: invitationId }, data: { tokenHash: hashInvitationToken(token) } });
    return api("/api/v1/invitations/accept", { body: { token, name, password: FRESH } });
  };

  test("a draft that holds the address is not linked and not duplicated; the person shows as not on the list; Add to staff says why", async () => {
    const boss = await superAdmin();
    const email = `drafted-${Date.now()}@school.example`;
    const draft = await record(home.id, { email, isDraft: true });
    const sent = await api("/api/v1/invitations", {
      method: "POST",
      cookie: boss.cookie,
      body: { email, role: "TEACHING_STAFF", branchId: home.id },
    });
    expect(sent.status, sent.text).toBe(201);
    const invitation = await db.invitation.findFirstOrThrow({ where: { email, acceptedAt: null } });
    expect((await acceptAs(invitation.id, "Drafted Person")).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });

    // The draft is exactly as it was; no second record was made.
    expect(await db.staffRecord.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ userId: null, isDraft: true });
    expect(await db.staffRecord.count({ where: { branchId: home.id, email } })).toBe(1);

    const unlisted = await api(`/api/v1/staff/unlisted?branchId=${home.id}`, { cookie: boss.cookie });
    expect(unlisted.json.data.members.map((m: { userId: string }) => m.userId)).toContain(user.id);
    const add = await api("/api/v1/staff/from-member", {
      method: "POST",
      cookie: boss.cookie,
      body: { branchId: home.id, userId: user.id },
    });
    expect(add.status).toBe(409);
    expect(add.json.error.message).toMatch(/draft/i);

    // Completing the draft and linking from Manage then works as usual.
    await db.staffRecord.update({ where: { id: draft.id }, data: { isDraft: false, gender: "FEMALE" } });
    const link = await api(`/api/v1/staff/${draft.id}/account`, { method: "PUT", cookie: boss.cookie, body: { userId: user.id } });
    expect(link.status, link.text).toBe(200);
  });

  test("an invitation sent from a record that has become a draft since leaves the record unlinked", async () => {
    const admin = await asRole(Role.ADMIN);
    const person = await record(home.id);
    const sent = await api("/api/v1/staff/invite", {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, staffIds: [person.id] },
    });
    expect(sent.json.data.invited).toBe(1);
    // (Marking a record with an invitation waiting as a draft is refused by the API, so the state is made directly: it is what a race would leave.)
    await db.staffRecord.update({ where: { id: person.id }, data: { isDraft: true } });
    const invitation = await db.invitation.findFirstOrThrow({ where: { staffRecordId: person.id } });
    expect((await acceptAs(invitation.id, "Late Draft")).status).toBe(200);
    expect(await db.staffRecord.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ userId: null, isDraft: true });
    expect(await db.staffRecord.count({ where: { branchId: home.id, userId: { not: null } } })).toBe(0);
  });

  test("a live record with the same address is still linked, a draft with another address does not matter", async () => {
    const boss = await superAdmin();
    const email = `live-${Date.now()}@school.example`;
    const live = await record(home.id, { email });
    await record(home.id, { isDraft: true });
    await api("/api/v1/invitations", { method: "POST", cookie: boss.cookie, body: { email, role: "TEACHING_STAFF", branchId: home.id } });
    const invitation = await db.invitation.findFirstOrThrow({ where: { email, acceptedAt: null } });
    expect((await acceptAs(invitation.id, "Live Person")).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: live.id } })).userId).toBe(user.id);
  });
});

test.describe("B: staff with no branch yet", () => {
  test("only a superadmin adds, lists, edits, places and deletes them; everyone else is refused", async () => {
    const boss = await superAdmin();
    const branchAdmin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    const made = await api(UNPLACED, {
      method: "POST",
      cookie: boss.cookie,
      body: newPerson({ email: `np-${Date.now()}@school.example` }),
    });
    expect(made.status, made.text).toBe(201);
    const view = made.json.data.staff as { id: string; branchId: string | null; branchName: string | null };
    expect(view).toMatchObject({ branchId: null, branchName: null });
    expect(await db.auditLog.count({ where: { action: "STAFF_CREATED", targetId: view.id } })).toBe(1);

    // A branch's administrator and a teacher: the list and the creation are 403; one record is a 404 (its existence is not shown).
    for (const who of [branchAdmin, teacher]) {
      expect((await api(UNPLACED, { cookie: who.cookie })).status).toBe(403);
      expect((await api(UNPLACED, { method: "POST", cookie: who.cookie, body: newPerson() })).status).toBe(403);
    }
    expect(
      (await api(`${UNPLACED}/${view.id}`, { method: "PATCH", cookie: branchAdmin.cookie, body: { firstName: "Hacked" } })).status,
    ).toBe(404);
    expect((await api(`${UNPLACED}/${view.id}`, { method: "DELETE", cookie: branchAdmin.cookie })).status).toBe(404);
    expect(
      (await api(`${UNPLACED}/${view.id}/place`, { method: "POST", cookie: branchAdmin.cookie, body: { branchId: home.id } })).status,
    ).toBe(404);
    // A teacher is refused at the role gate on every write.
    expect((await api(`${UNPLACED}/${view.id}`, { method: "PATCH", cookie: teacher.cookie, body: { firstName: "Hacked" } })).status).toBe(
      403,
    );
    expect((await api(`${UNPLACED}/${view.id}`, { method: "DELETE", cookie: teacher.cookie })).status).toBe(403);
    expect(
      (await api(`${UNPLACED}/${view.id}/place`, { method: "POST", cookie: teacher.cookie, body: { branchId: home.id } })).status,
    ).toBe(403);
    // Nothing changed by any refused attempt.
    expect(await db.staffRecord.findUniqueOrThrow({ where: { id: view.id } })).toMatchObject({ branchId: null });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: view.id } })).firstName).not.toBe("Hacked");

    const listed = await api(UNPLACED, { cookie: boss.cookie });
    expect(listed.json.data.staff.map((s: { id: string }) => s.id)).toEqual([view.id]);
    const edited = await api(`${UNPLACED}/${view.id}`, { method: "PATCH", cookie: boss.cookie, body: { firstName: "Renamed" } });
    expect(edited.status, edited.text).toBe(200);
    expect(edited.json.data.staff.firstName).toBe("Renamed");
  });

  test("an unplaced record is in no branch's list, 'all branches', search or export; the ordinary routes do not find it", async () => {
    const boss = await superAdmin();
    const placed = await record(home.id, { firstName: "Zebra", lastName: "Placed" });
    const made = await api(UNPLACED, {
      method: "POST",
      cookie: boss.cookie,
      body: newPerson({ firstName: "Zebra", lastName: "Unplaced" }),
    });
    const id = made.json.data.staff.id as string;

    for (const branchId of [home.id, other.id]) {
      const list = await api(`/api/v1/staff?branchId=${branchId}&status=live&q=`, { cookie: boss.cookie });
      expect(list.json.data.staff.map((s: { id: string }) => s.id)).not.toContain(id);
    }
    const all = await api("/api/v1/staff?branchId=all&status=live&q=", { cookie: boss.cookie });
    const ids = all.json.data.staff.map((s: { id: string }) => s.id);
    expect(ids).toContain(placed.id);
    expect(ids).not.toContain(id); // not even for a superadmin: "every branch" is every branch's staff
    const found = await api("/api/v1/search?q=Zebra", { cookie: boss.cookie });
    expect(JSON.stringify(found.json.data)).not.toContain(id);
    const exported = await api("/api/v1/exports", {
      method: "POST",
      cookie: boss.cookie,
      body: { kind: "staff", branchId: home.id, scope: "all" },
    });
    expect(exported.status, exported.text).toBe(200);
    expect(JSON.stringify(exported.json.data)).not.toContain("Unplaced");

    // The routes that name a record through its branch find nothing: there is no branch to act in.
    expect((await api(`/api/v1/staff/${id}`, { cookie: boss.cookie })).status).toBe(404);
    expect((await api(`/api/v1/staff/${id}`, { method: "PATCH", cookie: boss.cookie, body: { firstName: "X" } })).status).toBe(404);
    expect((await api(`/api/v1/staff/${id}/transfer`, { cookie: boss.cookie })).status).toBe(404);
    expect(
      (await api(`/api/v1/staff/${id}/transfer`, { method: "POST", cookie: boss.cookie, body: { toBranchId: other.id, mode: "also" } }))
        .status,
    ).toBe(404);
    expect(
      (await api(`/api/v1/staff/${id}/assignments`, { method: "POST", cookie: boss.cookie, body: { subjectId: "x", classArmId: "y" } }))
        .status,
    ).toBe(404);
    const invited = await api("/api/v1/staff/invite", { method: "POST", cookie: boss.cookie, body: { branchId: home.id, staffIds: [id] } });
    expect(invited.json.data.outcomes[0]).toMatchObject({ result: "skipped" }); // "not a staff record of this branch"
    expect(await db.invitation.count()).toBe(0);
  });

  test("the address is unique among live unplaced records, and may match a record in a branch", async () => {
    const boss = await superAdmin();
    const email = `same-${Date.now()}@school.example`;
    expect((await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson({ email }) })).status).toBe(201);
    const again = await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson({ email: email.toUpperCase() }) });
    expect(again.status).toBe(409);
    await record(home.id, { email });
    expect((await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson({ email: `other-${email}` }) })).status).toBe(201);
  });

  test("a draft can be saved without a branch too", async () => {
    const boss = await superAdmin();
    const made = await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson({ isDraft: true }) });
    expect(made.status, made.text).toBe(201);
    expect(made.json.data.staff).toMatchObject({ isDraft: true, branchId: null });
  });

  test("placing: audited, then the branch's administrators manage it; a clash with a live record there is a 409; a placed record cannot be placed again", async () => {
    const boss = await superAdmin();
    const branchAdmin = await asRole(Role.ADMIN);
    const email = `place-${Date.now()}@school.example`;
    const made = await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson({ email }) });
    const id = made.json.data.staff.id as string;
    // The administrator of the target branch has no authority over an unplaced record (404), nor does a branch they do not administer matter.
    expect((await api(`${UNPLACED}/${id}/place`, { method: "POST", cookie: branchAdmin.cookie, body: { branchId: home.id } })).status).toBe(
      404,
    );

    await record(other.id, { email }); // a live record with the same address in the other branch
    const clash = await api(`${UNPLACED}/${id}/place`, { method: "POST", cookie: boss.cookie, body: { branchId: other.id } });
    expect(clash.status).toBe(409);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id } })).branchId).toBeNull();

    const placed = await api(`${UNPLACED}/${id}/place`, { method: "POST", cookie: boss.cookie, body: { branchId: home.id } });
    expect(placed.status, placed.text).toBe(200);
    expect(placed.json.data.staff.branchId).toBe(home.id);
    expect(await db.auditLog.count({ where: { action: "STAFF_PLACED", targetId: id } })).toBe(1);
    expect((await api(`${UNPLACED}/${id}/place`, { method: "POST", cookie: boss.cookie, body: { branchId: home.id } })).status).toBe(409);
    // Now an ordinary record of the branch: its administrator reads and changes it, and it is no longer in the unplaced list.
    expect((await api(`/api/v1/staff/${id}`, { method: "PATCH", cookie: branchAdmin.cookie, body: { firstName: "Mine" } })).status).toBe(
      200,
    );
    expect((await api(UNPLACED, { cookie: boss.cookie })).json.data.staff).toEqual([]);
    expect(
      (await api(`/api/v1/staff?branchId=${home.id}&status=live&q=`, { cookie: branchAdmin.cookie })).json.data.staff.map(
        (s: { id: string }) => s.id,
      ),
    ).toContain(id);
    // An unknown branch is a 404, not a placement.
    const second = await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson() });
    expect(
      (
        await api(`${UNPLACED}/${second.json.data.staff.id}/place`, {
          method: "POST",
          cookie: boss.cookie,
          body: { branchId: "no-such-branch" },
        })
      ).status,
    ).toBe(404);
  });

  test("deleting an unplaced record is for a superadmin only, audited, and leaves no one's account touched", async () => {
    const boss = await superAdmin();
    const made = await api(UNPLACED, { method: "POST", cookie: boss.cookie, body: newPerson() });
    const id = made.json.data.staff.id as string;
    const gone = await api(`${UNPLACED}/${id}`, { method: "DELETE", cookie: boss.cookie });
    expect(gone.status, gone.text).toBe(200);
    expect(await db.staffRecord.count({ where: { id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "STAFF_DELETED", targetId: id } })).toBe(1);
    expect((await api(`${UNPLACED}/${id}`, { method: "DELETE", cookie: boss.cookie })).status).toBe(404);
    // A PLACED record is not reachable through the unplaced route (404), so it cannot be deleted around the branch rules.
    const placed = await record(home.id);
    expect((await api(`${UNPLACED}/${placed.id}`, { method: "DELETE", cookie: boss.cookie })).status).toBe(404);
    expect(await db.staffRecord.count({ where: { id: placed.id } })).toBe(1);
  });
});
