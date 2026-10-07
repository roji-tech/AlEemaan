import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Role as R, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { hashInvitationToken, newInvitationToken } from "@/lib/invitations/token";

// The Users/invitations migration runs against a LIVE school, so it must be additive: every existing row stays exactly as it was and every
// existing membership reads as ACTIVE. DDL is transactional in Postgres, so this test steps the test database BACK to the state before the
// migration (inside a transaction), fills it with "legacy" rows, applies the migration's own SQL file, compares, and rolls everything back.

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261007090000_users_invitations/migration.sql");
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

test("applied to a database with existing people, the migration changes no existing row and every membership is ACTIVE", async () => {
  const people = [await createUser({ role: R.ADMIN }), await createUser({ role: R.TEACHING_STAFF }), await createUser({ role: R.PARENT })];
  const sql = statements(fs.readFileSync(MIGRATION, "utf8"));
  expect(sql.length).toBeGreaterThan(5); // the parser found the statements (a parser that finds none would pass vacuously)

  let observed:
    { before: Record<string, unknown>[]; after: Record<string, unknown>[]; sessionsBefore: number; sessionsAfter: number } | undefined;
  const outcome: unknown = await db
    .$transaction(async (tx) => {
      // step back to "before the migration"
      await tx.$executeRawUnsafe(`DROP TABLE "Invitation"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "Membership" DROP COLUMN "deactivatedAt"`);
      const before = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "Membership" ORDER BY id`);
      const sessionsBefore = Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "Session"`))[0].n);

      for (const statement of sql) await tx.$executeRawUnsafe(statement);

      const after = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "Membership" ORDER BY id /* after: a different text, so no cached plan for the old column list is reused */`,
      );
      const sessionsAfter = Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "Session"`))[0].n);
      observed = { before, after, sessionsBefore, sessionsAfter };
      throw new Rollback(); // leave the test database exactly as it was
    })
    .then(
      () => null,
      (error: unknown) => error,
    );
  expect(String(outcome)).toBe(String(new Rollback())); // the only way out is the deliberate rollback — any other error is shown here

  const { before, after, sessionsBefore, sessionsAfter } = observed!;
  expect(before).toHaveLength(people.length);
  expect(after).toHaveLength(before.length);
  for (let i = 0; i < before.length; i++) {
    expect(after[i]).toEqual({ ...before[i], deactivatedAt: null }); // identical, plus one new column that says "active"
  }
  expect(sessionsAfter).toBe(sessionsBefore);
  // and the rollback worked: the real database still has the migrated shape
  expect(await db.membership.count({ where: { deactivatedAt: null } })).toBe(people.length);
  expect(await db.invitation.count()).toBe(0);
});

test.describe("what the migration enforces whatever the application does", () => {
  test("two OPEN invitations for one address cannot exist (a revoked one does not count); a mixed-case address is refused", async () => {
    const branch = await db.branch.findFirstOrThrow();
    const make = (email: string, extra: { revokedAt?: Date } = {}) =>
      db.invitation.create({
        data: {
          email,
          role: R.PARENT,
          branchId: branch.id,
          tokenHash: hashInvitationToken(newInvitationToken()),
          expiresAt: new Date(Date.now() + 60_000),
          ...extra,
        },
      });
    await make("one@invite.test");
    await expect(make("one@invite.test")).rejects.toThrow(); // the partial unique index
    await expect(make("ONE@invite.test")).rejects.toThrow(); // the CHECK: addresses are stored lower-case
    await make("two@invite.test", { revokedAt: new Date() });
    await make("two@invite.test"); // a revoked one frees the address
  });
});
