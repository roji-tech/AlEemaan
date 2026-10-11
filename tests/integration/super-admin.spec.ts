import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Role as R, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { branchIdsFor, canAdminister, isSuperAdmin, resolveBranchRole } from "@/lib/auth/branch-access";

// Branch administrators and superadmins (plan S1–S5, ADR 0012's interim bullet): `ADMIN` is the administrator of ONE branch, and the
// `User.isSuperAdmin` flag administers every branch. The migration runs against a LIVE school, so its backfill is tested on legacy rows.

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261011120000_super_admin_flag/migration.sql");
const statements = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

class Rollback extends Error {}

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const otherBranch = async (not: string) => db.branch.findFirstOrThrow({ where: { id: { not } }, orderBy: { name: "asc" } });

test.describe("the migration", () => {
  test("every ACTIVE administrator becomes a superadmin, nobody else does, and running it twice changes nothing more", async () => {
    // legacy rows, created the way the old code created them (no flag)
    const activeAdmin = await createUser({ role: R.ADMIN, superAdmin: false });
    const deactivatedAdmin = await createUser({ role: R.ADMIN, superAdmin: false });
    await db.membership.updateMany({ where: { userId: deactivatedAdmin.id }, data: { deactivatedAt: new Date() } });
    const teacher = await createUser({ role: R.TEACHING_STAFF });
    const parent = await createUser({ role: R.PARENT });
    const nobody = await createUser();
    // one person with TWO admin memberships, and one admin in a branch that is not the first
    const twice = await createUser({ role: R.ADMIN, superAdmin: false });
    await db.membership.create({ data: { userId: twice.id, branchId: (await otherBranch(twice.branchId!)).id, role: R.ADMIN } });

    const sql = statements(fs.readFileSync(MIGRATION, "utf8"));
    expect(sql.length).toBeGreaterThanOrEqual(2); // the parser found the statements (a parser that finds none would pass vacuously)

    let observed: { before: Record<string, boolean>; once: Record<string, boolean>; twice: Record<string, boolean> } | undefined;
    const flags = async (tx: Pick<typeof db, "$queryRawUnsafe">) =>
      Object.fromEntries(
        (await tx.$queryRawUnsafe<{ id: string; isSuperAdmin: boolean }[]>(`SELECT id, "isSuperAdmin" FROM "User"`)).map((r) => [
          r.id,
          r.isSuperAdmin,
        ]),
      );
    const outcome: unknown = await db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN "isSuperAdmin"`); // step back to "before the migration"
        for (const statement of sql) await tx.$executeRawUnsafe(statement);
        const once = await flags(tx);
        for (const statement of sql.filter((s) => /^UPDATE/i.test(s))) await tx.$executeRawUnsafe(statement); // the backfill again
        const again = await flags(tx);
        observed = { before: {}, once, twice: again };
        throw new Rollback();
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(String(outcome)).toBe(String(new Rollback()));

    const { once, twice: again } = observed!;
    expect(once[activeAdmin.id]).toBe(true);
    expect(once[twice.id]).toBe(true);
    expect(once[deactivatedAdmin.id]).toBe(false); // a deactivated membership is no membership (ADR 0002)
    expect(once[teacher.id]).toBe(false);
    expect(once[parent.id]).toBe(false);
    expect(once[nobody.id]).toBe(false);
    expect(again).toEqual(once);
    // the test database is exactly as it was
    expect((await db.user.findUniqueOrThrow({ where: { id: activeAdmin.id } })).isSuperAdmin).toBe(false);
  });
});

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
