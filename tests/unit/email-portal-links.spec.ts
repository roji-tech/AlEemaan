import { expect, test } from "@playwright/test";
import { Role } from "@prisma/client";
import {
  emailChangeConfirmEmail,
  emailChangeRequestedNotice,
  emailChangeTakenNotice,
  invitationEmail,
  passwordChangedEmail,
  resetEmail,
} from "@/lib/email/messages";
import { PORTALS, portalAdmits, portalFor, readPortalConfig, type Portal } from "@/lib/portals";

// Task 0086: no e-mail may carry a subdomain that would refuse its reader (a parent's reset link on admin., say). Every builder that makes a link is run for every kind of recipient
// with the portals ON, and each link's host must be the portal that admits that person; a builder not told the portal falls back to the school's own host, never to a portal.
const ENV = ["APP_URL", "ADMIN_SUBDOMAIN", "STAFF_SUBDOMAIN", "STUDENT_SUBDOMAIN", "PARENT_SUBDOMAIN"] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};
test.beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  process.env.APP_URL = "https://example.school";
  Object.assign(process.env, {
    ADMIN_SUBDOMAIN: "admin",
    STAFF_SUBDOMAIN: "staff",
    STUDENT_SUBDOMAIN: "student",
    PARENT_SUBDOMAIN: "parent",
  });
});
test.afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const hostsIn = (text: string) => [...text.matchAll(/https?:\/\/([^/\s#?)]+)/g)].map((m) => m[1]);
const labels = readPortalConfig({
  ADMIN_SUBDOMAIN: "admin",
  STAFF_SUBDOMAIN: "staff",
  STUDENT_SUBDOMAIN: "student",
  PARENT_SUBDOMAIN: "parent",
}).config;
const PEOPLE: [string, Role[], boolean][] = [
  ["an administrator", [Role.ADMIN], false],
  ["a superadmin who teaches", [Role.TEACHING_STAFF], true],
  ["a teacher", [Role.TEACHING_STAFF], false],
  ["non-teaching staff", [Role.NON_TEACHING_STAFF], false],
  ["a student", [Role.STUDENT], false],
  ["a parent", [Role.PARENT], false],
  ["a teacher who is also a parent", [Role.TEACHING_STAFF, Role.PARENT], false],
];

/// Every e-mail that has a link, built for one person on one portal.
const mails = (portal: Portal | null) =>
  [
    ["reset", resetEmail("a@x.test", "tok", portal)],
    ["invitation", invitationEmail({ to: "a@x.test", token: "tok", branchName: "B", roleLabel: "R", inviterName: null, days: 7, portal })],
    ["password changed", passwordChangedEmail("a@x.test", portal)],
    ["change confirm", emailChangeConfirmEmail("a@x.test", "tok", portal)],
    ["change requested", emailChangeRequestedNotice("a@x.test", "b@x.test", portal)],
    ["address taken", emailChangeTakenNotice("a@x.test", portal)],
  ] as const;

for (const [label, roles, isSuperAdmin] of PEOPLE) {
  test(`${label}: every link in every e-mail is on the portal that admits them`, () => {
    const person = { roles, isSuperAdmin };
    const portal = portalFor(person);
    expect(portal, "the person has a portal").not.toBeNull();
    for (const [name, mail] of mails(portal)) {
      const hosts = hostsIn(mail.text);
      expect(hosts.length, `${name} has a link`).toBeGreaterThan(0);
      for (const host of hosts) {
        const own = PORTALS.find((p) => host === `${labels[p]}.example.school`);
        expect(own, `${name} to ${label}: ${host} is a portal`).toBeDefined();
        expect(portalAdmits(own!, person), `${name} to ${label}: ${host} admits them`).toBe(true);
      }
    }
  });
}

test("a builder that is not told the portal links to the school's own host, never to a portal", () => {
  for (const [name, mail] of mails(null)) {
    for (const host of hostsIn(mail.text)) expect(host, name).toBe("example.school");
  }
});

test("with the portals off every link is on the school's own address, as before", () => {
  for (const key of ["ADMIN_SUBDOMAIN", "STAFF_SUBDOMAIN", "STUDENT_SUBDOMAIN", "PARENT_SUBDOMAIN"]) delete process.env[key];
  for (const portal of [null, "admin", "parent"] as const) {
    for (const [name, mail] of mails(portal)) {
      for (const host of hostsIn(mail.text)) expect(host, `${name} (${portal})`).toBe("example.school");
    }
  }
});

test("on staging the links follow staging's own address: portals nest under it and never reach the production domain", () => {
  process.env.APP_URL = "https://staging.example.school";
  for (const [name, mail] of mails("staff")) {
    for (const host of hostsIn(mail.text)) expect(host, name).toBe("staff.staging.example.school");
  }
});
