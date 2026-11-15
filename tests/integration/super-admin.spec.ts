import { test, expect } from "@playwright/test";
import { Role as R, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { branchIdsFor, canAdminister, isSuperAdmin, resolveBranchRole } from "@/lib/auth/branch-access";

// Branch administrators and superadmins (plan S1–S5, ADR 0012's interim bullet): `ADMIN` is the administrator of ONE branch, and the
// `User.isSuperAdmin` flag administers every branch. (The test of the migration's own backfill was removed with the migration history, task 0051.)

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const otherBranch = async (not: string) => db.branch.findFirstOrThrow({ where: { id: { not } }, orderBy: { name: "asc" } });

test.describe("who administers which branch", () => {
  test("a superadmin administers every branch; a branch admin only their own; staff, a parent and a stranger none", async () => {
    const superAdmin = await createUser({ role: R.ADMIN }); // default: superadmin
    const branchAdmin = await createUser({ role: R.ADMIN, superAdmin: false });
    const teacher = await createUser({ role: R.TEACHING_STAFF });
    const parent = await createUser({ role: R.PARENT });
    const stranger = await createUser();
    const here = branchAdmin.branchId!;
    const there = (await otherBranch(here)).id;

    for (const branch of [here, there]) expect(await canAdminister(superAdmin.id, branch)).toBe(true);
    expect(await canAdminister(branchAdmin.id, here)).toBe(true);
    expect(await canAdminister(branchAdmin.id, there)).toBe(false);
    for (const person of [teacher, parent, stranger]) {
      expect(await canAdminister(person.id, here)).toBe(false);
      expect(await canAdminister(person.id, there)).toBe(false);
    }
    expect(await isSuperAdmin(superAdmin.id)).toBe(true);
    expect(await isSuperAdmin(branchAdmin.id)).toBe(false);
  });

  test("a branch admin who is a teacher elsewhere administers one branch and teaches in the other", async () => {
    const person = await createUser({ role: R.ADMIN, superAdmin: false });
    const there = await otherBranch(person.branchId!);
    await db.membership.create({ data: { userId: person.id, branchId: there.id, role: R.TEACHING_STAFF } });
    expect(await resolveBranchRole(person.id, person.branchId!)).toBe(R.ADMIN);
    expect(await resolveBranchRole(person.id, there.id)).toBe(R.TEACHING_STAFF);
    expect(await canAdminister(person.id, there.id)).toBe(false);
    expect(new Set((await branchIdsFor(person.id)) as string[])).toEqual(new Set([person.branchId, there.id]));
  });

  test("a deactivated administrator membership administers nothing; a deactivated superadmin keeps nothing either", async () => {
    const branchAdmin = await createUser({ role: R.ADMIN, superAdmin: false });
    const superAdmin = await createUser({ role: R.ADMIN });
    await db.membership.updateMany({ where: { userId: { in: [branchAdmin.id, superAdmin.id] } }, data: { deactivatedAt: new Date() } });
    expect(await canAdminister(branchAdmin.id, branchAdmin.branchId!)).toBe(false);
    // a superadmin needs at least one active membership (as signing in does)
    expect(await canAdminister(superAdmin.id, superAdmin.branchId!)).toBe(false);
    expect(await resolveBranchRole(superAdmin.id, superAdmin.branchId!)).toBeNull();
    expect(await branchIdsFor(superAdmin.id)).toEqual([]);
  });

  test("resolveBranchRole / branchIdsFor: a superadmin is ADMIN everywhere and sees every branch; a branch admin sees only theirs", async () => {
    const superAdmin = await createUser({ role: R.TEACHING_STAFF, superAdmin: true });
    const branchAdmin = await createUser({ role: R.ADMIN, superAdmin: false });
    const there = (await otherBranch(branchAdmin.branchId!)).id;
    expect(await resolveBranchRole(superAdmin.id, there)).toBe(R.ADMIN);
    expect(await branchIdsFor(superAdmin.id)).toBe("all");
    expect(await resolveBranchRole(branchAdmin.id, there)).toBeNull();
    expect(await branchIdsFor(branchAdmin.id)).toEqual([branchAdmin.branchId]);
  });
});
