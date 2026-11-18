import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Role } from "@prisma/client";
import {
  DEFAULT_LABELS,
  PORTAL_COPY,
  PORTALS,
  apexOrigin,
  apexServes,
  classifyHost,
  isLandingPath,
  portalAdmits,
  portalBaseFromAppUrl,
  portalFor,
  portalOrigin,
  portalsOn,
  readPortalConfig,
} from "@/lib/portals";

// The pure rules of the sign-in portals (task 0086): which subdomain is which portal, where the landing pages live, and who each portal admits. The server rules that use them (the
// redirect, the sign-in refusal, the e-mailed links) have their own tests.
const ON = { ADMIN_SUBDOMAIN: "admin", STAFF_SUBDOMAIN: "staff", STUDENT_SUBDOMAIN: "student", PARENT_SUBDOMAIN: "parent" };
const config = readPortalConfig(ON).config;

test("nothing set: the portals are ON, with the default labels; every host is classified", () => {
  const { config: none, problems } = readPortalConfig({});
  expect(portalsOn(none)).toBe(true);
  expect(none).toEqual({ admin: "admin", staff: "staff", student: "student", parent: "parent" });
  expect(none).toEqual(DEFAULT_LABELS);
  expect(problems).toEqual([]);
  expect(classifyHost("admin.example.school", none)).toMatchObject({ kind: "portal", portal: "admin" });
  expect(classifyHost("example.school", none)).toEqual({ kind: "apex", root: "example.school" });
  // An empty variable is "not set", not an empty label.
  expect(readPortalConfig({ ADMIN_SUBDOMAIN: "", PORTALS_ENABLED: "" }).config).toEqual(DEFAULT_LABELS);
});

test("PORTALS_ENABLED false / 0 / off / no (any capitals, spaces around) switches the portals off: no portal, every host 'off', nothing said", () => {
  for (const word of ["false", "FALSE", " 0 ", "off", "Off", "no"]) {
    const { config: c, problems } = readPortalConfig({ PORTALS_ENABLED: word, ...ON });
    expect(portalsOn(c), word).toBe(false);
    expect(problems, word).toEqual([]);
    expect(classifyHost("admin.example.school", c), word).toEqual({ kind: "off" });
    expect(classifyHost("example.school", c), word).toEqual({ kind: "off" });
  }
});

test("PORTALS_ENABLED true / 1 / on / yes keeps them on; anything else keeps them on too, and is said once (a typo must not turn the protection off)", () => {
  for (const word of ["true", "1", "on", "YES"]) {
    const { config: c, problems } = readPortalConfig({ PORTALS_ENABLED: word });
    expect(portalsOn(c), word).toBe(true);
    expect(problems, word).toEqual([]);
  }
  for (const word of ["flase", "disabled", "2"]) {
    const { config: c, problems } = readPortalConfig({ PORTALS_ENABLED: word });
    expect(portalsOn(c), word).toBe(true);
    expect(problems, word).toHaveLength(1);
    expect(problems[0], word).toContain("PORTALS_ENABLED");
  }
});

test("a label is trimmed and lower-cased; one that is not a single DNS label, or is repeated, is left out and said", () => {
  const { config: c, problems } = readPortalConfig({
    ADMIN_SUBDOMAIN: "  Admin ",
    STAFF_SUBDOMAIN: "staff.example",
    STUDENT_SUBDOMAIN: "-bad",
    PARENT_SUBDOMAIN: "admin",
  });
  expect(c).toEqual({ admin: "admin" });
  expect(problems).toHaveLength(3);
  expect(problems.join(" ")).toContain("STAFF_SUBDOMAIN");
  expect(problems.join(" ")).toContain(
    "PARENT_SUBDOMAIN and ADMIN_SUBDOMAIN".replace("PARENT_SUBDOMAIN and ADMIN_SUBDOMAIN", "PARENT_SUBDOMAIN"),
  );
  expect(readPortalConfig({ ADMIN_SUBDOMAIN: "a".repeat(64) }).problems).toHaveLength(1);
  expect(readPortalConfig({ ADMIN_SUBDOMAIN: "a".repeat(63) }).problems).toEqual([]);
});

test("the portal is the first label; the school's domain is the rest, whatever it is; the port is not part of the host", () => {
  expect(classifyHost("admin.example.school", config)).toEqual({ kind: "portal", portal: "admin", root: "example.school" });
  expect(classifyHost("Parent.Example.School:3200", config)).toEqual({ kind: "portal", portal: "parent", root: "example.school" });
  expect(classifyHost("staff.other-domain.org", config)).toEqual({ kind: "portal", portal: "staff", root: "other-domain.org" });
  expect(classifyHost("student.localhost:3200", config)).toEqual({ kind: "portal", portal: "student", root: "localhost" });
});

