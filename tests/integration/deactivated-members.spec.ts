import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { getUserMemberships } from "@/lib/auth/memberships";
import { completeSignIn } from "@/lib/auth/complete-sign-in";

// A deactivated membership is NO membership (domain-implementation-plan.md, "Build design — Users pages and invitations"): the row stays —
// history, and a way back — but every reader of memberships treats it as absent. That is a rule many places must remember, so each reader
// is pinned here (the HTTP layer pins the same for every route behind `withAuth({ roles })`: see tests/api/members.spec.ts).

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const deactivate = (userId: string) => db.membership.updateMany({ where: { userId }, data: { deactivatedAt: new Date() } });
const reactivate = (userId: string) => db.membership.updateMany({ where: { userId }, data: { deactivatedAt: null } });

test.describe("the readers", () => {
  test("getUserMemberships (the shell, the dashboard) omits a deactivated membership, and a reactivated one is back", async () => {
    const user = await createUser({ role: Role.TEACHING_STAFF });
    expect(await getUserMemberships(user.id)).toMatchObject([{ role: "TEACHING_STAFF" }]);
    await deactivate(user.id);
    expect(await getUserMemberships(user.id)).toEqual([]);
    await reactivate(user.id);
    expect(await getUserMemberships(user.id)).toMatchObject([{ role: "TEACHING_STAFF" }]);
  });

  test("with two memberships only the deactivated one disappears", async () => {
    const user = await createUser({ role: Role.TEACHING_STAFF });
    const other = await db.branch.findFirstOrThrow({ where: { id: { not: user.branchId! } } });
    await db.membership.create({ data: { userId: user.id, branchId: other.id, role: Role.PARENT } });
    await db.membership.updateMany({ where: { userId: user.id, role: Role.TEACHING_STAFF }, data: { deactivatedAt: new Date() } });
    expect(await getUserMemberships(user.id)).toMatchObject([{ role: "PARENT", branchId: other.id }]);
  });

  test("the sign-in policy: a deactivated administrator gets an ORDINARY session (no 7-day administrator cap); an active one gets the cap", async () => {
    const admin = await createUser({ role: Role.ADMIN });
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const signIn = async (userId: string) => {
      const res = await completeSignIn(
        new NextRequest("http://localhost/api/v1/auth/login", { method: "POST" }),
        { id: userId, name: null, email: null },
        true,
      );
      expect(res.status).toBe(200);
      const session = await db.session.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: "desc" } });
      return session.absoluteExpires.getTime() - session.createdAt.getTime();
    };
    expect(await signIn(admin.id)).toBeLessThanOrEqual(sevenDays + 60_000);
    await deactivate(admin.id);
    expect(await signIn(admin.id)).toBeGreaterThan(sevenDays * 2); // a remembered ordinary session is 90 days
  });
});
