import { test, expect } from "@playwright/test";
import { EVERY_BRANCH, adminScope } from "@/lib/auth/branch-access";
import { Role as R, BRANCH_NAMES, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { createSession } from "@/lib/auth/session";
import { changeMember, deactivateMember, escapeLike, listMembers, reactivateMember, setSuperAdmin } from "@/lib/members/service";

// The school's people, in-process (domain-implementation-plan.md, "Build design — Users pages and invitations"): who may change whom,
// the last-superadmin guard (including under concurrency), a branch administrator's scope, self-changes, and what deactivation does to a person's sessions.
// Every test starts from an empty database (the guards count ALL superadmins, so leftovers from another spec would change the answer).

let branches: { id: string; name: string }[];

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
});

/// A person with one membership; returns the person and the membership's id (what every action addresses).
async function person(role: R, opts: { name?: string; branch?: number; email?: string } = {}) {
  const user = await createUser({ name: opts.name ?? "Some Person", email: opts.email, superAdmin: role === R.ADMIN }); // an ADMIN here is a superadmin, as after the migration
  const membership = await db.membership.create({ data: { userId: user.id, branchId: branches[opts.branch ?? 0].id, role } });
  return { ...user, membershipId: membership.id };
}
const row = (membershipId: string) => db.membership.findUniqueOrThrow({ where: { id: membershipId } });