test("everything else is the apex: the bare domain, www, a preview URL, localhost, an address, a longer host that only contains a portal word", () => {
  expect(classifyHost("example.school", config)).toEqual({ kind: "apex", root: "example.school" });
  expect(classifyHost("www.example.school", config)).toEqual({ kind: "apex", root: "example.school" });
  expect(classifyHost("al-eemaan-git-x.vercel.app", config)).toEqual({ kind: "apex", root: "al-eemaan-git-x.vercel.app" });
  expect(classifyHost("localhost:3200", config)).toEqual({ kind: "apex", root: "localhost" });
  expect(classifyHost("127.0.0.1:3200", config)).toEqual({ kind: "apex", root: "127.0.0.1" });
  expect(classifyHost("[::1]:3200", config)).toEqual({ kind: "apex", root: "[::1]" });
  expect(classifyHost("admin", config)).toEqual({ kind: "apex", root: "admin" }); // a bare word is not a subdomain of anything
  expect(classifyHost("notadmin.example.school", config)).toEqual({ kind: "apex", root: "notadmin.example.school" });
  expect(classifyHost("x.admin.example.school", config)).toEqual({ kind: "apex", root: "x.admin.example.school" }); // only the FIRST label names a portal
  expect(classifyHost("", config)).toEqual({ kind: "apex", root: "" });
});

test("a portal whose label is not usable is not recognised (its host is the apex)", () => {
  const some = readPortalConfig({ STAFF_SUBDOMAIN: "not.a.label" }).config;
  expect(classifyHost("admin.example.school", some)).toMatchObject({ kind: "portal", portal: "admin" });
  expect(classifyHost("staff.example.school", some)).toEqual({ kind: "apex", root: "staff.example.school" });
});

test("a portal can be renamed by its variable alone", () => {
  const renamed = readPortalConfig({ ...ON, STAFF_SUBDOMAIN: "teachers" }).config;
  expect(classifyHost("teachers.example.school", renamed)).toMatchObject({ kind: "portal", portal: "staff" });
  expect(classifyHost("staff.example.school", renamed)).toEqual({ kind: "apex", root: "staff.example.school" });
});

test("the landing pages are on the school's domain, with the request's scheme and port; a portal's address is built from the same domain", () => {
  const portal = classifyHost("parent.example.school:8443", config);
  if (portal.kind === "off") throw new Error("expected a portal");
  expect(apexOrigin(portal, "parent.example.school:8443", "https:")).toBe("https://example.school:8443");
  expect(portalOrigin("staff", portal, config, "parent.example.school:8443", "https:")).toBe("https://staff.example.school:8443");
  const apex = classifyHost("www.example.school", config);
  expect(portalOrigin("admin", apex, config, "www.example.school", "https:")).toBe("https://admin.example.school");
  expect(portalOrigin("admin", { kind: "off" }, config, "x", "https:")).toBeNull();
  expect(portalOrigin("admin", apex, readPortalConfig({ ADMIN_SUBDOMAIN: "-bad" }).config, "www.example.school", "https:")).toBeNull();
});

test("the landing and marketing paths are the school's public website, with or without a trailing slash; the app's paths are not", () => {
  for (const path of [
    "/",
    "/ar",
    "/about",
    "/admissions",
    "/anthem",
    "/contact",
    "/oldstudents",
    "/our-academics",
    "/subjects",
    "/vacancy",
    "/product",
    "/select-role",
    "/about/",
  ]) {
    expect(isLandingPath(path), path).toBe(true);
  }
  for (const path of [
    "/login",
    "/dashboard",
    "/forgot-password",
    "/portal",
    "/video-guide",
    "/api/v1/auth/login",
    "/about/us",
    "/aboutx",
    "/setup",
  ]) {
    expect(isLandingPath(path), path).toBe(false);
  }
});

test("who each portal admits: the right role only, a superadmin on the admin portal only, several roles open several portals", () => {
  const p = (roles: Role[], isSuperAdmin = false) => ({ roles, isSuperAdmin });
  expect(portalAdmits("admin", p([Role.ADMIN]))).toBe(true);
  expect(portalAdmits("admin", p([Role.TEACHING_STAFF], true))).toBe(true); // a superadmin
  expect(portalAdmits("admin", p([Role.TEACHING_STAFF]))).toBe(false);
  expect(portalAdmits("staff", p([Role.TEACHING_STAFF]))).toBe(true);
  expect(portalAdmits("staff", p([Role.NON_TEACHING_STAFF]))).toBe(true);
  expect(portalAdmits("staff", p([Role.ADMIN], true))).toBe(false); // an administrator uses the admin portal
  expect(portalAdmits("student", p([Role.STUDENT]))).toBe(true);
  expect(portalAdmits("student", p([Role.PARENT]))).toBe(false);
  expect(portalAdmits("parent", p([Role.PARENT]))).toBe(true);
  expect(portalAdmits("parent", p([Role.STUDENT]))).toBe(false);
  expect(portalAdmits("parent", p([]))).toBe(false);
  const both = p([Role.TEACHING_STAFF, Role.PARENT]);
  expect([portalAdmits("staff", both), portalAdmits("parent", both), portalAdmits("student", both), portalAdmits("admin", both)]).toEqual([
    true,
    true,
    false,
    false,
  ]);
});

