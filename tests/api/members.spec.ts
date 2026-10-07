import "../support/env";
import { test, expect } from "@playwright/test";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The members API over real HTTP (domain-implementation-plan.md, "Build design — Users pages and invitations"): who may list and change
// whom, the authority rules (self, last administrator, branch), strict bodies, and that a change takes effect on the person's NEXT request.

const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 8)}@invite.test`;
const NO_PERMISSION = { data: null, meta: {}, error: { code: "FORBIDDEN", message: "You don't have permission to do that" } };

let admin: TestUser; // ADMIN
let colleague: TestUser; // a second ADMIN (so the last-admin rule is not in the way unless a test wants it)
let teacher: TestUser;
let branches: { id: string; name: string }[];
let cookie: Record<string, string> = {};

const members = "/api/v1/members";
const member = (id: string) => `/api/v1/members/${id}`;
const as = (who: string, extra: object = {}) => ({ cookie: cookie[who], ...extra });
async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const membershipOf = (userId: string) => db.membership.findFirstOrThrow({ where: { userId } });

test.beforeAll(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  admin = await createUser({ name: "Ada Admin", role: Role.ADMIN });
  colleague = await createUser({ name: "Cole Colleague", role: Role.ADMIN });
  teacher = await createUser({ name: "Tola Teacher", role: Role.TEACHING_STAFF });
  cookie = { admin: await cookieFor(admin), teacher: await cookieFor(teacher) };
});

/// A fresh person with one membership; returns the person and the membership's id (what every action addresses).
async function newMember(role: Role = Role.TEACHING_STAFF, name = "New Member", branch = 0) {
  const user = await createUser({ name });
  const m = await db.membership.create({ data: { userId: user.id, branchId: branches[branch].id, role } });
  return { ...user, membershipId: m.id };
}

test.describe("GET /members", () => {
  test("an ADMIN lists the people — only name/address/role/branch/status, with exact pagination meta", async () => {
    const res = await api(members, as("admin"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const people = res.json.data.members as { userId: string }[];
    expect(people.map((p) => p.userId)).toEqual(expect.arrayContaining([admin.id, colleague.id, teacher.id]));
    expect(res.json.meta).toMatchObject({ page: 1, limit: 25, total: people.length, hasNext: false });
    expect(Object.keys(people[0]).sort()).toEqual([
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
    expect(res.text).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$/);
  });

  test("anyone who is not an administrator is a 403 (same body for every role, none of the data); signed out is a 401", async () => {
    for (const role of [undefined, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT]) {
      const who = await createUser({ role });
      const res = await api(members, { cookie: await cookieFor(who) });
      expect(res.status, `role ${role ?? "none"}`).toBe(403);
      expect(res.json).toEqual(NO_PERMISSION);
      expect(res.text).not.toContain(admin.email);
    }
    expect((await api(members)).status).toBe(401);
  });

  test("filters: status defaults to active; role, branch, status=deactivated|all and a search by name or address", async () => {
    const gone = await newMember(Role.PARENT, "Gone Parent", 2);
    await db.membership.update({ where: { id: gone.membershipId }, data: { deactivatedAt: new Date() } });
    const ids = async (qs: string) =>
      ((await api(`${members}?${qs}`, as("admin"))).json.data.members as { userId: string }[]).map((m) => m.userId);
    expect(await ids("")).not.toContain(gone.id);
    expect(await ids("status=deactivated")).toEqual([gone.id]);
    expect(await ids("status=all")).toContain(gone.id);
    expect(await ids("status=all&role=PARENT")).toContain(gone.id);
    expect(await ids(`status=all&branchId=${branches[2].id}`)).toEqual([gone.id]);
    expect(await ids("q=tola")).toEqual([teacher.id]);
    expect(await ids(`q=${encodeURIComponent(teacher.email.toUpperCase())}`)).toEqual([teacher.id]);
    expect(await ids("q=%25")).toEqual([]); // a percent sign is text, not a wildcard
  });

  test("pagination is exact and strict: pages don't overlap, and malformed or out-of-range parameters are a 400 naming the field", async () => {
    for (let i = 0; i < 4; i++) await newMember(Role.PARENT, `Paged ${i}`);
    const first = await api(`${members}?limit=3&status=all`, as("admin"));
    const second = await api(`${members}?limit=3&page=2&status=all`, as("admin"));
    const overlap = first.json.data.members.filter((m: { userId: string }) =>
      second.json.data.members.some((n: { userId: string }) => n.userId === m.userId),
    );
    expect(overlap).toEqual([]);
    expect(first.json.meta).toMatchObject({ page: 1, limit: 3, hasNext: true });
    for (const [qs, field] of [
      ["role=SUPERUSER", "query.role"],
      ["status=everyone", "query.status"],
      ["page=0", "query.page"],
      ["limit=1000", "query.limit"],
      ["limit=abc", "query.limit"],
      ["page=1&page=2", "query.page"],
      ["q=" + "x".repeat(65), "query.q"],
    ]) {
      const res = await api(`${members}?${qs}`, as("admin"));
      expect(res.status, qs).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
      expect(
        res.json.error.details.map((d: { path: string }) => d.path),
        qs,
      ).toContain(field);
    }
  });
});

test.describe("PATCH /members/[id]", () => {
  test("changes the role; the person's NEXT request sees it — no session to revoke", async () => {
    const target = await newMember(Role.TEACHING_STAFF);
    const targetCookie = await cookieFor(target);
    expect((await api("/api/v1/auth/me", { cookie: targetCookie })).json.data.memberships[0].role).toBe("TEACHING_STAFF");
    expect((await api(members, { cookie: targetCookie })).status).toBe(403); // not an admin yet

    const res = await api(member(target.membershipId), as("admin", { method: "PATCH", body: { role: "ADMIN" } }));
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ changed: true, member: { id: target.membershipId, userId: target.id, role: "ADMIN" } });
    expect((await api("/api/v1/auth/me", { cookie: targetCookie })).json.data.memberships[0].role).toBe("ADMIN");
    expect((await api(members, { cookie: targetCookie })).status).toBe(200); // …and the new authority works at once
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "MEMBER_ROLE_CHANGED", targetId: target.membershipId } })).toMatchObject({
      actorUserId: admin.id,
      beforeValue: { role: "TEACHING_STAFF" },
      afterValue: { role: "ADMIN" },
    });
  });

  test("changes the branch; a no-op is a 200 with changed:false and writes no audit row", async () => {
    const target = await newMember(Role.TEACHING_STAFF, "Mover", 0);
    const moved = await api(member(target.membershipId), as("admin", { method: "PATCH", body: { branchId: branches[1].id } }));
    expect(moved.json.data).toMatchObject({ changed: true, member: { branchId: branches[1].id, branchName: BRANCH_NAMES[1] } });
    const same = await api(
      member(target.membershipId),
      as("admin", { method: "PATCH", body: { branchId: branches[1].id, role: "TEACHING_STAFF" } }),
    );
    expect(same.json.data).toMatchObject({ changed: false });
    expect(await db.auditLog.count({ where: { targetId: target.membershipId, action: { startsWith: "MEMBER_" } } })).toBe(1);
  });

  test("the body is STRICT: a key it does not name is refused (no userId or passwordHash smuggling), and an empty body says what to give", async () => {
    const target = await newMember();
    for (const body of [{ role: "ADMIN", userId: colleague.id }, { passwordHash: "x" }, { email: "evil@x.test" }, {}]) {
      const res = await api(member(target.membershipId), as("admin", { method: "PATCH", body }));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
    }
    expect((await membershipOf(target.id)).role).toBe("TEACHING_STAFF");
    expect((await api(member(target.membershipId), as("admin", { method: "PATCH", body: { role: "OWNER" } }))).status).toBe(400); // not a role
    expect((await api(member(target.membershipId), as("admin", { method: "PATCH", rawBody: "{not json" }))).json.error.code).toBe(
      "INVALID_BODY",
    );
  });

  test("nobody changes THEMSELVES here (409 SELF), even an administrator with a colleague to spare", async () => {
    const res = await api(member((await membershipOf(admin.id)).id), as("admin", { method: "PATCH", body: { role: "PARENT" } }));
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("SELF");
    expect((await membershipOf(admin.id)).role).toBe("ADMIN");
  });

  test("a branch that does not exist is a 400 on body.branchId", async () => {
    const target = await newMember();
    const res = await api(member(target.membershipId), as("admin", { method: "PATCH", body: { branchId: "no-such-branch" } }));
    expect(res.status).toBe(400);
    expect(res.json.error.details).toEqual([{ path: "body.branchId", message: "Choose one of the school's branches." }]);
  });

  test("an unknown id and a malformed id are INDISTINGUISHABLE (404, same body)", async () => {
    const unknown = await api(member("no-such-membership"), as("admin", { method: "PATCH", body: { role: "ADMIN" } }));
    const odd = await api(member("..%2F..%2Fetc"), as("admin", { method: "PATCH", body: { role: "ADMIN" } }));
    const long = await api(member("x".repeat(300)), as("admin", { method: "PATCH", body: { role: "ADMIN" } }));
    for (const res of [unknown, odd, long]) {
      expect(res.status).toBe(404);
      expect(res.json).toEqual(unknown.json);
    }
  });

  test("a deactivated member cannot be changed (409 DEACTIVATED) until reactivated", async () => {
    const target = await newMember(Role.TEACHING_STAFF, "Soon deactivated");
    await api(`${member(target.membershipId)}/deactivate`, as("admin", { method: "POST", body: {} }));
    const res = await api(member(target.membershipId), as("admin", { method: "PATCH", body: { role: "PARENT" } }));
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DEACTIVATED");
  });

  test("only an ADMIN may change anyone: a teacher is a 403 (and cannot promote themselves)", async () => {
    const mine = (await membershipOf(teacher.id)).id;
    const res = await api(member(mine), as("teacher", { method: "PATCH", body: { role: "ADMIN" } }));
    expect(res.status).toBe(403);
    expect(res.json).toEqual(NO_PERMISSION);
    expect((await membershipOf(teacher.id)).role).toBe("TEACHING_STAFF");
  });

  test("CSRF: a cross-origin request is refused before anything happens", async () => {
    const target = await newMember();
    const res = await api(
      member(target.membershipId),
      as("admin", { method: "PATCH", body: { role: "ADMIN" }, origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("CSRF");
    expect((await membershipOf(target.id)).role).toBe("TEACHING_STAFF");
  });
});

test.describe("a deactivated administrator", () => {
  test("is a 403 on EVERY administrator route — the role is read live, so a session that survived grants nothing, and nothing happens", async () => {
    const ghost = await newMember(Role.ADMIN, "Ghost Admin");
    const ghostCookie = await cookieFor(ghost);
    // deactivated behind the API's back, so the session survives
    await db.membership.update({ where: { id: ghost.membershipId }, data: { deactivatedAt: new Date() } });
    const target = await newMember(Role.TEACHING_STAFF, "Untouched");
    const invitation = await db.invitation.create({
      data: {
        email: unique("ghost"),
        role: Role.PARENT,
        branchId: branches[0].id,
        tokenHash: "e".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const calls: [string, string, unknown?][] = [
      ["GET", members],
      ["PATCH", member(target.membershipId), { role: "PARENT" }],
      ["POST", `${member(target.membershipId)}/deactivate`, {}],
      ["POST", `${member(target.membershipId)}/reactivate`, {}],
      ["GET", "/api/v1/invitations"],
      ["POST", "/api/v1/invitations", { email: unique("x"), role: "PARENT", branchId: branches[0].id }],
      ["POST", `/api/v1/invitations/${invitation.id}/resend`, {}],
      ["DELETE", `/api/v1/invitations/${invitation.id}`],
    ];
    for (const [method, path, body] of calls) {
      const res = await api(path, { cookie: ghostCookie, method, ...(body === undefined ? {} : { body }) });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.json, `${method} ${path}`).toEqual(NO_PERMISSION);
    }
    expect(await membershipOf(target.id)).toMatchObject({ role: "TEACHING_STAFF", deactivatedAt: null }); // none of it happened
    expect(await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).toMatchObject({ revokedAt: null });
  });
});

test.describe("POST /members/[id]/deactivate and /reactivate", () => {
  const deactivate = (id: string, who = "admin") => api(`${member(id)}/deactivate`, as(who, { method: "POST", body: {} }));
  const reactivate = (id: string, who = "admin") => api(`${member(id)}/reactivate`, as(who, { method: "POST", body: {} }));

  test("deactivation ends access on the very next request AND signs the person out; reactivation restores the access (they sign in again)", async () => {
    const target = await newMember(Role.TEACHING_STAFF, "Leaver", 1);
    const targetCookie = await cookieFor(target);
    expect((await api("/api/v1/auth/me", { cookie: targetCookie })).status).toBe(200);

    const res = await deactivate(target.membershipId);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ changed: true, signedOut: true, member: { status: "deactivated" } });
    // the session itself is gone (the divergence from Octalve): the cookie is a 401, not a signed-in person with no school
    expect((await api("/api/v1/auth/me", { cookie: targetCookie })).status).toBe(401);
    // …and they cannot simply sign in again to a working account: signing in works (it is their account) but they hold no membership
    const again = await loginAs(target);
    expect(again.status).toBe(200);
    expect((await api("/api/v1/auth/me", { cookie: cookieHeader(again.token!) })).json.data.memberships).toEqual([]);

    const back = await reactivate(target.membershipId);
    expect(back.json.data).toMatchObject({
      changed: true,
      member: { status: "active", role: "TEACHING_STAFF", branchName: BRANCH_NAMES[1] },
    });
    expect((await api("/api/v1/auth/me", { cookie: cookieHeader(again.token!) })).json.data.memberships).toHaveLength(1);
    expect(
      (
        await db.auditLog.findMany({
          where: { targetId: target.membershipId, action: { startsWith: "MEMBER_" } },
          orderBy: { createdAt: "asc" },
        })
      ).map((r) => r.action),
    ).toEqual(["MEMBER_DEACTIVATED", "MEMBER_REACTIVATED"]);
  });

  test("with a SECOND branch the person stays signed in (signedOut:false), keeps the other branch, and moving onto a branch they already have is a 409 BRANCH_TAKEN", async () => {
    const target = await newMember(Role.TEACHING_STAFF, "Two Branches", 0);
    const other = await db.membership.create({ data: { userId: target.id, branchId: branches[1].id, role: Role.PARENT } });
    const targetCookie = await cookieFor(target);
    const taken = await api(member(target.membershipId), as("admin", { method: "PATCH", body: { branchId: branches[1].id } }));
    expect(taken.status).toBe(409);
    expect(taken.json.error).toMatchObject({ code: "BRANCH_TAKEN", details: [{ path: "body.branchId" }] });
    const res = await api(`${member(target.membershipId)}/deactivate`, as("admin", { method: "POST", body: {} }));
    expect(res.json.data).toMatchObject({ changed: true, signedOut: false });
    const me = await api("/api/v1/auth/me", { cookie: targetCookie });
    expect(me.status).toBe(200); // still signed in …
    expect(me.json.data.memberships).toEqual([{ branchId: branches[1].id, branchName: BRANCH_NAMES[1], role: "PARENT" }]); // … with the branch that is left
    expect(other.id).toBeTruthy();
  });

  test("a deactivated administrator loses the ADMIN routes at once (even with a session that somehow survived)", async () => {
    const other = await newMember(Role.ADMIN, "Soon Gone");
    const otherCookie = await cookieFor(other);
    expect((await api(members, { cookie: otherCookie })).status).toBe(200);
    // deactivate behind the API's back, leaving the session in place: the role is read live, so the session alone grants nothing
    await db.membership.update({ where: { id: other.membershipId }, data: { deactivatedAt: new Date() } });
    expect((await api(members, { cookie: otherCookie })).status).toBe(403);
  });

  test("both are idempotent, and neither is allowed on yourself", async () => {
    const target = await newMember();
    expect((await reactivate(target.membershipId)).json.data).toMatchObject({ changed: false }); // already active
    await deactivate(target.membershipId);
    expect((await deactivate(target.membershipId)).json.data).toMatchObject({ changed: false });
    expect(await db.auditLog.count({ where: { targetId: target.membershipId, action: "MEMBER_DEACTIVATED" } })).toBe(1);
    const mine = (await membershipOf(admin.id)).id;
    expect((await deactivate(mine)).json.error.code).toBe("SELF");
    expect((await reactivate(mine)).json.error.code).toBe("SELF");
  });

  test("two administrators deactivating EACH OTHER at the same instant over HTTP: exactly one succeeds, and the school keeps an administrator", async () => {
    // Every OTHER active administrator (earlier tests promoted some) sits this out, deactivated behind the API's back, so the two racers are
    // the only administrators and the count after the race is exact.
    const bystanders = (await db.membership.findMany({ where: { role: Role.ADMIN, deactivatedAt: null }, select: { id: true } })).map(
      (m) => m.id,
    );
    await db.membership.updateMany({ where: { id: { in: bystanders } }, data: { deactivatedAt: new Date() } });
    try {
      for (let round = 0; round < 3; round++) {
        const x = await newMember(Role.ADMIN, `Racer X${round}`);
        const y = await newMember(Role.ADMIN, `Racer Y${round}`);
        const [cx, cy] = [await cookieFor(x), await cookieFor(y)];
        const results = await Promise.all([
          api(`${member(y.membershipId)}/deactivate`, { cookie: cx, method: "POST", body: {} }),
          api(`${member(x.membershipId)}/deactivate`, { cookie: cy, method: "POST", body: {} }),
        ]);
        expect(
          results.filter((r) => r.status === 200),
          `round ${round}`,
        ).toHaveLength(1);
        // the loser is told LAST_ADMIN, or (if the winner signed them out first) is no longer an administrator at all
        expect(
          results.filter((r) => r.status !== 200).every((r) => [401, 403, 409].includes(r.status)),
          `round ${round}`,
        ).toBe(true);
        expect(
          await db.membership.count({ where: { id: { in: [x.membershipId, y.membershipId] }, role: "ADMIN", deactivatedAt: null } }),
          `round ${round}`,
        ).toBe(1);
        await db.membership.updateMany({ where: { id: { in: [x.membershipId, y.membershipId] } }, data: { role: Role.PARENT } }); // retire the pair
      }
    } finally {
      await db.membership.updateMany({ where: { id: { in: bystanders } }, data: { deactivatedAt: null } });
    }
  });

  test("an unknown id is a 404; a non-admin is a 403 on both routes", async () => {
    const unknown = await deactivate("no-such-membership");
    expect(unknown.status).toBe(404);
    expect((await reactivate("no-such-membership")).json).toEqual(unknown.json);
    const mine = (await membershipOf(admin.id)).id;
    expect((await deactivate(mine, "teacher")).json).toEqual(NO_PERMISSION);
    expect((await reactivate(mine, "teacher")).json).toEqual(NO_PERMISSION);
  });
});
