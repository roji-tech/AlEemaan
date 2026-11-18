import "../support/env";
import { test, expect } from "@playwright/test";
import { PORTALS_PORT, PORTALS_URL } from "../support/env";
import { DEFAULT_PASSWORD, Role, createUser, db, enableMfa, seedInstance, uniqueEmail } from "../support/db";
import { api, type ApiResponse } from "../support/http";
import { waitForMail } from "../support/outbox";

// The sign-in portals (task 0086), against the one server that has them on: admin., staff., student. and parent. of `localhost`. A portal is named in a request by X-Forwarded-Host (this
// server trusts it, as one behind a proxy does) and the matching Origin. The rule that matters most is that a right password on the wrong portal is answered EXACTLY like a wrong password.
const host = (portal: string) => (portal === "apex" ? `localhost:${PORTALS_PORT}` : `${portal}.localhost:${PORTALS_PORT}`);
const at = (portal: string) => ({ origin: `http://${host(portal)}`, headers: { "x-forwarded-host": host(portal) } });
const LOGIN = "/api/v1/auth/login";
const signIn = (portal: string, email: string, password: string) =>
  api(LOGIN, { baseUrl: PORTALS_URL, method: "POST", body: { email, password }, ...at(portal) });
/// What the caller can see of an answer, to compare two of them: status, body and every header that is not per-request.
const shape = (r: ApiResponse) => ({
  status: r.status,
  body: r.text,
  cookies: r.setCookies,
  cache: r.headers.get("cache-control"),
  type: r.headers.get("content-type"),
});

test.beforeAll(async () => {
  await seedInstance();
});

const ROLES: [string, Role, string[]][] = [
  ["an administrator", Role.ADMIN, ["admin"]],
  ["a teacher", Role.TEACHING_STAFF, ["staff"]],
  ["non-teaching staff", Role.NON_TEACHING_STAFF, ["staff"]],
  ["a student", Role.STUDENT, ["student"]],
  ["a parent", Role.PARENT, ["parent"]],
];

test.describe("the landing pages are the school's own host's", () => {
  const PATHS = [
    "/",
    "/about",
    "/admissions",
    "/anthem",
    "/contact",
    "/oldstudents",
    "/our-academics",
    "/subjects",
    "/vacancy",
    "/product",
    "/ar",
  ];

  test("on every portal each landing path is a temporary redirect to the same path on the school's host, query kept", async () => {
    for (const portal of ["admin", "staff", "student", "parent"]) {
      for (const path of PATHS) {
        const res = await api(`${path}?ref=x`, { baseUrl: PORTALS_URL, ...at(portal) });
        expect(res.status, `${portal}${path}`).toBe(307);
        // Resolved against the request's own address: Next writes a redirect to the very origin the request arrived on as a relative path, which a browser resolves to the same place.
        expect(new URL(res.headers.get("location")!, PORTALS_URL).href, `${portal}${path}`).toBe(
          `http://localhost:${PORTALS_PORT}${path}?ref=x`,
        );
      }
    }
  });

  test("on the school's host (and www) the same paths are served, not redirected", async () => {
    for (const portal of ["apex"]) {
      for (const path of ["/about", "/contact", "/product"]) {
        const res = await api(path, { baseUrl: PORTALS_URL, ...at(portal) });
        expect(res.status, path).toBe(200);
      }
    }
    const www = await api("/about", {
      baseUrl: PORTALS_URL,
      origin: `http://www.localhost:${PORTALS_PORT}`,
      headers: { "x-forwarded-host": `www.localhost:${PORTALS_PORT}` },
    });
    expect(www.status).toBe(200);
  });

  test("the pages of the application itself are not redirected on a portal", async () => {
    for (const path of ["/login", "/forgot-password"]) {
      const res = await api(path, { baseUrl: PORTALS_URL, ...at("admin") });
      expect(res.status, path).toBe(200);
    }
  });
});

