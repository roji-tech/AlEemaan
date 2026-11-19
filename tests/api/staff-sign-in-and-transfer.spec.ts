import "../support/env";
import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { hashInvitationToken } from "@/lib/invitations/token";

// Task 0112 over real HTTP: inviting staff from their records (and accepting links the record), moving a member of staff to another branch or adding them there, and the class teacher on
// the class list. Who may do each is checked first.

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
  // A superadmin holds at least one membership (a superadmin flag alone grants nothing); `role: ADMIN` gives both.
  const user = await createUser({ role: Role.ADMIN });
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
const invite = (cookie: string, branchId: string, staffIds: string[]) =>
  api("/api/v1/staff/invite", { method: "POST", cookie, body: { branchId, staffIds } });

test.describe("invite staff from their records", () => {
  test("one invitation per record at its address, the role from its kind; the rest are skipped with why; another branch's administrator is refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await record(home.id);
    const bursar = await record(home.id, { category: "NON_TEACHING" });
    const noEmail = await record(home.id, { email: null });
    const archived = await record(home.id, { archivedAt: new Date() });
    const elsewhere = await record(other.id);
    const res = await invite(admin.cookie, home.id, [teacher.id, bursar.id, noEmail.id, archived.id, elsewhere.id]);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(res.json)).not.toMatch(/token/i);
    const byId = Object.fromEntries(
      (res.json.data.outcomes as { staffId: string; result: string; why?: string }[]).map((o) => [o.staffId, o]),
    );
    expect(byId[teacher.id].result).toBe("invited");
    expect(byId[bursar.id].result).toBe("invited");
    expect(byId[noEmail.id]).toMatchObject({ result: "skipped", why: expect.stringContaining("No e-mail") });
    expect(byId[archived.id]).toMatchObject({ result: "skipped", why: expect.stringContaining("Archived") });
    expect(byId[elsewhere.id]).toMatchObject({ result: "skipped", why: expect.stringContaining("Not a staff record of this branch") });
    const rows = await db.invitation.findMany({ where: { branchId: home.id }, orderBy: { email: "asc" } });
    expect(rows.map((r) => [r.email, r.role, r.staffRecordId]).sort()).toEqual(
      [
        [teacher.email, "TEACHING_STAFF", teacher.id],
        [bursar.email, "NON_TEACHING_STAFF", bursar.id],
      ].sort(),
    );
    // A second press leaves the waiting link alone.
    const again = await invite(admin.cookie, home.id, [teacher.id]);
    expect(again.json.data.outcomes[0]).toMatchObject({ result: "skipped", why: expect.stringContaining("Already invited") });
    // The list shows it as waiting.
    const list = await api(`/api/v1/staff?branchId=${home.id}`, { cookie: admin.cookie });
    const shown = (list.json.data.staff as { id: string; invited: { expired: boolean } | null }[]).find((p) => p.id === teacher.id)!;
    expect(shown.invited).toMatchObject({ expired: false });

    const otherAdmin = await asRole(Role.ADMIN, [other.id]);
    expect((await invite(otherAdmin.cookie, home.id, [teacher.id])).status).toBe(403);
    const staffMember = await asRole(Role.TEACHING_STAFF);
    expect((await invite(staffMember.cookie, home.id, [teacher.id])).status).toBe(403);
    expect((await invite(admin.cookie, home.id, [])).status).toBe(400);
  });

  test("accepting the invitation links the new account to the record; an address already a free member is linked at once", async () => {
    const admin = await asRole(Role.ADMIN);
    const person = await record(home.id);
    expect((await invite(admin.cookie, home.id, [person.id])).json.data.invited).toBe(1);
    const invitation = await db.invitation.findFirstOrThrow({ where: { staffRecordId: person.id } });
    const token = `staff-${Date.now()}-token-value-long-enough`;
    await db.invitation.update({ where: { id: invitation.id }, data: { tokenHash: hashInvitationToken(token) } });
    const accepted = await api("/api/v1/invitations/accept", { body: { token, name: "Amina Yusuf", password: FRESH } });
    expect(accepted.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email: person.email! } });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: person.id } })).userId).toBe(user.id);
    expect(await db.auditLog.count({ where: { action: "STAFF_ACCOUNT_LINKED", targetId: person.id } })).toBe(1);

    // Already a member of the branch with the matching role and not anyone's record: linked at once, no invitation.
    const member = await createUser();
    await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const theirs = await record(home.id, { email: member.email });
    const linked = await invite(admin.cookie, home.id, [theirs.id]);
    expect(linked.json.data.outcomes[0]).toMatchObject({ result: "linked" });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: theirs.id } })).userId).toBe(member.id);
    expect(await db.invitation.count({ where: { email: member.email } })).toBe(0);
  });
});

