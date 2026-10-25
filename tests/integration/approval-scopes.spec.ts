import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Permission, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";

// Sections and approval scopes (task 0039 slice 1; migration 20261025120000_results_approval_scopes): the database itself refuses what the design says must never
// happen, whichever code writes: a section with no name or a too-long one, two live sections of a branch with the same name, a class in another branch's section, a
// scope that names the wrong target for its kind, the same scope twice, and a scope for someone with no membership of that branch.

let home: { id: string };
let other: { id: string };
let teacher: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  teacher = await createUser();
  await db.membership.create({
    data: { userId: teacher.id, branchId: home.id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
  });
});

const rejects = async (p: Promise<unknown>, message?: RegExp) => {
  if (message) await expect(p).rejects.toThrow(message);
  else await expect(p).rejects.toThrow();
};
const section = (name = "Junior", branchId = home.id) => db.section.create({ data: { branchId, name } });
const group = (branchId = home.id, name = `JSS ${Math.random()}`) => db.classGroup.create({ data: { branchId, name } });

test("the migration is additive: tables, a type and a nullable column, and nothing else is touched", () => {
  const sql = readFileSync(join(process.cwd(), "prisma", "migrations", "20261025120000_results_approval_scopes", "migration.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  expect(statements).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|\bTRUNCATE\b/i);
  expect(statements).not.toMatch(/INSERT INTO/i); // nobody gets a scope from the migration
  expect(statements).toMatch(/ADD COLUMN\s+"sectionId" TEXT;/); // nullable
});

test.describe("sections", () => {
  test("a name is required, at most 80 characters, and a live name is unique in its branch whatever the case", async () => {
    await rejects(section(""), /Section_name_given/);
    await rejects(section("   \t"), /Section_name_given/);
    await rejects(section("x".repeat(81)), /Section_name_given/);
    await section("x".repeat(80));
    await section("Junior");
    await rejects(section("JUNIOR"), /Section_live_name_key|Unique constraint/);
    await rejects(section("  junior".trim()), /Section_live_name_key|Unique constraint/);
  });

  test("the same name is fine in another branch, and again once the first is archived", async () => {
    const first = await section("Junior");
    await section("Junior", other.id);
    await db.section.update({ where: { id: first.id }, data: { archivedAt: new Date() } });
    await section("Junior");
  });

  test("a class can be in a section of its own branch only", async () => {
    const mine = await section("Junior");
    const theirs = await section("Junior", other.id);
    const g = await group();
    await db.classGroup.update({ where: { id: g.id }, data: { sectionId: mine.id } });
    await rejects(db.classGroup.update({ where: { id: g.id }, data: { sectionId: theirs.id } }), /Foreign key|violat/i);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: g.id } })).sectionId).toBe(mine.id);
  });

  test("a section with classes or scopes cannot be deleted: it is archived", async () => {
    const s = await section("Junior");
    const g = await group();
    await db.classGroup.update({ where: { id: g.id }, data: { sectionId: s.id } });
    await rejects(db.section.delete({ where: { id: s.id } }), /Foreign key|violat/i);
  });
});

test.describe("approval scopes", () => {
  const scope = (data: Record<string, unknown>) =>
    db.resultApprovalScope.create({ data: { branchId: home.id, userId: teacher.id, ...data } as never });

  test("each kind names exactly its own target", async () => {
    const s = await section();
    const g = await group();
    await scope({ kind: "GENERAL" });
    await scope({ kind: "SECTION", sectionId: s.id });
    await scope({ kind: "CLASS", classGroupId: g.id });
    await rejects(scope({ kind: "GENERAL", sectionId: s.id }), /kind_target/);
    await rejects(scope({ kind: "SECTION" }), /kind_target/);
    await rejects(scope({ kind: "SECTION", sectionId: s.id, classGroupId: g.id }), /kind_target/);
    await rejects(scope({ kind: "CLASS" }), /kind_target/);
    await rejects(scope({ kind: "CLASS", sectionId: s.id }), /kind_target/);
  });

  test("the same scope twice is refused, and General twice too", async () => {
    const s = await section();
    await scope({ kind: "GENERAL" });
    await rejects(scope({ kind: "GENERAL" }), /target_key|Unique constraint/);
    await scope({ kind: "SECTION", sectionId: s.id });
    await rejects(scope({ kind: "SECTION", sectionId: s.id }), /target_key|Unique constraint/);
  });

  test("a scope cannot name a section or a class of another branch", async () => {
    const theirs = await section("Junior", other.id);
    const theirGroup = await group(other.id);
    await rejects(scope({ kind: "SECTION", sectionId: theirs.id }), /Foreign key|violat/i);
    await rejects(scope({ kind: "CLASS", classGroupId: theirGroup.id }), /Foreign key|violat/i);
  });

  test("a scope needs a membership of that branch", async () => {
    const stranger = await createUser();
    await rejects(
      db.resultApprovalScope.create({ data: { branchId: home.id, userId: stranger.id, kind: "GENERAL" } }),
      /Foreign key|violat/i,
    );
  });

  test("deleting a membership removes its scopes, and a section or class that is named cannot be deleted from under a scope", async () => {
    const s = await section();
    await scope({ kind: "SECTION", sectionId: s.id });
    await rejects(db.section.delete({ where: { id: s.id } }), /Foreign key|violat/i);
    await db.membership.delete({ where: { userId_branchId: { userId: teacher.id, branchId: home.id } } });
    expect(await db.resultApprovalScope.count({ where: { userId: teacher.id } })).toBe(0);
  });
});