test("an e-mailed link goes to the first portal that admits the person, administrators first", () => {
  expect(portalFor({ roles: [Role.PARENT], isSuperAdmin: false })).toBe("parent");
  expect(portalFor({ roles: [Role.TEACHING_STAFF, Role.ADMIN], isSuperAdmin: false })).toBe("admin");
  expect(portalFor({ roles: [Role.STUDENT, Role.PARENT], isSuperAdmin: false })).toBe("student");
  expect(portalFor({ roles: [], isSuperAdmin: false })).toBeNull();
});

test("every portal has its own heading and line, and the headings name the role", () => {
  expect(new Set(PORTALS.map((x) => PORTAL_COPY[x].title)).size).toBe(4);
  expect(PORTAL_COPY.admin.title).toMatch(/Administrator/);
  expect(PORTAL_COPY.staff.title).toMatch(/Staff/);
  expect(PORTAL_COPY.student.title).toMatch(/Student/);
  expect(PORTAL_COPY.parent.title).toMatch(/Parent/);
});

test("an e-mailed link goes to the portal's own address built from APP_URL: same scheme and port, www dropped, nothing when the portal is off or the address is not one", () => {
  expect(portalBaseFromAppUrl("parent", "https://example.school", config)).toBe("https://parent.example.school");
  expect(portalBaseFromAppUrl("admin", "https://www.example.school/", config)).toBe("https://admin.example.school");
  expect(portalBaseFromAppUrl("staff", "https://staging.example.school", config)).toBe("https://staff.staging.example.school");
  expect(portalBaseFromAppUrl("student", "http://localhost:3200", config)).toBe("http://student.localhost:3200");
  expect(portalBaseFromAppUrl("admin", "not an address", config)).toBeNull();
  expect(portalBaseFromAppUrl("parent", "https://example.school", readPortalConfig({ PARENT_SUBDOMAIN: "-bad" }).config)).toBeNull();
  expect(portalBaseFromAppUrl("parent", "https://example.school", {})).toBeNull();
});

test("with the portals on, the school's own host serves the landing pages, the sign-in page, the open pages and any file; the sign-in form and the application are the portals'", () => {
  for (const p of [
    "/",
    "/ar",
    "/about",
    "/product",
    "/select-role",
    "/select-role/",
    "/portal",
    "/portal/",
    "/verify/abc",
    "/q/abc",
    "/offline",
    "/icon",
    "/apple-icon",
  ])
    expect(apexServes(p), p).toBe(true);
  for (const p of ["/setup", "/forgot-password", "/reset-password", "/accept-invite", "/confirm-email"])
    expect(apexServes(p), p).toBe(true);
  for (const p of ["/robots.txt", "/manifest.webmanifest", "/logo.png", "/school-site/hero.jpg"]) expect(apexServes(p), p).toBe(true);
  for (const p of [
    "/login",
    "/login/",
    "/dashboard",
    "/students",
    "/users",
    "/results/term",
    "/video-guide",
    "/account",
    "/settings/profile",
  ])
    expect(apexServes(p), p).toBe(false);
  expect(apexServes("/portalx")).toBe(false); // a prefix is not a path
  expect(apexServes("/qr")).toBe(false);
});

test("every top-level route of the app is decided: open on the school's own host, or the portals' (a new page cannot be forgotten)", () => {
  const app = path.join(process.cwd(), "src", "app");
  const dirs = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  // The route groups hold the website (served: landing pages) and the application (refused); the rest are plain top-level routes.
  const top = dirs(app).filter((d) => !d.name.startsWith("(") && d.name !== "api" && d.name !== "ar");
  const OPEN = [
    "accept-invite",
    "apple-icon",
    "confirm-email",
    "forgot-password",
    "icon",
    "offline",
    "portal",
    "q",
    "reset-password",
    "setup",
    "verify",
  ];
  const REFUSED = ["login", "video-guide"]; // the sign-in form; a superadmin's page in the application
  for (const d of top)
    expect(
      OPEN.includes(d.name) || REFUSED.includes(d.name),
      `src/app/${d.name} is neither open nor refused on the school's own host`,
    ).toBe(true);
  for (const name of OPEN) expect(apexServes(`/${name}`), name).toBe(true);
  for (const name of REFUSED) expect(apexServes(`/${name}`), name).toBe(false);
  // Every page of the application group needs the portals.
  for (const d of dirs(path.join(app, "(app)"))) expect(apexServes(`/${d.name}`), `/${d.name}`).toBe(false);
  // And every page of the website group is a landing page.
  for (const d of dirs(path.join(app, "(marketing)", "(site)"))) expect(isLandingPath(`/${d.name}`), `/${d.name}`).toBe(true);
  expect(isLandingPath("/product")).toBe(true); // the product page is in the other website group, (marketing)/product
});
