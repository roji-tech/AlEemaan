import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { runtimeDatabaseUrl } from "@/lib/db-url";

// Task 0077: the running app can use a pooled address (DATABASE_URL_POOLED) while Prisma's command line keeps the direct one (DATABASE_URL). It is optional, it fails closed on a mistake
// without ever repeating a value, and no shell or `.env` can steer the tests or the walkthrough at a hosted database through it.

const DIRECT = "postgresql://owner:s3cretDirectPw@ep-demo.c-8.eu-central-1.aws.neon.tech/aleemaan?sslmode=require&connect_timeout=15";
const POOLED = "postgresql://owner:s3cretPooledPw@ep-demo-pooler.c-8.eu-central-1.aws.neon.tech/aleemaan?sslmode=require&pgbouncer=true";

test.describe("runtimeDatabaseUrl", () => {
  test("not set, empty or only spaces: none, so Prisma reads DATABASE_URL as before", () => {
    expect(runtimeDatabaseUrl({ DATABASE_URL: DIRECT })).toBeUndefined();
    expect(runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: "" })).toBeUndefined();
    expect(runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: "   " })).toBeUndefined();
    expect(runtimeDatabaseUrl({})).toBeUndefined();
  });

  test("set: the pooled address is the one the app uses, trimmed", () => {
    expect(runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: POOLED })).toBe(POOLED);
    expect(runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: `  ${POOLED}\n` })).toBe(POOLED);
    expect(runtimeDatabaseUrl({ DATABASE_URL_POOLED: POOLED })).toBe(POOLED); // no direct address in this environment (the CLI is not run here)
    expect(runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: POOLED.replace("postgresql://", "postgres://") })).toMatch(
      /^postgres:\/\//,
    );
  });

  test("an address that is not a PostgreSQL one is refused, naming the variable and not the value", () => {
    for (const bad of ["mysql://u:p@h/aleemaan", "https://example.com/aleemaan", "not a url", "ep-demo-pooler.neon.tech/aleemaan"]) {
      let message = "";
      try {
        runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: bad });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, JSON.stringify(bad)).toContain("DATABASE_URL_POOLED");
      expect(message).not.toContain(bad);
    }
  });

  test("a pooled address for a different database than DATABASE_URL is refused, and no message repeats a password", () => {
    const other = POOLED.replace("/aleemaan?", "/aleemaan-staging?");
    let message = "";
    try {
      runtimeDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_POOLED: other });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL_POOLED");
    expect(message).toContain("DATABASE_URL");
    expect(message).toMatch(/same database/);
    for (const secret of ["s3cretDirectPw", "s3cretPooledPw", "aleemaan-staging", "ep-demo"]) expect(message).not.toContain(secret);
  });
});

test.describe("nothing in a shell or a .env can steer the tests or the walkthrough at another database through DATABASE_URL_POOLED", () => {
  // Run these two with DATABASE_URL_POOLED set in the shell to see the harness decide: the variable may not survive the import.
  test("the test harness blanks it in the process (a server started from `next start` would otherwise read it from the shell)", async () => {
    await import("../support/env");
    expect(process.env.DATABASE_URL_POOLED ?? "").toBe("");
  });

  test("the test harness blanks it in the environment of every server under test", async () => {
    const { serverEnv } = await import("../support/env");
    expect(serverEnv("http://localhost:3999").DATABASE_URL_POOLED).toBe("");
  });

  test("the walkthrough runner blanks it for the server and the build it starts", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../scripts/walkthrough-run/run.mjs"), "utf8");
    const blanks = source.match(/DATABASE_URL_POOLED:\s*""/g) ?? [];
    expect(blanks.length, 'DATABASE_URL_POOLED: "" in the server environment and in the build').toBeGreaterThanOrEqual(2);
  });

  test("the guard on the servers the startup-secrets spec starts blanks it too", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../integration/startup-secrets.spec.ts"), "utf8");
    expect(source).toMatch(/DATABASE_URL_POOLED:\s*""/);
  });
});
