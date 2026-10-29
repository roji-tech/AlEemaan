import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Role, createUser, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { NUL_MESSAGE } from "@/lib/api/no-nul";

// A NUL character in a request (lib/api/no-nul.ts). PostgreSQL cannot store one, so a route that passed it on answered 500. It is refused before any handler runs - a 400 for
// the query string and for a JSON body - on EVERY route behind withAuth, including the routes that read their own body. (A path segment is handled by sanitizePathParams, which
// path-id-fuzz.spec.ts covers.) The routes are found by reading the route files, so a route added later is held to the rule without a line here. The routes that are not behind
// withAuth (sign-in, passwords, invitations, the portal, the webhook) are each tried with a NUL in the fields they read and must answer something other than a 5xx.

const NUL = String.fromCharCode(0);
const API_ROOT = path.join(process.cwd(), "src", "app", "api");
/// A route that would end the session the sweep uses if a request got through to it.
const SKIPPED = new Set(["v1/auth/sessions/revoke-others"]);
const PLACEHOLDER_ID = "cabcdefghijklmnopqrstuvwx";

type RouteFile = { rel: string; methods: string[]; guarded: boolean };

function routeFiles(dir = API_ROOT): RouteFile[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    if (entry.name !== "route.ts") return [];
    const source = fs.readFileSync(full, "utf8");
    const methods = [...new Set([...source.matchAll(/^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]))];
    return [{ rel: path.relative(API_ROOT, dir).split(path.sep).join("/"), methods, guarded: /\bwithAuth(?:Gated)?\(/.test(source) }];
  });
}
/// The routes behind withAuth (directly or through withAuthGated): what the central scan covers.
const guardedRoutes = routeFiles().filter((route) => route.guarded && !SKIPPED.has(route.rel));

let home: { id: string };
let admin: string;
const fill = (rel: string, segment: string) => rel.replace(/\[[^\]]+\]/g, segment);
/// A GET has no body; any other method gets an empty one (the scan runs before the handler reads it).
const call = (url: string, method: string) => api(url, { method, cookie: admin, ...(method === "GET" ? {} : { body: {} }) });

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  const superAdmin = await createUser({ role: Role.ADMIN });
  admin = cookieHeader((await loginAs(superAdmin)).token!);
});