test.describe("everyone who signs in with a staff role is on the staff list (the maintainer, 2026-11-19)", () => {
  const acceptAs = async (invitationId: string, name: string) => {
    const token = randomBytes(32).toString("base64url"); // the route takes exactly 43 characters of base64url
    await db.invitation.update({ where: { id: invitationId }, data: { tokenHash: hashInvitationToken(token) } });
    return api("/api/v1/invitations/accept", { body: { token, name, password: FRESH } });
  };
  const inviteSomeone = async (cookie: string, email: string, role: Role) => {
    const sent = await api("/api/v1/invitations", { method: "POST", cookie, body: { email, role, branchId: home.id } });
    expect(sent.status, JSON.stringify(sent.json)).toBe(201);
    return db.invitation.findFirstOrThrow({ where: { email, acceptedAt: null }, orderBy: { createdAt: "desc" } });
  };

  test("Invite someone as an administrator: accepting puts them on the branch's staff list, a Non-teaching record titled Administrator, linked", async () => {
    const boss = await superAdmin();
    const email = `khalid-${Date.now()}@school.example`;
    const invitation = await inviteSomeone(boss.cookie, email, Role.ADMIN);
    expect((await acceptAs(invitation.id, "Akinniyi Khalid")).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const made = await db.staffRecord.findFirstOrThrow({ where: { branchId: home.id, userId: user.id } });
    expect(made).toMatchObject({
      category: "NON_TEACHING",
      designation: "Administrator",
      firstName: "Akinniyi",
      lastName: "Khalid",
      email,
    });
    expect(await db.auditLog.count({ where: { action: "STAFF_CREATED", targetId: made.id } })).toBe(1);
    // It is on the list the Staff tab reads.
    const list = await api(`/api/v1/staff?branchId=${home.id}&status=live&q=`, { cookie: boss.cookie });
    expect(list.json.data.staff.map((s: { id: string }) => s.id)).toContain(made.id);
  });

  test("an unlinked record with the same address is linked instead of a second one being made; an administrator may be the account of a Teaching record", async () => {
    const boss = await superAdmin();
    const email = `tola-${Date.now()}@school.example`;
    const theirs = await record(home.id, { email });
    const invitation = await inviteSomeone(boss.cookie, email, Role.ADMIN);
    expect((await acceptAs(invitation.id, "Tola Ade")).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: theirs.id } })).userId).toBe(user.id);
    expect(await db.staffRecord.count({ where: { branchId: home.id, email } })).toBe(1);
  });

  test("a parent's invitation makes no staff record", async () => {
    const boss = await superAdmin();
    const email = `parent-${Date.now()}@family.example`;
    const invitation = await inviteSomeone(boss.cookie, email, Role.PARENT);
    expect((await acceptAs(invitation.id, "Bisi Parent")).status).toBe(200);
    expect(await db.staffRecord.count({ where: { email } })).toBe(0);
  });

  test("members who joined before: listed as not on the staff list, Add to staff makes or links their record; who may", async () => {
    const admin = await asRole(Role.ADMIN);
    const joinedBefore = await createUser({ name: "Musa Bello" });
    await db.membership.create({ data: { userId: joinedBefore.id, branchId: home.id, role: Role.ADMIN } });
    const teacher = await createUser({ name: "Ngozi Eze" });
    await db.membership.create({ data: { userId: teacher.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const theirRecord = await record(home.id, { email: teacher.email });
    const parent = await createUser();
    await db.membership.create({ data: { userId: parent.id, branchId: home.id, role: Role.PARENT } });

    const unlisted = await api(`/api/v1/staff/unlisted?branchId=${home.id}`, { cookie: admin.cookie });
    expect(unlisted.status).toBe(200);
    const ids = unlisted.json.data.members.map((m: { userId: string }) => m.userId);
    expect(ids).toEqual(expect.arrayContaining([joinedBefore.id, teacher.id, admin.user.id]));
    expect(ids).not.toContain(parent.id);

    const add = (userId: string, cookie = admin.cookie, branchId = home.id) =>
      api("/api/v1/staff/from-member", { method: "POST", cookie, body: { branchId, userId } });
    expect((await add(joinedBefore.id)).json.data).toEqual({ done: "created" });
    expect(await db.staffRecord.findFirstOrThrow({ where: { branchId: home.id, userId: joinedBefore.id } })).toMatchObject({
      firstName: "Musa",
      lastName: "Bello",
      designation: "Administrator",
    });
    expect((await add(teacher.id)).json.data).toEqual({ done: "linked" });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: theirRecord.id } })).userId).toBe(teacher.id);
    expect((await add(joinedBefore.id)).status).toBe(409);
    expect((await add(parent.id)).status).toBe(409);
    expect((await add("no-such-user")).status).toBe(404);
    const after = await api(`/api/v1/staff/unlisted?branchId=${home.id}`, { cookie: admin.cookie });
    expect(after.json.data.members.map((m: { userId: string }) => m.userId)).toEqual([admin.user.id]);

    // Another branch's administrator, and a teacher of this one, cannot.
    const elsewhere = await asRole(Role.ADMIN, [other.id]);
    expect((await api(`/api/v1/staff/unlisted?branchId=${home.id}`, { cookie: elsewhere.cookie })).status).toBe(404);
    expect((await add(admin.user.id, elsewhere.cookie)).status).toBe(403);
    const reader = await asRole(Role.TEACHING_STAFF);
    expect((await api(`/api/v1/staff/unlisted?branchId=${home.id}`, { cookie: reader.cookie })).status).toBe(403);
    expect((await add(admin.user.id, reader.cookie)).status).toBe(403);
  });

  test("Manage > Sign-in offers an administrator's account for either kind of record, and links it", async () => {
    const admin = await asRole(Role.ADMIN);
    const head = await createUser({ name: "Head Teacher" });
    await db.membership.create({ data: { userId: head.id, branchId: home.id, role: Role.ADMIN } });
    const teaching = await record(home.id);
    const offered = await api(`/api/v1/staff/${teaching.id}/account`, { cookie: admin.cookie });
    expect(offered.json.data.accounts.map((a: { userId: string }) => a.userId)).toContain(head.id);
    const linked = await api(`/api/v1/staff/${teaching.id}/account`, { method: "PUT", cookie: admin.cookie, body: { userId: head.id } });
    expect(linked.status, JSON.stringify(linked.json)).toBe(200);
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: teaching.id } })).userId).toBe(head.id);
  });
});

