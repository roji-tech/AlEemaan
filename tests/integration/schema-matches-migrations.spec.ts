import "../support/env";
import { test, expect } from "@playwright/test";
import { spawnSync } from "child_process";
import path from "path";
import { TEST_DATABASE_URL } from "../support/env";

// The Prisma schema describes the database the migrations build (task 0068). The test database is made by `prisma migrate deploy` in the setup project, so a diff from it to the
// schema is empty exactly when the schema and the migrations agree. It was not: four tables had `character varying(n)` columns (with length checks) in the migrations and plain
// `String` in the schema, so `prisma migrate dev` would have proposed a migration for them. The next drift (a column added to the schema without a migration, or the reverse) fails here.

test("a diff from the migrated test database to the Prisma schema is empty", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "prisma", "migrate", "diff", "--from-url", TEST_DATABASE_URL, "--to-schema-datamodel", "prisma/schema", "--exit-code"],
    { cwd: path.resolve(__dirname, "../.."), encoding: "utf-8" },
  );
  // the database address is not printed: only the diff's own report
  const report = `${run.stdout}${run.stderr}`.replaceAll(TEST_DATABASE_URL, "<test database>");
  expect(run.status, report).toBe(0);
});
