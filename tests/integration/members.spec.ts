import { test, expect } from "@playwright/test";
import { Role as R, BRANCH_NAMES, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { createSession } from "@/lib/auth/session";
import { changeMember, deactivateMember, escapeLike, listMembers, reactivateMember } from "@/lib/members/service";

// The school's people, in-process (domain-implementation-plan.md, "Build design — Users pages and invitations"): who may change whom,
// the last-administrator guard (including under concurrency), self-changes, and what deactivation does to a person's sessions.
// Every test starts from an empty database (the guards count ALL administrators, so leftovers from another spec would change the answer).

let branches: { id: string; name: string }[];

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
});

/// A person with one membership; returns the person and the membership's id (what every action addresses).
async function person(role: R, opts: { name?: string; branch?: number; email?: string } = {}) {
  const user = await createUser({ name: opts.name ?? "Some Person", email: opts.email });
  const membership = await db.membership.create({ data: { userId: user.id, branchId: branches[opts.branch ?? 0].id, role } });
  return { ...user, membershipId: membership.id };
}
const row = (membershipId: string) => db.membership.findUniqueOrThrow({ where: { id: membershipId } });

test.describe("listMembers", () => {
  test("lists the people with their role, branch and status — and nothing secret", async () => {
    const boss = await person(R.ADMIN, { name: "Ada Admin" });
    const teacher = await person(R.TEACHING_STAFF, { name: "Tola Teacher", branch: 1 });
    const { members, total } = await listMembers({ status: "all" }, { skip: 0, take: 50 });
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
      "email",
      "id",
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
      (await listMembers(f, { skip: 0, take: 50 })).members.map((m) => m.userId).sort();
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
      const page = await listMembers({ status: "all" }, { skip, take: 3 });
      expect(page.total).toBe(7);
      seen.push(...page.members.map((m) => m.userId));
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    const names = (await listMembers({ status: "all" }, { skip: 0, take: 50 })).members.map((m) => m.name);
    expect(names).toEqual([...names].sort());
  });

  test("people with the SAME name are ordered by address then id, so a page never repeats or loses anyone", async () => {
    await person(R.ADMIN, { name: "Aaa Admin" });
    // inserted in REVERSE address order: only an explicit tiebreak puts them back in order
    const emails = ["zed", "yan", "xia", "wes", "van"].map((n) => `${n}@twin.test`);
    for (const address of emails) await person(R.PARENT, { name: "Twin Person", email: address });
    const seen: string[] = [];
    for (let skip = 0; skip < 6; skip += 2) {
      const { members } = await listMembers({ status: "all" }, { skip, take: 2 });
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
    const result = await changeMember(boss.id, target.membershipId, { role: R.NON_TEACHING_STAFF, branchId: branches[1].id });
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
    expect(await changeMember(boss.id, target.membershipId, { role: R.TEACHING_STAFF, branchId: branches[0].id })).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(await row(target.membershipId)).toEqual(before);
    expect(await db.auditLog.count({ where: { targetId: target.membershipId } })).toBe(0);
  });

  test("an unknown id is simply not found (one answer), and nothing changes", async () => {
    const boss = await person(R.ADMIN);
    expect(await changeMember(boss.id, "no-such-membership", { role: R.ADMIN })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await deactivateMember(boss.id, "no-such-membership")).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await reactivateMember(boss.id, "no-such-membership")).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await db.auditLog.count({ where: { action: { startsWith: "MEMBER_" } } })).toBe(0);
  });

  test("nobody changes, deactivates or reactivates THEMSELVES — even an administrator with a colleague to spare", async () => {
    const boss = await person(R.ADMIN);
    await person(R.ADMIN);
    expect(await changeMember(boss.id, boss.membershipId, { role: R.PARENT })).toEqual({ ok: false, reason: "SELF" });
    expect(await deactivateMember(boss.id, boss.membershipId)).toEqual({ ok: false, reason: "SELF" });
    expect(await reactivateMember(boss.id, boss.membershipId)).toEqual({ ok: false, reason: "SELF" });
    expect((await row(boss.membershipId)).role).toBe("ADMIN");
  });

  test("a branch that does not exist — or one where the person already has a membership — is refused, and nothing changes", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 0 });
    expect(await changeMember(boss.id, target.membershipId, { branchId: "no-such-branch" })).toEqual({
      ok: false,
      reason: "INVALID_BRANCH",
    });
    // a second membership for the same person on branch 1 (the schema allows it; this page never makes one): moving onto it would collide
    await db.membership.create({ data: { userId: target.id, branchId: branches[1].id, role: R.TEACHING_STAFF } });
    expect(await changeMember(boss.id, target.membershipId, { branchId: branches[1].id })).toEqual({ ok: false, reason: "INVALID_BRANCH" });
    expect((await row(target.membershipId)).branchId).toBe(branches[0].id);
  });

  test("a deactivated member cannot be changed until reactivated", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF);
    await db.membership.update({ where: { id: target.membershipId }, data: { deactivatedAt: new Date() } });
    expect(await changeMember(boss.id, target.membershipId, { role: R.ADMIN })).toEqual({ ok: false, reason: "DEACTIVATED" });
  });

  test("the LAST active administrator cannot be demoted or deactivated; with a colleague they can; a deactivated admin does not count", async () => {
    const boss = await person(R.ADMIN, { name: "Ada" });
    const sole = await person(R.ADMIN, { name: "Bea" });
    const actor = await person(R.PARENT); // anyone calling: the guard is about the SCHOOL, not the caller
    expect(await changeMember(actor.id, sole.membershipId, { role: R.PARENT })).toMatchObject({ ok: true }); // two admins → one may go
    expect(await changeMember(actor.id, boss.membershipId, { role: R.PARENT })).toEqual({ ok: false, reason: "LAST_ADMIN" });
    expect(await deactivateMember(actor.id, boss.membershipId)).toEqual({ ok: false, reason: "LAST_ADMIN" });
    expect((await row(boss.membershipId)).role).toBe("ADMIN");
    // a deactivated administrator is not an active one: with Bea deactivated (not just demoted) Ada is still the last
    await changeMember(actor.id, sole.membershipId, { role: R.ADMIN });
    await deactivateMember(actor.id, sole.membershipId); // two admins → allowed
    expect(await deactivateMember(actor.id, boss.membershipId)).toEqual({ ok: false, reason: "LAST_ADMIN" });
    // …and a branch-only change to the last admin is fine (it removes nothing)
    expect(await changeMember(actor.id, boss.membershipId, { branchId: branches[1].id })).toMatchObject({ ok: true, changed: true });
  });

  test("administrators are counted by PERSON: one person with two ADMIN memberships is still ONE administrator", async () => {
    const lone = await person(R.ADMIN, { branch: 0 });
    await db.membership.create({ data: { userId: lone.id, branchId: branches[1].id, role: R.ADMIN } });
    const actor = await person(R.PARENT);
    // two ADMIN rows, one administrator: neither row may be demoted or deactivated
    expect(await changeMember(actor.id, lone.membershipId, { role: R.PARENT })).toEqual({ ok: false, reason: "LAST_ADMIN" });
    expect(await deactivateMember(actor.id, lone.membershipId)).toEqual({ ok: false, reason: "LAST_ADMIN" });
  });

  test("two administrators demoting EACH OTHER at the same instant: exactly one succeeds — the school is never left with none", async () => {
    const first = await person(R.ADMIN, { name: "Ada" });
    const second = await person(R.ADMIN, { name: "Bea" });
    for (let round = 0; round < 5; round++) {
      await db.membership.updateMany({
        where: { id: { in: [first.membershipId, second.membershipId] } },
        data: { role: R.ADMIN, deactivatedAt: null },
      });
      const results = await Promise.all([
        changeMember(second.id, first.membershipId, { role: R.PARENT }),
        changeMember(first.id, second.membershipId, { role: R.PARENT }),
      ]);
      expect(
        results.filter((r) => r.ok),
        `round ${round}`,
      ).toHaveLength(1);
      expect(
        results.filter((r) => !r.ok && r.reason === "LAST_ADMIN"),
        `round ${round}`,
      ).toHaveLength(1);
      expect(await db.membership.count({ where: { role: "ADMIN", deactivatedAt: null } }), `round ${round}`).toBe(1);
    }
  });

  test("two administrators DEACTIVATING each other at the same instant: exactly one succeeds", async () => {
    const first = await person(R.ADMIN, { name: "Ada" });
    const second = await person(R.ADMIN, { name: "Bea" });
    for (let round = 0; round < 5; round++) {
      await db.membership.updateMany({ where: { id: { in: [first.membershipId, second.membershipId] } }, data: { deactivatedAt: null } });
      const results = await Promise.all([deactivateMember(second.id, first.membershipId), deactivateMember(first.id, second.membershipId)]);
      expect(
        results.filter((r) => r.ok && r.changed),
        `round ${round}`,
      ).toHaveLength(1);
      expect(
        results.filter((r) => !r.ok && r.reason === "LAST_ADMIN"),
        `round ${round}`,
      ).toHaveLength(1);
      expect(await db.membership.count({ where: { role: "ADMIN", deactivatedAt: null } }), `round ${round}`).toBe(1);
    }
  });
});