test.describe("who may sign in where", () => {
  for (const [label, role, portals] of ROLES) {
    test(`${label} signs in on ${portals.join(" and ")}, and on no other portal and not on the school's host; a refusal creates no session`, async () => {
      const user = await createUser({ role });
      for (const portal of ["admin", "staff", "student", "parent", "apex"]) {
        const res = await signIn(portal, user.email, DEFAULT_PASSWORD);
        if (portals.includes(portal)) {
          expect(res.status, `${label} on ${portal}`).toBe(200);
          expect(res.setCookies.length, `cookie on ${portal}`).toBeGreaterThan(0);
        } else {
          expect(res.status, `${label} on ${portal}`).toBe(401);
          expect(res.json.error.code).toBe("INVALID_CREDENTIALS");
          expect(res.setCookies, `no cookie on ${portal}`).toEqual([]);
        }
      }
      expect(await db.session.count({ where: { userId: user.id } })).toBe(portals.length);
    });
  }

  test("a superadmin who is only a teacher uses the admin portal; a person with two roles uses both of theirs", async () => {
    const boss = await createUser({ role: Role.TEACHING_STAFF, superAdmin: true });
    expect((await signIn("admin", boss.email, DEFAULT_PASSWORD)).status).toBe(200);
    expect((await signIn("staff", boss.email, DEFAULT_PASSWORD)).status).toBe(200);
    const both = await createUser({ role: Role.TEACHING_STAFF });
    // A second role in ANOTHER branch (a person has one membership per branch).
    const branch = await db.branch.create({ data: { name: `Second ${Date.now().toString(36)}` } });
    await db.membership.create({ data: { userId: both.id, branchId: branch.id, role: Role.PARENT } });
    expect([
      (await signIn("staff", both.email, DEFAULT_PASSWORD)).status,
      (await signIn("parent", both.email, DEFAULT_PASSWORD)).status,
    ]).toEqual([200, 200]);
    expect((await signIn("student", both.email, DEFAULT_PASSWORD)).status).toBe(401);
  });

  test("a deactivated membership admits nobody to its portal", async () => {
    const user = await createUser({ role: Role.PARENT });
    await db.membership.updateMany({ where: { userId: user.id }, data: { deactivatedAt: new Date() } });
    expect((await signIn("parent", user.email, DEFAULT_PASSWORD)).status).toBe(401);
  });
});

test.describe("a refusal gives nothing away", () => {
  test("a right password on the wrong portal is answered byte for byte like a wrong password, and like an account that does not exist", async () => {
    const parent = await createUser({ role: Role.PARENT });
    const wrongPortal = await signIn("admin", parent.email, DEFAULT_PASSWORD); // the password is right
    const wrongPassword = await signIn("admin", parent.email, "not-the-password-1");
    const noAccount = await signIn("admin", uniqueEmail("ghost"), DEFAULT_PASSWORD);
    expect(wrongPortal.status).toBe(401);
    expect(shape(wrongPortal)).toEqual(shape(wrongPassword));
    expect(shape(wrongPortal)).toEqual(shape(noAccount));
    expect(wrongPortal.text).not.toMatch(/portal|parent|staff|student|admin\./i);
  });

  test("an account with two-step verification is not asked for its code on the wrong portal", async () => {
    const parent = await createUser({ role: Role.PARENT });
    await enableMfa(parent.id);
    const wrong = await signIn("admin", parent.email, DEFAULT_PASSWORD);
    expect(wrong.status).toBe(401);
    expect(wrong.text).not.toMatch(/mfa/i);
    expect((await signIn("parent", parent.email, DEFAULT_PASSWORD)).json.data.mfaRequired).toBe(true);
  });

  test("wrong-portal attempts use up the same limit as wrong passwords", async () => {
    const parent = await createUser({ role: Role.PARENT });
    const ip = `10.55.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    const attempt = () =>
      api(LOGIN, { baseUrl: PORTALS_URL, method: "POST", body: { email: parent.email, password: DEFAULT_PASSWORD }, ip, ...at("admin") });
    const answers = [];
    for (let i = 0; i < 6; i += 1) answers.push((await attempt()).status);
    expect(answers).toEqual([401, 401, 401, 401, 401, 429]);
    // the person's own portal is limited by the same bucket, as it would be after five wrong passwords
    const own = await api(LOGIN, {
      baseUrl: PORTALS_URL,
      method: "POST",
      body: { email: parent.email, password: DEFAULT_PASSWORD },
      ip,
      ...at("parent"),
    });
    expect(own.status).toBe(429);
  });
});

test.describe("e-mailed links open on the person's own portal", () => {
  test("a password reset for a parent, a teacher and an administrator", async () => {
    for (const [role, portal] of [
      [Role.PARENT, "parent"],
      [Role.TEACHING_STAFF, "staff"],
      [Role.ADMIN, "admin"],
    ] as const) {
      const user = await createUser({ role });
      const res = await api("/api/v1/auth/forgot-password", {
        baseUrl: PORTALS_URL,
        method: "POST",
        body: { email: user.email },
        ...at(portal),
      });
      expect(res.status).toBe(200);
      const [mail] = await waitForMail(user.email);
      expect(mail.text).toContain(`http://${portal}.localhost:${PORTALS_PORT}/reset-password#token=`);
    }
  });
});
