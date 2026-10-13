import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Input hardening (ISS-0006, ISS-0007): the student import has a row cap and a body cap, and the three routes that read the body by hand (import,
// school settings, attendance) now go through the shared validate() helper, so each refuses an oversized body with 413 and bad JSON with 400 the same way.

let cookie: string;
let branchId: string;
test.beforeAll(async () => {
  await seedInstance();
  await db.studentRecord.deleteMany({ where: { lastName: "Cap" } }); // a run against an unfixed build may have imported them
  const admin = await createUser({ role: Role.ADMIN });
  cookie = cookieHeader((await loginAs(admin)).token!);
  branchId = (await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } })).id;
});

const row = (n: number) => ({ firstName: `Kid${n}`, lastName: "Cap", gender: "MALE" as const, dateOfBirth: "2012-01-01" });
const padding = "x".repeat(1024 * 1024 + 10); // just over MAX_BODY_BYTES (1 MiB)

test.describe("student import", () => {
  test("more than 1000 rows is refused as a validation problem naming the limit", async () => {
    const tooMany = await api("/api/v1/students/import", {
      method: "POST",
      cookie,
      body: { branchId, rows: Array.from({ length: 1001 }, (_, i) => row(i)) },
    });
    expect([tooMany.status, tooMany.json.error.code]).toEqual([400, "VALIDATION"]);
    expect(JSON.stringify(tooMany.json.error)).toMatch(/1000/);
    expect(await db.studentRecord.count({ where: { lastName: "Cap" } })).toBe(0);
  });

  test("an oversized body is 413 and bad JSON is 400 INVALID_BODY", async () => {
    const big = await api("/api/v1/students/import", { method: "POST", cookie, body: { branchId, rows: [row(1)], note: padding } });
    expect(big.status).toBe(413);
    const bad = await api("/api/v1/students/import", { method: "POST", cookie, rawBody: "{" });
    expect([bad.status, bad.json.error.code]).toEqual([400, "INVALID_BODY"]);
  });
});

test.describe("the other hand-parsed routes", () => {
  test("school settings PATCH and attendance POST refuse an oversized body with 413", async () => {
    const settings = await api("/api/v1/settings/school", { method: "PATCH", cookie, body: { name: "x", note: padding } });
    expect(settings.status).toBe(413);
    const attendance = await api("/api/v1/attendance", {
      method: "POST",
      cookie,
      body: { branchId, date: "2026-01-01", records: [], note: padding },
    });
    expect(attendance.status).toBe(413);
  });
});
