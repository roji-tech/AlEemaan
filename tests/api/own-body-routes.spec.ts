import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The routes that read their own request body (sign-in, passwords, two-step verification, invitations, profile, and the staff routes that look for a `branchId` first) read it
// through readJsonBody() / readJsonObject() (lib/api/validate.ts), the one place a body is read and parsed: no further than 1 MiB (413), a body that is not JSON is 400
// INVALID_BODY, a NUL character in a key or a value is 400 VALIDATION (PostgreSQL cannot store one). The routes are found by reading the route files, so a route that adopts
// the reader later is held to the rule without a line here (tests/unit/route-body-guard.spec.ts fails on a route that reads its body any other way). The first-run wizard has
// its own spec (setup.spec.ts); the payment webhook and the two routes whose body is optional are at the end of this file.

const NUL = String.fromCharCode(0);
const MIB = 1024 * 1024;
const API_ROOT = path.join(process.cwd(), "src", "app", "api", "v1");
const FAKE_ID = "cmfakeid0000000000000000";

type OwnBodyRoute = { rel: string; url: string; method: string; hasId: boolean; limited: boolean };

function ownBodyRoutes(dir = API_ROOT): OwnBodyRoute[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ownBodyRoutes(full);
    if (entry.name !== "route.ts") return [];
    const source = fs.readFileSync(full, "utf8");
    if (!/readJson(?:Body|Object)\(/.test(source)) return [];
    const rel = path.relative(API_ROOT, dir).split(path.sep).join("/");
    if (rel === "setup") return [];
    return [...new Set([...source.matchAll(/^export (?:const|async function) (POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]))].map(
      (method) => ({
        rel,
        url: `/api/v1/${rel.replace(/\[[^\]]+\]/g, FAKE_ID)}`,
        method,
        hasId: rel.includes("["),
        limited: /\breserveAttempt\(/.test(source),
      }),
    );
  });
}
const routes = ownBodyRoutes();

let cookie: string;

test.beforeAll(async () => {
  await resetDatabase();
  const home = await seedInstance();
  const admin = await createUser({ superAdmin: true });
  await db.membership.create({ data: { userId: admin.id, branchId: home.id, role: Role.ADMIN } });
  cookie = cookieHeader((await loginAs(admin)).token!);
});
test.afterAll(async () => {
  await resetDatabase();
});

// Routes that limit attempts per account (they call reserveAttempt), and the "never a server error" sweep has already used that account's attempts, so the exact answers below are asked as
// an administrator of their own (a fresh one for every test that sends).
async function freshCookie(): Promise<string> {
  const home = await seedInstance();
  const user = await createUser({ superAdmin: true });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return cookieHeader((await loginAs(user)).token!);
}
const send = async (route: OwnBodyRoute, opts: { body?: unknown; rawBody?: string }, own = false) =>
  api(route.url, { method: route.method, cookie: own && route.limited ? await freshCookie() : cookie, ...opts });

test.describe("every route that reads its own body", () => {
  test("the sweep finds the routes (so it cannot pass by looking at none)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(45);
    expect(routes.map((r) => r.rel)).toEqual(
      expect.arrayContaining(["auth/login", "auth/change-password", "invitations/accept", "account/profile", "announcements"]),
    );
  });

  for (const route of routes) {
    test(`${route.method} ${route.rel}: a body that is not an object, not JSON, or empty is never a server error`, async () => {
      for (const rawBody of ["{nope", "", "null", "[]", '"text"', "7"]) {
        const res = await send(route, { rawBody });
        expect(res.status, `${JSON.stringify(rawBody)}: ${res.text.slice(0, 200)}`).toBeLessThan(500);
      }
    });
  }

  // The exact answers, for the routes that have no id in the path (a made-up id may be refused before the body is looked at).
  for (const route of routes.filter((r) => !r.hasId && !r.rel.startsWith("portal/"))) {
    test.describe(`${route.method} ${route.rel}`, () => {
      test("a body over the cap is 413 PAYLOAD_TOO_LARGE, before anything is looked at", async () => {
        const res = await send(route, { rawBody: JSON.stringify({ pad: "x".repeat(MIB + 10) }) }, true);
        expect(res.status, res.text.slice(0, 200)).toBe(413);
        expect(res.json.error.code).toBe("PAYLOAD_TOO_LARGE");
      });

      test("a NUL character in a value, or in a key nested deep, is 400 VALIDATION", async () => {
        for (const body of [{ probe: `a${NUL}b` }, { outer: [{ [`k${NUL}`]: 1 }] }]) {
          const res = await send(route, { body }, true);
          expect(res.status, res.text.slice(0, 200)).toBe(400);
          expect(res.json.error.code).toBe("VALIDATION");
        }
      });

      test("a body that is not JSON is 400 INVALID_BODY", async () => {
        const res = await send(route, { rawBody: "{nope" }, true);
        expect(res.status, res.text.slice(0, 200)).toBe(400);
        expect(res.json.error.code).toBe("INVALID_BODY");
      });
    });
  }
});

test.describe("the payment webhook (its signature is over the exact bytes, so it reads the raw text)", () => {
  test("a body over its 256 KiB cap is 413, by its length", async () => {
    const res = await api("/api/v1/webhooks/paystack", { origin: null, rawBody: "x".repeat(300 * 1024) });
    expect(res.status).toBe(413);
    expect(res.json).toEqual({ received: false, error: "Payload too large." });
  });
});

test.describe("the routes whose body is optional (student restore, dispatch retry)", () => {
  test("a body over the cap is 413", async () => {
    // the route looks the student up first (a made-up id is a 404 before the body is read), so this one is a real record
    const home = await seedInstance();
    const student = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Body",
        lastName: "Cap",
        admissionNo: "BODY/2026/001",
        gender: "FEMALE",
        dateOfBirth: new Date("2014-01-01"),
      },
    });
    const restore = await api(`/api/v1/students/${student.id}/restore`, {
      method: "POST",
      cookie,
      rawBody: JSON.stringify({ pad: "x".repeat(MIB + 10) }),
    });
    expect(restore.status, restore.text.slice(0, 200)).toBe(413);
    const retry = await api(`/api/v1/communication/dispatches/${FAKE_ID}/retry`, {
      method: "POST",
      cookie,
      rawBody: JSON.stringify({ pad: "x".repeat(MIB + 10) }),
    });
    expect(retry.status, retry.text.slice(0, 200)).toBe(413);
  });

  test("control: no body, an empty body and a body that is not JSON are not refused for it (the route answers about the made-up id)", async () => {
    for (const rawBody of [undefined, "", "{nope"]) {
      for (const url of [`/api/v1/students/${FAKE_ID}/restore`, `/api/v1/communication/dispatches/${FAKE_ID}/retry`]) {
        const res = await api(url, { method: "POST", cookie, ...(rawBody === undefined ? {} : { rawBody }) });
        expect(res.status, `${url} ${JSON.stringify(rawBody)}: ${res.text.slice(0, 200)}`).toBeLessThan(500);
        expect(res.json?.error?.code, url).not.toBe("INVALID_BODY");
      }
    }
  });
});
