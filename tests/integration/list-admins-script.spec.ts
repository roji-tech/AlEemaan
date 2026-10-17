import "../support/env";
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Role, createUser, db, enableMfa, resetDatabase, seedInstance } from "../support/db";

// `pnpm admins:list`: the read-only list the maintainer reads BEFORE the branch-admins migration goes live (ADR 0014): the migration makes every person
// with an active ADMIN membership a superadmin, so the maintainer decides who should keep that and who should be demoted to a branch administrator.
// Run here as the real script, as a child process, against the test database.

const run = promisify(execFile);
const script = (...args: string[]) =>
  run(process.execPath, ["scripts/list-admins.mjs", ...args], { env: process.env, cwd: process.cwd() }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.describe("scripts/list-admins.mjs", () => {
  test("lists every person with an active ADMIN membership - their branches, whether they are already a superadmin, whether two-step verification is on - and nobody else", async () => {
    const [primaryEn, secondaryEn] = await db.branch.findMany({ orderBy: { name: "asc" }, take: 2 });
    const both = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Head Both" });
    await db.membership.create({ data: { userId: both.id, branchId: secondaryEn.id, role: Role.ADMIN } });
    await enableMfa(both.id);
    const one = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch One" });
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Plain Teacher" });
    const gone = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Gone Admin" });
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    expect(primaryEn).toBeTruthy();

    const res = await script();
    expect(res.code, res.err).toBe(0);
    expect(res.out).toContain(both.email);
    expect(res.out).toContain(one.email);
    expect(res.out).not.toContain(teacher.email);
    expect(res.out).not.toContain(gone.email); // an inactive administrator is not one
    const line = (email: string) => res.out.split("\n").find((l) => l.includes(email)) ?? "";
    expect(line(both.email)).toMatch(/superadmin: yes/i);
    expect(line(both.email)).toMatch(/two-step: on/i);
    expect(line(both.email)).toContain(secondaryEn.name);
    expect(line(one.email)).toMatch(/superadmin: no/i);
    expect(line(one.email)).toMatch(/two-step: off/i);
    expect(res.out).toMatch(/2 active administrators/i);
  });

  test("it changes nothing and takes no arguments", async () => {
    await createUser({ role: Role.ADMIN, superAdmin: false });
    const before = [await db.user.count({ where: { isSuperAdmin: true } }), await db.auditLog.count(), await db.membership.count()];
    expect((await script()).code).toBe(0);
    expect([await db.user.count({ where: { isSuperAdmin: true } }), await db.auditLog.count(), await db.membership.count()]).toEqual(
      before,
    );
    expect((await script("someone@example.test")).code).toBe(2);
  });

  test("an installation with no administrator says so", async () => {
    const res = await script();
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/no active administrators/i);
  });
});