test.describe("listMembers", () => {
  test("lists the people with their role, branch and status — and nothing secret", async () => {
    const boss = await person(R.ADMIN, { name: "Ada Admin" });
    const teacher = await person(R.TEACHING_STAFF, { name: "Tola Teacher", branch: 1 });
    const { members, total } = await listMembers({ status: "all" }, { skip: 0, take: 50 }, EVERY_BRANCH);
    expect(total).toBe(2);
    expect(members.map((m) => m.userId).sort()).toEqual([boss.id, teacher.id].sort());
    expect(members.find((m) => m.userId === teacher.id)).toMatchObject({
      id: teacher.membershipId,
      name: "Tola Teacher",
      role: "TEACHING_STAFF",
      branchId: branches[1].id,
      branchName: BRANCH_NAMES[1],
      status: "active",
    });
    expect(JSON.stringify(members)).not.toMatch(/passwordHash|\$2[aby]\$/); // the person's name and address go through, nothing else of the User row
    expect(Object.keys(members[0]).sort()).toEqual([
      "branchId",
      "branchName",
      "canApproveResults",
      "email",
      "id",
      "isSuperAdmin",
      "joinedAt",
      "name",
      "role",
      "status",
      "userId",
    ]);
  });

  test("filters: role, branch, status (default: active), and a search that matches name or address, case-insensitively, as TEXT", async () => {
    const t1 = await person(R.TEACHING_STAFF, { name: "Tola Teacher", branch: 0 });
    const t2 = await person(R.TEACHING_STAFF, { name: "Uche Teacher", branch: 1 });
    const parent = await person(R.PARENT, { name: "Pat Parent" });
    await db.membership.update({ where: { id: t2.membershipId }, data: { deactivatedAt: new Date() } });
    const ids = async (f: Parameters<typeof listMembers>[0]) =>
      (await listMembers(f, { skip: 0, take: 50 }, EVERY_BRANCH)).members.map((m) => m.userId).sort();
    expect(await ids({ status: "active" })).toEqual([t1.id, parent.id].sort());
    expect(await ids({ status: "deactivated" })).toEqual([t2.id]);
    expect(await ids({ status: "all" })).toEqual([t1.id, t2.id, parent.id].sort());
    expect(await ids({ status: "all", role: R.TEACHING_STAFF })).toEqual([t1.id, t2.id].sort());
    expect(await ids({ status: "all", branchId: branches[1].id })).toEqual([t2.id]);
    expect(await ids({ status: "all", q: "TOLA" })).toEqual([t1.id]);
    expect(await ids({ status: "all", q: parent.email.toUpperCase() })).toEqual([parent.id]);
    // wildcards are text, not patterns
    expect(await ids({ status: "all", q: "%" })).toEqual([]);
    expect(await ids({ status: "all", q: "_" })).toEqual([]);
    expect(await ids({ status: "all", q: "Tola%" })).toEqual([]);
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  test("pages are exact: stable order, no overlap, no gaps", async () => {
    for (let i = 0; i < 7; i++) await person(R.PARENT, { name: `Parent ${i}` });
    const seen: string[] = [];
    for (let skip = 0; skip < 8; skip += 3) {
      const page = await listMembers({ status: "all" }, { skip, take: 3 }, EVERY_BRANCH);
      expect(page.total).toBe(7);
      seen.push(...page.members.map((m) => m.userId));
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    const names = (await listMembers({ status: "all" }, { skip: 0, take: 50 }, EVERY_BRANCH)).members.map((m) => m.name);
    expect(names).toEqual([...names].sort());
  });

  test("people with the SAME name are ordered by address then id, so a page never repeats or loses anyone", async () => {
    await person(R.ADMIN, { name: "Aaa Admin" });
    // inserted in REVERSE address order: only an explicit tiebreak puts them back in order
    const emails = ["zed", "yan", "xia", "wes", "van"].map((n) => `${n}@twin.test`);
    for (const address of emails) await person(R.PARENT, { name: "Twin Person", email: address });
    const seen: string[] = [];
    for (let skip = 0; skip < 6; skip += 2) {
      const { members } = await listMembers({ status: "all" }, { skip, take: 2 }, EVERY_BRANCH);
      seen.push(...members.map((m) => m.email ?? ""));
    }
    expect(seen.slice(1)).toEqual([...emails].sort()); // all five, once each, by address
    expect(new Set(seen).size).toBe(seen.length);
  });
});

test.describe("changeMember — the authority rules", () => {
  test("changes role and branch, audits each with before/after", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 0 });
    const result = await changeMember(boss.id, target.membershipId, { role: R.NON_TEACHING_STAFF, branchId: branches[1].id }, EVERY_BRANCH);
    expect(result).toMatchObject({ ok: true, changed: true, member: { role: "NON_TEACHING_STAFF", branchName: BRANCH_NAMES[1] } });
    const audit = await db.auditLog.findMany({
      where: { targetId: target.membershipId, action: { startsWith: "MEMBER_" } },
      orderBy: { action: "asc" },
    });
    expect(audit.map((r) => r.action)).toEqual(["MEMBER_BRANCH_CHANGED", "MEMBER_ROLE_CHANGED"]);
    expect(audit.find((r) => r.action === "MEMBER_ROLE_CHANGED")).toMatchObject({
      actorUserId: boss.id,
      beforeValue: { role: "TEACHING_STAFF" },
      afterValue: { role: "NON_TEACHING_STAFF" },
    });
    expect(audit.find((r) => r.action === "MEMBER_BRANCH_CHANGED")).toMatchObject({
      beforeValue: { branchId: branches[0].id },
      afterValue: { branchId: branches[1].id },
    });
  });

  test("a no-op writes NOTHING (no update, no audit row)", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 0 });
    const before = await row(target.membershipId);
    expect(
      await changeMember(boss.id, target.membershipId, { role: R.TEACHING_STAFF, branchId: branches[0].id }, EVERY_BRANCH),
    ).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(await row(target.membershipId)).toEqual(before);
    expect(await db.auditLog.count({ where: { targetId: target.membershipId } })).toBe(0);
  });

  test("an unknown id is simply not found (one answer), and nothing changes", async () => {
    const boss = await person(R.ADMIN);
    expect(await changeMember(boss.id, "no-such-membership", { role: R.ADMIN }, EVERY_BRANCH)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await deactivateMember(boss.id, "no-such-membership", EVERY_BRANCH)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await reactivateMember(boss.id, "no-such-membership", EVERY_BRANCH)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await db.auditLog.count({ where: { action: { startsWith: "MEMBER_" } } })).toBe(0);
  });

  test("nobody changes, deactivates or reactivates THEMSELVES — even an administrator with a colleague to spare", async () => {
    const boss = await person(R.ADMIN);
    await person(R.ADMIN);
    expect(await changeMember(boss.id, boss.membershipId, { role: R.PARENT }, EVERY_BRANCH)).toEqual({ ok: false, reason: "SELF" });
    expect(await deactivateMember(boss.id, boss.membershipId, EVERY_BRANCH)).toEqual({ ok: false, reason: "SELF" });
    expect(await reactivateMember(boss.id, boss.membershipId, EVERY_BRANCH)).toEqual({ ok: false, reason: "SELF" });
    expect((await row(boss.membershipId)).role).toBe("ADMIN");
  });

  test("a branch that does not exist is a refusal of its own, and so is one where the person already has a membership (BRANCH_TAKEN); nothing changes", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 0 });
    expect(await changeMember(boss.id, target.membershipId, { branchId: "no-such-branch" }, EVERY_BRANCH)).toEqual({
      ok: false,
      reason: "INVALID_BRANCH",
    });
    // a second membership for the same person on branch 1 (the schema allows it; this page never makes one): moving onto it would collide
    await db.membership.create({ data: { userId: target.id, branchId: branches[1].id, role: R.TEACHING_STAFF } });
    expect(await changeMember(boss.id, target.membershipId, { branchId: branches[1].id }, EVERY_BRANCH)).toEqual({
      ok: false,
      reason: "BRANCH_TAKEN",
    });
    expect((await row(target.membershipId)).branchId).toBe(branches[0].id);
  });

  test("a deactivated member cannot be changed until reactivated", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF);
    await db.membership.update({ where: { id: target.membershipId }, data: { deactivatedAt: new Date() } });
    expect(await changeMember(boss.id, target.membershipId, { role: R.ADMIN }, EVERY_BRANCH)).toEqual({ ok: false, reason: "DEACTIVATED" });
  });

  test("the LAST superadmin cannot lose their last active membership; with a colleague they can; a deactivated superadmin does not count", async () => {
    const boss = await person(R.ADMIN, { name: "Ada" });
    const sole = await person(R.ADMIN, { name: "Bea" });
    const actor = await person(R.PARENT); // anyone calling: the guard is about the SCHOOL, not the caller (the caller's own scope is tested below)
    expect(await deactivateMember(actor.id, sole.membershipId, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true }); // two superadmins → one may go
    expect(await deactivateMember(actor.id, boss.membershipId, EVERY_BRANCH)).toEqual({ ok: false, reason: "LAST_SUPERADMIN" });
    expect((await row(boss.membershipId)).deactivatedAt).toBeNull();
    // a role change or a branch change removes no authority (the flag stays), so the last superadmin may be moved and may be made a parent
    expect(await changeMember(actor.id, boss.membershipId, { branchId: branches[1].id }, EVERY_BRANCH)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(await changeMember(actor.id, boss.membershipId, { role: R.PARENT }, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: boss.id } })).isSuperAdmin).toBe(true);
    expect(await deactivateMember(actor.id, boss.membershipId, EVERY_BRANCH)).toEqual({ ok: false, reason: "LAST_SUPERADMIN" });
  });

  test("superadmins are counted by PERSON, and what counts is an ACTIVE membership: a person with two memberships may lose one, never the last", async () => {
    const lone = await person(R.ADMIN, { branch: 0 });
    const second = await db.membership.create({ data: { userId: lone.id, branchId: branches[1].id, role: R.TEACHING_STAFF } });
    const actor = await person(R.PARENT);
    expect(await deactivateMember(actor.id, lone.membershipId, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true }); // still active elsewhere
    expect(await deactivateMember(actor.id, second.id, EVERY_BRANCH)).toEqual({ ok: false, reason: "LAST_SUPERADMIN" }); // now the last one
  });

  test("two superadmins DEACTIVATING each other at the same instant: exactly one succeeds — the school is never left with none", async () => {
    const first = await person(R.ADMIN, { name: "Ada" });
    const second = await person(R.ADMIN, { name: "Bea" });
    for (let round = 0; round < 5; round++) {
      await db.membership.updateMany({ where: { id: { in: [first.membershipId, second.membershipId] } }, data: { deactivatedAt: null } });
      const results = await Promise.all([
        deactivateMember(second.id, first.membershipId, EVERY_BRANCH),
        deactivateMember(first.id, second.membershipId, EVERY_BRANCH),
      ]);
      expect(
        results.filter((r) => r.ok && r.changed),
        `round ${round}`,
      ).toHaveLength(1);
      expect(
        results.filter((r) => !r.ok && r.reason === "LAST_SUPERADMIN"),
        `round ${round}`,
      ).toHaveLength(1);
      expect(await db.user.count({ where: { isSuperAdmin: true, memberships: { some: { deactivatedAt: null } } } }), `round ${round}`).toBe(
        1,
      );
    }
  });

  test("two superadmins REVOKING each other's authority at the same instant: exactly one succeeds", async () => {
    const first = await person(R.ADMIN, { name: "Ada" });
    const second = await person(R.ADMIN, { name: "Bea" });
    for (let round = 0; round < 5; round++) {
      await db.user.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { isSuperAdmin: true } });
      const results = await Promise.all([
        setSuperAdmin(second.id, first.membershipId, false),
        setSuperAdmin(first.id, second.membershipId, false),
      ]);
      expect(
        results.filter((r) => r.ok && r.changed),
        `round ${round}`,
      ).toHaveLength(1);
      expect(
        results.filter((r) => !r.ok && r.reason === "LAST_SUPERADMIN"),
        `round ${round}`,
      ).toHaveLength(1);
      expect(await db.user.count({ where: { isSuperAdmin: true } }), `round ${round}`).toBe(1);
    }
  });
});