test.describe("transfer or add to another branch", () => {
  test("also: a linked record there with the person's details, nothing of the branch; both cards say Also in; the sign-in follows", async () => {
    const admin = await superAdmin();
    const member = await createUser();
    await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const person = await record(home.id, {
      email: member.email,
      userId: member.id,
      title: "Mrs",
      qualification: "B.Ed",
      corpsMember: true,
    });
    const res = await api(`/api/v1/staff/${person.id}/transfer`, {
      method: "POST",
      cookie: admin.cookie,
      body: { toBranchId: other.id, mode: "also" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ ok: true, account: "linked" });
    const created = await db.staffRecord.findUniqueOrThrow({ where: { id: res.json.data.newId } });
    expect(created).toMatchObject({
      branchId: other.id,
      title: "Mrs",
      qualification: "B.Ed",
      corpsMember: true,
      userId: member.id,
      archivedAt: null,
    });
    const source = await db.staffRecord.findUniqueOrThrow({ where: { id: person.id } });
    expect(source.archivedAt).toBeNull();
    expect(source.personId).toBeTruthy();
    expect(created.personId).toBe(source.personId);
    expect(await db.membership.count({ where: { userId: member.id, deactivatedAt: null } })).toBe(2);
    const list = await api(`/api/v1/staff?branchId=${home.id}`, { cookie: admin.cookie });
    expect(
      (list.json.data.staff as { id: string; alsoIn: { branchId: string }[] }[])
        .find((p) => p.id === person.id)!
        .alsoIn.map((b) => b.branchId),
    ).toEqual([other.id]);
    // A second time is refused: that branch already has this person.
    const twice = await api(`/api/v1/staff/${person.id}/transfer`, {
      method: "POST",
      cookie: admin.cookie,
      body: { toBranchId: other.id, mode: "also" },
    });
    expect(twice.status).toBe(409);
    expect(await db.auditLog.count({ where: { action: "STAFF_ADDED_TO_BRANCH", targetId: person.id } })).toBe(1);
  });

  test("move: the record here is archived, its assignments, class-teacher roles and grants end (counted first), and the sign-in here is deactivated", async () => {
    const admin = await asRole(Role.ADMIN, [home.id, other.id]);
    const member = await createUser();
    await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    const person = await record(home.id, { email: member.email, userId: member.id });
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 1 } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A", classTeacherId: person.id } });
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Maths" } });
    await db.subjectOffering.create({ data: { branchId: home.id, classGroupId: group.id, subjectId: subject.id } });
    await db.staffSubjectAssignment.create({
      data: { branchId: home.id, staffRecordId: person.id, subjectId: subject.id, classArmId: arm.id },
    });
    const preview = await api(`/api/v1/staff/${person.id}/transfer`, { cookie: admin.cookie });
    expect(preview.json.data.ends).toEqual({ assignments: 1, classTeacher: 1, grants: 0 });
    const res = await api(`/api/v1/staff/${person.id}/transfer`, {
      method: "POST",
      cookie: admin.cookie,
      body: { toBranchId: other.id, mode: "move" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.ended).toEqual({ assignments: 1, classTeacher: 1, grants: 0 });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: person.id } })).archivedAt).not.toBeNull();
    expect((await db.classArm.findUniqueOrThrow({ where: { id: arm.id } })).classTeacherId).toBeNull();
    expect(await db.staffSubjectAssignment.count({ where: { staffRecordId: person.id } })).toBe(0);
    const memberships = await db.membership.findMany({ where: { userId: member.id }, select: { branchId: true, deactivatedAt: true } });
    expect(memberships.find((m) => m.branchId === home.id)!.deactivatedAt).not.toBeNull();
    expect(memberships.find((m) => m.branchId === other.id)!.deactivatedAt).toBeNull();
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: res.json.data.newId } })).userId).toBe(member.id);
  });

  test("who may: an administrator of only one of the two branches cannot; another branch's record is not found; a teacher cannot", async () => {
    const person = await record(home.id);
    const homeAdmin = await asRole(Role.ADMIN);
    const go = (cookie: string, id = person.id, toBranchId = other.id) =>
      api(`/api/v1/staff/${id}/transfer`, { method: "POST", cookie, body: { toBranchId, mode: "also" } });
    expect((await go(homeAdmin.cookie)).status).toBe(403);
    const otherAdmin = await asRole(Role.ADMIN, [other.id]);
    const notFound = await go(otherAdmin.cookie);
    const unknown = await go(otherAdmin.cookie, "no-such-record");
    expect([notFound.status, notFound.json]).toEqual([404, unknown.json]);
    expect((await go((await asRole(Role.TEACHING_STAFF, [home.id, other.id])).cookie)).status).toBe(403);
    // Its own branch is not "another branch".
    const same = await asRole(Role.ADMIN, [home.id, other.id]);
    expect((await go(same.cookie, person.id, home.id)).status).toBe(409);
    expect(await db.staffRecord.count({ where: { branchId: other.id } })).toBe(0);
  });
});