test.describe("deactivate and reactivate", () => {
  test("deactivation keeps the row, is audited with who the person WAS, and is undone by reactivation (same row, same role and branch)", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF, { branch: 1 });
    expect(await deactivateMember(boss.id, target.membershipId)).toMatchObject({
      ok: true,
      changed: true,
      member: { status: "deactivated" },
    });
    expect((await row(target.membershipId)).deactivatedAt).not.toBeNull();
    expect(await reactivateMember(boss.id, target.membershipId)).toMatchObject({
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
    expect(await reactivateMember(boss.id, target.membershipId)).toMatchObject({ ok: true, changed: false }); // already active
    await deactivateMember(boss.id, target.membershipId);
    expect(await deactivateMember(boss.id, target.membershipId)).toMatchObject({ ok: true, changed: false });
    expect(await db.auditLog.count({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toBe(1);
  });

  test("deactivating a person's LAST active membership signs them out: every session is deleted, and the audit row counts them", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF);
    await createSession(target.id);
    await createSession(target.id);
    const bystander = await person(R.PARENT);
    await createSession(bystander.id);
    expect(await deactivateMember(boss.id, target.membershipId)).toMatchObject({ ok: true, changed: true });
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
    expect(await deactivateMember(boss.id, target.membershipId)).toMatchObject({ ok: true, changed: true });
    expect(await db.session.count({ where: { userId: target.id } })).toBe(1);
    expect(await db.auditLog.findFirstOrThrow({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toMatchObject({
      afterValue: { sessionsRevoked: 0 },
    });
  });

  test("a refused deactivation (the last administrator) deletes NO session", async () => {
    const sole = await person(R.ADMIN);
    const actor = await person(R.PARENT);
    await createSession(sole.id);
    expect(await deactivateMember(actor.id, sole.membershipId)).toEqual({ ok: false, reason: "LAST_ADMIN" });
    expect(await db.session.count({ where: { userId: sole.id } })).toBe(1);
  });

  test("reactivation does not restore sessions: the person signs in again", async () => {
    const boss = await person(R.ADMIN);
    const target = await person(R.TEACHING_STAFF);
    await createSession(target.id);
    await deactivateMember(boss.id, target.membershipId);
    await reactivateMember(boss.id, target.membershipId);
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
  });
});