test.describe("setSuperAdmin", () => {
  test("grants and revokes, audited with before/after; setting what already holds is a quiet no-op; nobody changes their own; a grant needs an active membership", async () => {
    const boss = await person(R.ADMIN);
    const teacher = await person(R.TEACHING_STAFF);
    expect(await setSuperAdmin(boss.id, teacher.membershipId, true)).toMatchObject({
      ok: true,
      changed: true,
      member: { isSuperAdmin: true },
    });
    expect(await setSuperAdmin(boss.id, teacher.membershipId, true)).toMatchObject({ ok: true, changed: false });
    expect(await db.auditLog.findFirstOrThrow({ where: { targetId: teacher.id, action: "SUPERADMIN_GRANTED" } })).toMatchObject({
      actorUserId: boss.id,
      beforeValue: { isSuperAdmin: false },
      afterValue: { isSuperAdmin: true },
    });
    expect(await setSuperAdmin(boss.id, teacher.membershipId, false)).toMatchObject({
      ok: true,
      changed: true,
      member: { isSuperAdmin: false },
    });
    expect(await db.auditLog.count({ where: { targetId: teacher.id, action: "SUPERADMIN_REVOKED" } })).toBe(1);
    expect(await setSuperAdmin(boss.id, boss.membershipId, false)).toEqual({ ok: false, reason: "SELF" });
    await db.membership.update({ where: { id: teacher.membershipId }, data: { deactivatedAt: new Date() } });
    expect(await setSuperAdmin(boss.id, teacher.membershipId, true)).toEqual({ ok: false, reason: "DEACTIVATED" });
    expect(await setSuperAdmin(boss.id, "no-such-membership", true)).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

test.describe("a branch administrator's scope", () => {
  /// A branch administrator of branch 0 as the routes compute their scope.
  const branchAdmin = async () => {
    const user = await createUser({ role: R.ADMIN, superAdmin: false });
    return { user, scope: await adminScope(user.id) };
  };

  test("lists only the people of their own branch", async () => {
    const { scope } = await branchAdmin();
    const here = await person(R.TEACHING_STAFF, { branch: 0 });
    const there = await person(R.TEACHING_STAFF, { branch: 1 });
    const ids = (await listMembers({ status: "all" }, { skip: 0, take: 50 }, scope)).members.map((m) => m.userId);
    expect(ids).toContain(here.id);
    expect(ids).not.toContain(there.id);
    // asking for another branch by filter cannot widen it
    expect((await listMembers({ status: "all", branchId: branches[1].id }, { skip: 0, take: 50 }, scope)).total).toBe(0);
  });

  test("changes, deactivates and reactivates people of their own branch; another branch's member is 'no such member'", async () => {
    const { user, scope } = await branchAdmin();
    const here = await person(R.TEACHING_STAFF, { branch: 0 });
    const there = await person(R.TEACHING_STAFF, { branch: 1 });
    expect(await changeMember(user.id, here.membershipId, { role: R.NON_TEACHING_STAFF }, scope)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(await deactivateMember(user.id, here.membershipId, scope)).toMatchObject({ ok: true, changed: true });
    expect(await reactivateMember(user.id, here.membershipId, scope)).toMatchObject({ ok: true, changed: true });
    for (const act of [
      () => changeMember(user.id, there.membershipId, { role: R.PARENT }, scope),
      () => deactivateMember(user.id, there.membershipId, scope),
      () => reactivateMember(user.id, there.membershipId, scope),
    ]) {
      expect(await act()).toEqual({ ok: false, reason: "NOT_FOUND" });
    }
    expect((await row(there.membershipId)).role).toBe("TEACHING_STAFF");
  });

  test("cannot make, change, deactivate or reactivate an administrator or a superadmin, even in their own branch", async () => {
    const { user, scope } = await branchAdmin();
    const colleague = await person(R.ADMIN, { branch: 0 }); // a superadmin, and ADMIN here
    const otherBranchAdmin = await createUser({ role: R.ADMIN, superAdmin: false }); // ADMIN in branch 0, not a superadmin
    const adminRow = await db.membership.findFirstOrThrow({ where: { userId: otherBranchAdmin.id } });
    const teacherSuper = await person(R.TEACHING_STAFF, { branch: 0 });
    await db.user.update({ where: { id: teacherSuper.id }, data: { isSuperAdmin: true } });
    const plain = await person(R.TEACHING_STAFF, { branch: 0 });
    for (const target of [colleague.membershipId, adminRow.id, teacherSuper.membershipId]) {
      expect(await changeMember(user.id, target, { role: R.PARENT }, scope)).toEqual({ ok: false, reason: "ADMIN_ONLY" });
      expect(await deactivateMember(user.id, target, scope)).toEqual({ ok: false, reason: "ADMIN_ONLY" });
      expect(await reactivateMember(user.id, target, scope)).toEqual({ ok: false, reason: "ADMIN_ONLY" });
    }
    expect(await changeMember(user.id, plain.membershipId, { role: R.ADMIN }, scope)).toEqual({ ok: false, reason: "ADMIN_ONLY" });
    expect((await row(plain.membershipId)).role).toBe("TEACHING_STAFF");
  });

  test("cannot move a person into a branch they do not administer", async () => {
    const { user, scope } = await branchAdmin();
    const here = await person(R.TEACHING_STAFF, { branch: 0 });
    expect(await changeMember(user.id, here.membershipId, { branchId: branches[1].id }, scope)).toEqual({
      ok: false,
      reason: "OUT_OF_SCOPE",
    });
    expect((await row(here.membershipId)).branchId).toBe(branches[0].id);
  });

  test("a superadmin may do all of it, including making an administrator", async () => {
    const boss = await person(R.ADMIN);
    const here = await person(R.TEACHING_STAFF, { branch: 1 });
    expect(await changeMember(boss.id, here.membershipId, { role: R.ADMIN }, await adminScope(boss.id))).toMatchObject({
      ok: true,
      changed: true,
    });
  });
});

test.describe("a person in several branches", () => {
  test("is listed once per membership, and each membership is changed and deactivated on its own", async () => {
    const boss = await person(R.ADMIN, { name: "Ada Admin" });
    const both = await person(R.TEACHING_STAFF, { name: "Both Branches", branch: 0 });
    const second = await db.membership.create({ data: { userId: both.id, branchId: branches[2].id, role: R.PARENT } });
    const { members } = await listMembers({ status: "active", q: "Both Branches" }, { skip: 0, take: 10 }, EVERY_BRANCH);
    expect(members.map((m) => [m.id, m.userId, m.role, m.branchId]).sort()).toEqual(
      [
        [both.membershipId, both.id, "TEACHING_STAFF", branches[0].id],
        [second.id, both.id, "PARENT", branches[2].id],
      ].sort(),
    );
    expect(await changeMember(boss.id, second.id, { role: R.NON_TEACHING_STAFF }, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true });
    expect((await row(both.membershipId)).role).toBe("TEACHING_STAFF"); // the other membership was not touched
    expect(await deactivateMember(boss.id, second.id, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true, signedOut: false });
    expect((await row(both.membershipId)).deactivatedAt).toBeNull();
  });
});

test.describe("deactivate and reactivate", () => {
  test("deactivation keeps the row, is audited with who the person WAS, and is undone by reactivation (same row, same role and branch)", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 1 });
    expect(await deactivateMember(boss.id, target.membershipId, EVERY_BRANCH)).toMatchObject({
      ok: true,
      changed: true,
      member: { status: "deactivated" },
    });
    expect((await row(target.membershipId)).deactivatedAt).not.toBeNull();
    expect(await reactivateMember(boss.id, target.membershipId, EVERY_BRANCH)).toMatchObject({
      ok: true,
      changed: true,
      member: { status: "active", role: "TEACHING_STAFF", branchName: BRANCH_NAMES[1] },
    });
    expect(await row(target.membershipId)).toMatchObject({ deactivatedAt: null, role: "TEACHING_STAFF", branchId: branches[1].id });
    const actions = (await db.auditLog.findMany({ where: { targetId: target.membershipId }, orderBy: { createdAt: "asc" } })).map(
      (r) => r.action,
    );
    expect(actions).toEqual(["MEMBER_DEACTIVATED", "MEMBER_REACTIVATED"]);
    expect(await db.auditLog.findFirstOrThrow({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toMatchObject({
      actorUserId: boss.id,
      beforeValue: { role: "TEACHING_STAFF", branchId: branches[1].id },
    });
  });

  test("both are idempotent: doing it twice is a quiet success that writes no second audit row", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.PARENT);
    expect(await reactivateMember(boss.id, target.membershipId, EVERY_BRANCH)).toMatchObject({ ok: true, changed: false }); // already active
    await deactivateMember(boss.id, target.membershipId, EVERY_BRANCH);
    expect(await deactivateMember(boss.id, target.membershipId, EVERY_BRANCH)).toMatchObject({ ok: true, changed: false });
    expect(await db.auditLog.count({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toBe(1);
  });

  test("deactivating a person's LAST active membership signs them out: every session is deleted, and the audit row counts them", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF);
    await createSession(target.id);
    await createSession(target.id);
    const bystander = await person(R.PARENT);
    await createSession(bystander.id);
    expect(await deactivateMember(boss.id, target.membershipId, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true, signedOut: true });
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: bystander.id } })).toBe(1); // nobody else is signed out
    expect(await db.auditLog.findFirstOrThrow({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toMatchObject({
      afterValue: { sessionsRevoked: 2 },
    });
  });

  test("with ANOTHER active membership the person stays signed in (only the last one ends sessions)", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 0 });
    await db.membership.create({ data: { userId: target.id, branchId: branches[1].id, role: R.TEACHING_STAFF } });
    await createSession(target.id);
    expect(await deactivateMember(boss.id, target.membershipId, EVERY_BRANCH)).toMatchObject({ ok: true, changed: true, signedOut: false });
    expect(await db.session.count({ where: { userId: target.id } })).toBe(1);
    expect(await db.auditLog.findFirstOrThrow({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toMatchObject({
      afterValue: { sessionsRevoked: 0 },
    });
  });

  test("a refused deactivation (the last administrator) deletes NO session", async () => {
    const sole = await person(R.ADMIN);
    const actor = await person(R.PARENT);
    await createSession(sole.id);
    expect(await deactivateMember(actor.id, sole.membershipId, EVERY_BRANCH)).toEqual({ ok: false, reason: "LAST_SUPERADMIN" });
    expect(await db.session.count({ where: { userId: sole.id } })).toBe(1);
  });

  test("reactivation does not restore sessions: the person signs in again", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF);
    await createSession(target.id);
    await deactivateMember(boss.id, target.membershipId, EVERY_BRANCH);
    await reactivateMember(boss.id, target.membershipId, EVERY_BRANCH);
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
  });
});