test("the class list names each arm's class teacher", async () => {
  const admin = await asRole(Role.ADMIN);
  const person = await record(home.id, { title: "Mr", firstName: "Musa", lastName: "Bello" });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2", sortOrder: 2 } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "B" } });
  const set = await api(`/api/v1/academics/arms/${arm.id}/class-teacher`, {
    method: "PATCH",
    cookie: admin.cookie,
    body: { branchId: home.id, staffRecordId: person.id },
  });
  expect(set.status).toBe(200);
  const list = await api(`/api/v1/academics/class-groups?branchId=${home.id}`, { cookie: admin.cookie });
  const arms = (list.json.data.classGroups as { arms: { id: string; classTeacher: { id: string; name: string } | null }[] }[]).flatMap(
    (g) => g.arms,
  );
  expect(arms.find((a) => a.id === arm.id)!.classTeacher).toEqual({ id: person.id, name: "Mr Musa Bello" });
  const staff = await api(`/api/v1/staff?branchId=${home.id}`, { cookie: admin.cookie });
  expect(
    (staff.json.data.staff as { id: string; classTeacherOf: { label: string }[] }[]).find((p) => p.id === person.id)!.classTeacherOf,
  ).toEqual([{ armId: arm.id, label: "JSS 2 B" }]);
});
