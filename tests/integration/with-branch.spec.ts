import { test, expect } from "@playwright/test";
import type { NextRequest } from "next/server";
import { Role as R, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { branchGrant, withBranch } from "@/lib/auth/with-branch";

// The branch combinator (ADR 0015): the handler runs only after the branch it acts on has been resolved and the caller's authority THERE checked; it gets
// the branch and the role held in it. Real database: the authority comes from real memberships.

let home: { id: string };
let other: { id: string };
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const req = {} as NextRequest;
const asBranch = async (userId: string, branchId: string | null, as: "administer" | "staff-read" | "staff-write") => {
  const r = await branchGrant(userId, branchId, as);
  return r.ok ? `ok:${r.grant.role}` : r.why;
};
const inBranch = (userId: string, branchId: string, role: R) => db.membership.create({ data: { userId, branchId, role } });

test.describe("administer", () => {
  test("a superadmin administers every branch; an ADMIN only their own; nobody else, whatever staff role they hold there", async () => {
    const superAdmin = await createUser({ role: R.ADMIN, superAdmin: true });
    const branchAdmin = await createUser({ role: R.ADMIN, superAdmin: false });
    const teacher = await createUser({ role: R.TEACHING_STAFF });
    const parent = await createUser({ role: R.PARENT });
    const nobody = await createUser();
    expect(await asBranch(superAdmin.id, home.id, "administer")).toBe("ok:ADMIN");
    expect(await asBranch(superAdmin.id, other.id, "administer")).toBe("ok:ADMIN");
    expect(await asBranch(branchAdmin.id, home.id, "administer")).toBe("ok:ADMIN");
    expect(await asBranch(branchAdmin.id, other.id, "administer")).toBe("NOT_FOUND");
    for (const who of [teacher, parent, nobody]) expect(await asBranch(who.id, home.id, "administer")).toBe("NOT_FOUND");
  });

  test("a deactivated administrator administers nothing; an unknown branch and no branch at all are the same refusal", async () => {
    const gone = await createUser({ role: R.ADMIN, superAdmin: false });
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    expect(await asBranch(gone.id, home.id, "administer")).toBe("NOT_FOUND");
    const admin = await createUser({ role: R.ADMIN, superAdmin: false });
    expect(await asBranch(admin.id, "no-such-branch", "administer")).toBe("NOT_FOUND");
    expect(await asBranch(admin.id, null, "administer")).toBe("NOT_FOUND");
  });
});

test.describe("staff-read and staff-write", () => {
  test("the role returned is the one held IN that branch; a student or parent membership gives nothing", async () => {
    const mixed = await createUser({ role: R.TEACHING_STAFF }); // teacher in the home branch
    await inBranch(mixed.id, other.id, R.NON_TEACHING_STAFF);
    expect(await asBranch(mixed.id, home.id, "staff-read")).toBe("ok:TEACHING_STAFF");
    expect(await asBranch(mixed.id, other.id, "staff-read")).toBe("ok:NON_TEACHING_STAFF");
    const parent = await createUser({ role: R.PARENT });
    const student = await createUser({ role: R.STUDENT });
    for (const who of [parent, student]) expect(await asBranch(who.id, home.id, "staff-read")).toBe("NOT_FOUND");
    expect(await asBranch(mixed.id, "no-such-branch", "staff-read")).toBe("NOT_FOUND");
  });

  test("staff-write needs ADMIN or TEACHING_STAFF in that branch: a registrar there is FORBIDDEN (not 'not found'); outside the branch it is not found", async () => {
    const mixed = await createUser({ role: R.TEACHING_STAFF });
    await inBranch(mixed.id, other.id, R.NON_TEACHING_STAFF);
    expect(await asBranch(mixed.id, home.id, "staff-write")).toBe("ok:TEACHING_STAFF");
    expect(await asBranch(mixed.id, other.id, "staff-write")).toBe("FORBIDDEN");
    const superAdmin = await createUser({ role: R.ADMIN, superAdmin: true });
    expect(await asBranch(superAdmin.id, other.id, "staff-write")).toBe("ok:ADMIN");
    const stranger = await createUser({ role: R.TEACHING_STAFF });
    await db.membership.deleteMany({ where: { userId: stranger.id } });
    expect(await asBranch(stranger.id, home.id, "staff-write")).toBe("NOT_FOUND");
  });
});

test.describe("the wrapper", () => {
  const ok = () => new Response("handled", { status: 200 });

  test("the handler runs only for a branch the caller may act on, and receives the branch and role; the input and context reach `of`", async () => {
    const admin = await createUser({ role: R.ADMIN, superAdmin: false });
    let seen: unknown;
    const handler = withBranch<{ body: { branchId: string } }, { userId: string }, { tag: string }>(
      { of: (input, _req, ctx) => (ctx.tag === "t" ? input.body.branchId : null), as: "administer", where: "body" },
      (_req, _auth, _ctx, _input, branch) => ((seen = branch), ok()),
    );
    const res = await handler(req, { userId: admin.id }, { tag: "t" }, { body: { branchId: home.id } });
    expect([res.status, seen]).toEqual([200, { branchId: home.id, role: R.ADMIN }]);

    seen = undefined;
    const refused = await handler(req, { userId: admin.id }, { tag: "t" }, { body: { branchId: other.id } });
    expect([refused.status, seen]).toEqual([403, undefined]); // a branch named in a body that is not theirs: 403, and the handler never ran
    expect((await refused.json()).error.code).toBe("FORBIDDEN");
  });

  test("a URL or looked-up entity that is unknown or in another branch is the SAME 404; an override answers in the route's own envelope", async () => {
    const admin = await createUser({ role: R.ADMIN, superAdmin: false });
    const byEntity = withBranch<undefined, { userId: string }, { id: string }>(
      { of: (_i, _r, ctx) => (ctx.id === "mine" ? home.id : ctx.id === "theirs" ? other.id : null), as: "administer" },
      ok,
    );
    const statuses = await Promise.all(
      ["mine", "theirs", "unknown"].map(async (id) => (await byEntity(req, { userId: admin.id }, { id }, undefined)).status),
    );
    expect(statuses).toEqual([200, 404, 404]);

    const own = withBranch<undefined, { userId: string }, unknown>(
      { of: () => other.id, as: "staff-read", refuse: (why) => Response.json({ custom: why }, { status: 418 }) },
      ok,
    );
    const res = await own(req, { userId: admin.id }, {}, undefined);
    expect([res.status, await res.json()]).toEqual([418, { custom: "NOT_FOUND" }]);
  });
});
