import "../support/env";
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Role, createUser, db, resetDatabase, seedInstance, uniqueEmail } from "../support/db";

// `pnpm superadmin:make -- <email>`: the operator's way to create the first superadmin and the way back if all are lost (plan S6). Run here as
// the real script, as a child process, against the test database.

const run = promisify(execFile);
const script = (...args: string[]) =>
  run(process.execPath, ["scripts/make-superadmin.mjs", ...args], { env: process.env, cwd: process.cwd() }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );
const flag = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).isSuperAdmin;

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.describe("scripts/make-superadmin.mjs", () => {
  test("makes the person a superadmin, audits it, and touches nobody else; running it again changes nothing", async () => {
    const user = await createUser({ role: Role.ADMIN, superAdmin: false });
    const bystander = await createUser({ role: Role.ADMIN, superAdmin: false });

    const res = await script(user.email);
    expect(res.code, res.err).toBe(0);
    expect(res.out).toContain(user.email);
    expect(await flag(user.id)).toBe(true);
    expect(await flag(bystander.id)).toBe(false);
    const audit = await db.auditLog.findMany({ where: { targetId: user.id, action: "SUPERADMIN_GRANTED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toMatch(/operator/i);

    const again = await script(user.email);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/already/i);
    expect(await db.auditLog.count({ where: { targetId: user.id, action: "SUPERADMIN_GRANTED" } })).toBe(1);
  });

  test("the address is case-insensitive, and pnpm's leading `--` is ignored", async () => {
    const user = await createUser({ email: uniqueEmail("promote"), role: Role.TEACHING_STAFF });
    const res = await script("--", user.email.toUpperCase());
    expect(res.code, res.err).toBe(0);
    expect(await flag(user.id)).toBe(true);
  });

  test("an unknown address, no address, or a person with no active membership changes nothing and exits non-zero", async () => {
    expect((await script("nobody@test.example")).code).toBe(1);
    expect((await script()).code).toBe(2);
    const gone = await createUser({ role: Role.ADMIN, superAdmin: false });
    await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });
    const res = await script(gone.email);
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/no active membership/i);
    expect(await flag(gone.id)).toBe(false);
    expect(await db.auditLog.count({ where: { action: "SUPERADMIN_GRANTED" } })).toBe(0);
  });
});
