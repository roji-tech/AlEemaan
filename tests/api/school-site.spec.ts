import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { SCHOOL_SITE_PAGES } from "@/lib/school-site/paths";

// The school's own website over real HTTP (task 0080): nine pages written in React, all under the application's own strict policy (the contact page alone may frame the map), none setting a cookie. `/` sends a
// signed-in person is no longer sent to the dashboard (removed 2026-11-18); every page is open to everyone. The application's own `/portal` and `/academics` are untouched, and the old result portal is not served.

test.beforeAll(async () => {
  await seedInstance();
});

const h1s = (html: string) => [...html.matchAll(/<h1[\s>]/g)].length;

test("every page answers 200 as HTML with one h1, the strict policy and no cookie, and only /contact may frame the map", async () => {
  for (const route of SCHOOL_SITE_PAGES) {
    const res = await api(route);
    expect(res.status, route).toBe(200);
    expect(res.headers.get("content-type"), route).toMatch(/text\/html/);
    expect(h1s(res.text), route).toBe(1);
    expect(res.setCookies, route).toEqual([]);
    const policy = res.headers.get("content-security-policy") ?? "";
    expect(policy, route).toContain("'strict-dynamic'");
    for (const loose of ["unsafe-inline", "gstatic", "cdnjs", "script-src-attr"]) expect(policy, `${route} ${loose}`).not.toContain(loose);
    expect(policy.includes("frame-src"), route).toBe(route === "/contact");
    if (route === "/contact") expect(policy).toContain("frame-src 'self' https://maps.google.com https://www.google.com");
  }
});

test("the home page is the school's own: its headline, a Sign in link to /login and the Portal link to /portal; the product page is /product", async () => {
  const home = await api("/");
  expect(home.text).toContain("AL-EEMAN SCHOOL OF SCIENCE &amp; ARABIC STUDIES");
  expect(home.text).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in<\/a>/);
  expect(home.text).toMatch(/<a[^>]*href="\/portal"[^>]*>Portal<\/a>/);
  const product = await api("/product");
  expect(product.status).toBe(200);
  expect(product.text).not.toContain("AL-EEMAN SCHOOL OF SCIENCE");
});

test("the application is untouched: /academics is the application's page (sign-in first), /portal is its portal, /login keeps its policy, and the old result portal is gone", async () => {
  const academics = await api("/academics");
  expect(academics.status).toBeGreaterThanOrEqual(300);
  expect(academics.status).toBeLessThan(400);
  expect(academics.headers.get("location") ?? "").toContain("/login");
  expect((await api("/portal")).status).toBe(200);
  expect((await api("/login")).headers.get("content-security-policy") ?? "").toContain("'strict-dynamic'");
  expect((await api("/result-portal")).status).toBe(404);
  expect((await api("/result-portal/primary")).status).toBe(404);
});

test("the pictures and recordings are served from /school-site, and the old stylesheets and scripts are not", async () => {
  for (const [file, type] of [
    ["/school-site/aleeman-logo.png", /image\/png/],
    ["/school-site/aleeman-building.png", /image\/png/],
    ["/school-site/anthem.mp3", /audio/],
    ["/school-site/anthem2.mp3", /audio/],
  ] as const) {
    const res = await api(file);
    expect(res.status, file).toBe(200);
    expect(res.headers.get("content-type"), file).toMatch(type);
  }
  expect((await api("/school-site/js/main.js")).status).toBe(404);
  expect((await api("/school-site/css/style.css")).status).toBe(404);
});

test("a signed-in person at / and at /about sees the school's website: no redirect to the dashboard", async () => {
  const admin = await createUser({ role: Role.ADMIN, name: "School Site Admin" });
  const login = await loginAs(admin);
  const cookie = cookieHeader(login.token!);
  const home = await api("/", { cookie });
  expect(home.status).toBe(200);
  expect(home.headers.get("location")).toBeNull();
  expect((await api("/about", { cookie })).status).toBe(200);
});

test("the pictures the old site named and never had are not drawn: no page names a file under /school-site that is not there", async () => {
  for (const route of SCHOOL_SITE_PAGES) {
    const { text } = await api(route);
    for (const m of text.matchAll(/(?:src|href)="(\/school-site\/[^"]+)"/g)) expect((await api(m[1])).status, `${route} ${m[1]}`).toBe(200);
  }
});