test.describe("every route behind withAuth", () => {
  test("the sweep finds the routes (so it cannot pass by looking at none)", () => {
    expect(guardedRoutes.length).toBeGreaterThan(70);
    expect(guardedRoutes.reduce((n, r) => n + r.methods.length, 0)).toBeGreaterThan(100);
  });

  test("a NUL in the query string - a value, a key, one of several values - is 400 VALIDATION, whatever the method", async () => {
    test.setTimeout(600_000);
    const wrong: string[] = [];
    let tried = 0;
    for (const route of guardedRoutes) {
      for (const method of route.methods) {
        for (const query of ["q=a%00b", "q%00=1", "tag=ok&tag=x%00"]) {
          const url = `/api/${fill(route.rel, PLACEHOLDER_ID)}?${query}`;
          const res = await call(url, method);
          tried++;
          const details = res.json?.error?.details;
          if (res.status !== 400 || res.json?.error?.code !== "VALIDATION" || details?.[0]?.message !== NUL_MESSAGE)
            wrong.push(`${res.status} ${method} ${url}`);
        }
      }
    }
    expect(tried).toBeGreaterThan(300);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  test("a NUL in the body - one the route reads itself, or through validate() - is 400 VALIDATION, whatever the method", async () => {
    test.setTimeout(600_000);
    const wrong: string[] = [];
    let tried = 0;
    for (const route of guardedRoutes) {
      for (const method of route.methods.filter((m) => m !== "GET")) {
        const url = `/api/${fill(route.rel, PLACEHOLDER_ID)}`;
        for (const body of [{ name: `a${NUL}b` }, { [`x${NUL}`]: 1 }, { list: [{ deep: `${NUL}` }] }]) {
          const res = await api(url, { method, cookie: admin, body });
          tried++;
          const details = res.json?.error?.details;
          if (res.status !== 400 || res.json?.error?.code !== "VALIDATION" || details?.[0]?.message !== NUL_MESSAGE)
            wrong.push(`${res.status} ${method} ${url} ${JSON.stringify(body).slice(0, 40)}`);
        }
      }
    }
    expect(tried).toBeGreaterThan(150);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  test("signed out the answer is the usual 401, not a statement about the address or the body", async () => {
    const res = await api(`/api/v1/announcements?q=a%00b`, { method: "POST", body: { title: `a${NUL}b` } });
    expect(res.status).toBe(401);
  });
});

test.describe("a JSON body", () => {
  const text = `a${NUL}b`;
  // Each body is complete and valid but for the NUL, so the NUL is the only reason to refuse it.
  const bodies: [string, string, string, () => Record<string, unknown>][] = [
    ["a notice's title", "POST", "announcements", () => ({ branchId: home.id, title: text, body: "x" })],
    ["a notice's text", "POST", "announcements", () => ({ branchId: home.id, title: "t", body: text })],
    ["a subject's name", "POST", "academics/subjects", () => ({ branchId: home.id, name: text })],
    ["a subject's code", "POST", "academics/subjects", () => ({ branchId: home.id, name: "Name", code: text })],
    ["a class group's name", "POST", "academics/class-groups", () => ({ branchId: home.id, name: text })],
    ["a branch's name", "POST", "branches", () => ({ name: text })],
    ["the school's name", "PATCH", "settings/school", () => ({ name: text })],
    [
      "a student's first name",
      "POST",
      "students",
      () => ({ branchId: home.id, firstName: text, lastName: "L", gender: "FEMALE", dateOfBirth: "2016-05-10" }),
    ],
    [
      "a template's name",
      "POST",
      "communication/templates",
      () => ({ branchId: home.id, code: "CODE1", name: text, channel: "SMS", bodyTemplate: "b", variables: [] }),
    ],
    ["a material's title", "POST", "lms/materials", () => ({ branchId: home.id, subjectId: PLACEHOLDER_ID, title: text, content: "c" })],
    ["a key of the body", "POST", "academics/subjects", () => ({ branchId: home.id, name: "Name", code: "NUL2", [`x${NUL}`]: 1 })],
    [
      "a value nested in the body",
      "POST",
      "academics/subjects",
      () => ({ branchId: home.id, name: "Name", code: "NUL3", extra: { deep: [text] } }),
    ],
  ];
  for (const [what, method, rest, body] of bodies) {
    test(`a NUL in ${what} is 400 VALIDATION`, async () => {
      const res = await api(`/api/v1/${rest}`, { method, cookie: admin, body: body() });
      expect(res.status, res.text.slice(0, 200)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
      expect(res.json.error.details).toEqual([{ path: "body", message: NUL_MESSAGE }]);
    });
  }

  test("what only looks like a NUL is stored as the text it is: the six characters of an escape, a tab, a line break", async () => {
    const literalEscape = ["\\", "u0000"].join("");
    const title = `Notice ${literalEscape}`;
    const body = "first line\n\tsecond line, indented";
    const made = await api("/api/v1/announcements", { method: "POST", cookie: admin, body: { branchId: home.id, title, body } });
    expect(made.status, made.text.slice(0, 200)).toBe(201);
    const read = await api(`/api/v1/announcements/${made.json.data.id}`, { cookie: admin });
    expect(read.status).toBe(200);
    expect(read.json.data.title).toBe(title);
    expect(read.json.data.body).toBe(body);
  });

  test("a body the route reads itself is still whole after the scan: a notice with a long text, an emoji and an accent is stored as sent", async () => {
    const body = `${"long ".repeat(2000)} Núñez \u{1f600}`;
    const made = await api("/api/v1/announcements", { method: "POST", cookie: admin, body: { branchId: home.id, title: "Long", body } });
    expect(made.status, made.text.slice(0, 200)).toBe(201);
    expect((await api(`/api/v1/announcements/${made.json.data.id}`, { cookie: admin })).json.data.body).toBe(body);
  });

  test("a body that is not JSON, or is empty, is not judged by the scan: whatever the route answers, it is not the NUL refusal", async () => {
    for (const rawBody of ["{nope", "", "undefined"]) {
      const res = await api("/api/v1/announcements", { method: "POST", cookie: admin, rawBody });
      expect(res.json?.error?.details?.[0]?.message, rawBody).not.toBe(NUL_MESSAGE);
    }
  });

  test("a list asked for with ordinary query values still answers", async () => {
    const res = await api(`/api/v1/students?branchId=${home.id}&q=ab`, { cookie: admin });
    expect(res.status).toBe(200);
  });
});

test.describe("the routes that are not behind withAuth", () => {
  test("a public address with a NUL in it is refused by its own check: never a 5xx", async () => {
    for (const rel of ["verify/a%00b", "verify/%00"]) {
      const res = await api(`/api/v1/${rel}`);
      expect(res.status, rel).toBeLessThan(500);
    }
  });

  test("the routes that read their own body answer something other than a 5xx for a NUL in the fields they read", async () => {
    const password = "correct-horse-battery-9";
    const email = `a${NUL}@example.test`;
    const direct: [string, string, Record<string, unknown>][] = [
      ["PATCH", "account/profile", { name: `a${NUL}b` }],
      ["POST", "auth/login", { email, password: "x" }],
      ["POST", "auth/login", { email: "a@example.test", password: `a${NUL}b` }],
      ["POST", "auth/forgot-password", { email }],
      ["POST", "auth/reset-password", { token: `a${NUL}b`, password }],
      ["POST", "auth/change-password", { currentPassword: `a${NUL}b`, newPassword: password }],
      ["POST", "auth/email-change/request", { newEmail: email, password: "x" }],
      ["POST", "auth/email-change/confirm", { token: `a${NUL}b` }],
      ["POST", "auth/mfa/confirm", { code: `a${NUL}b` }],
      ["POST", "auth/mfa/disable", { password: `a${NUL}b` }],
      ["POST", "auth/mfa/recovery-codes", { password: `a${NUL}b` }],
      ["POST", "auth/sessions/revoke", { id: `a${NUL}b` }],
      ["POST", "invitations/accept", { token: `a${NUL}b`, name: "N", password }],
      ["POST", "invitations/accept", { token: "a".repeat(64), name: `a${NUL}b`, password }],
      ["POST", "invitations/preview", { token: `a${NUL}b` }],
      ["POST", "portal/session", { admissionNo: `PS/1${NUL}x`, secret: "0000" }],
      ["POST", "portal/session", { admissionNo: "PS/1", secret: `08012${NUL}345` }],
    ];
    const wrong: string[] = [];
    for (const [method, rel, body] of direct) {
      const res = await api(`/api/v1/${rel}`, { method, cookie: admin, body });
      if (res.status >= 500) wrong.push(`${res.status} ${method} ${rel} ${JSON.stringify(body).slice(0, 80)}`);
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });
});
