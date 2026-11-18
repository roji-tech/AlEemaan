import "../support/env";
import { test, expect } from "@playwright/test";
import { TEST_DEVELOPER_EMAIL } from "../support/env";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { mailTo } from "../support/outbox";

// Problem reports from Quick Tools (task 0099), over real HTTP: any signed-in person may send one; it is recorded with who sent it as the SERVER knows them, mailed to DEVELOPER_EMAIL after the
// response, never trusts the body about identity, and is limited to 5 per person in five minutes. Only a superadmin reads the list.

const REPORTS = "/api/v1/reports";
test.beforeAll(async () => {
  await seedInstance();
});

const asRole = async (role: Role, superAdmin = false) => {
  const user = await createUser({ role, superAdmin });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const body = (more: Record<string, unknown> = {}) => ({
  category: "PROBLEM",
  message: `The Save button does nothing on the fees page (${Math.random().toString(36).slice(2)}).`,
  pagePath: "/finance",
  viewport: "1280x800",
  ...more,
});
const send = (cookie: string | undefined, b: unknown = body()) => api(REPORTS, { method: "POST", cookie, body: b });
/// All reports go to the one developer address, so the mail is found by the reference inside it.
async function mailFor(id: string) {
  for (let i = 0; i < 100; i++) {
    const found = (await mailTo(TEST_DEVELOPER_EMAIL)).find((m) => m.text.includes(`Reference: ${id}`));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no mail for report ${id}`);
}

test.describe("sending a report", () => {
  test("signed out is 401; every signed-in role may send, and gets 201 with a reference", async () => {
    expect((await send(undefined)).status).toBe(401);
    for (const role of [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT]) {
      const who = await asRole(role, false);
      const res = await send(who.cookie);
      expect([role, res.status, res.json.error]).toEqual([role, 201, null]);
      expect(res.json.data.report.id).toEqual(expect.any(String));
    }
  });

  test("it is recorded with who sent it as the server knows them, and mailed to the developer with the same facts", async () => {
    const who = await asRole(Role.TEACHING_STAFF);
    const res = await send(
      who.cookie,
      body({ category: "CONFUSING", message: "I could not find where to add a fee.\nIt took me ten minutes." }),
    );
    const id = res.json.data.report.id;
    const row = await db.problemReport.findUniqueOrThrow({ where: { id } });
    expect([
      row.userId,
      row.reporterName,
      row.reporterEmail,
      row.reporterRoles,
      row.branches,
      row.category,
      row.pagePath,
      row.viewport,
    ]).toEqual([who.user.id, who.user.name, who.user.email, "Teaching staff", "Secondary (English)", "CONFUSING", "/finance", "1280x800"]);
    expect(row.message).toBe("I could not find where to add a fee.\nIt took me ten minutes.");
    expect(row.userAgent).toEqual(expect.any(String));

    const mail = await mailFor(id);
    expect(mail.subject).toMatch(/^\[Report\] Something is confusing: I could not find where to add a fee\./);
    expect(mail.subject).not.toMatch(/[\r\n]/);
    for (const line of [
      `From: ${who.user.name} <${who.user.email}>`,
      "Roles: Teaching staff",
      "Branches: Secondary (English)",
      "Page: /finance",
      "Screen: 1280x800",
    ])
      expect(mail.text, line).toContain(line);
    // the mail went, and the record says so
    await expect.poll(async () => (await db.problemReport.findUniqueOrThrow({ where: { id } })).emailed).toBe(true);
  });

  test("who it is from is never taken from the body: an unknown field is a 400 and nothing is recorded", async () => {
    const who = await asRole(Role.PARENT);
    const before = await db.problemReport.count({ where: { userId: who.user.id } });
    for (const extra of [{ userId: "someone-else" }, { reporterEmail: "boss@school.example" }, { branches: "All" }]) {
      const res = await send(who.cookie, body(extra));
      expect([res.status, res.json.error.code]).toEqual([400, "VALIDATION"]);
    }
    expect(await db.problemReport.count({ where: { userId: who.user.id } })).toBe(before);
  });

  test("a message that is too short or too long, an unknown kind, or a bad screen size is a 400 with the reason", async () => {
    const who = await asRole(Role.STUDENT);
    const short = await send(who.cookie, body({ message: "too short" }));
    expect([short.status, short.json.error.message]).toEqual([400, "Tell us a little more: at least 10 characters."]);
    expect((await send(who.cookie, body({ message: "x".repeat(2001) }))).status).toBe(400);
    expect((await send(who.cookie, body({ category: "BUG" }))).status).toBe(400);
    expect((await send(who.cookie, body({ viewport: "wide" }))).status).toBe(400);
    expect((await send(who.cookie, { category: "IDEA" })).status).toBe(400);
  });

  test("the page is stored as a path only: a query (it can hold a token) and a fragment are dropped, and a non-path becomes /", async () => {
    const who = await asRole(Role.ADMIN);
    const a = await send(who.cookie, body({ pagePath: "/reset?token=secret-value#x" }));
    const b = await send(who.cookie, body({ pagePath: "javascript:alert(1)" }));
    expect((await db.problemReport.findUniqueOrThrow({ where: { id: a.json.data.report.id } })).pagePath).toBe("/reset");
    expect((await db.problemReport.findUniqueOrThrow({ where: { id: b.json.data.report.id } })).pagePath).toBe("/");
    expect(JSON.stringify(await db.problemReport.findUniqueOrThrow({ where: { id: a.json.data.report.id } }))).not.toContain(
      "secret-value",
    );
  });

  test("at most five in five minutes per person: the sixth is a 429, someone else is not affected, and nothing is recorded for it", async () => {
    const who = await asRole(Role.PARENT);
    const other = await asRole(Role.PARENT);
    for (let i = 0; i < 5; i++) expect((await send(who.cookie)).status).toBe(201);
    const sixth = await send(who.cookie);
    expect([sixth.status, sixth.json.error.code]).toEqual([429, "RATE_LIMITED"]);
    expect(await db.problemReport.count({ where: { userId: who.user.id } })).toBe(5);
    expect((await send(other.cookie)).status).toBe(201);
  });
});

test.describe("reading them", () => {
  test("signed out 401; a teacher and an administrator who is not a superadmin are refused; a superadmin sees the newest first", async () => {
    const author = await asRole(Role.TEACHING_STAFF);
    const first = await send(author.cookie, body({ message: "First report of the reading test, long enough." }));
    const second = await send(author.cookie, body({ message: "Second report of the reading test, long enough." }));
    expect((await api(REPORTS)).status).toBe(401);
    expect((await api(REPORTS, { cookie: author.cookie })).status).toBe(403);
    const branchAdmin = await asRole(Role.ADMIN, false);
    expect((await api(REPORTS, { cookie: branchAdmin.cookie })).status).toBe(403);
    const boss = await asRole(Role.ADMIN, true);
    const list = await api(REPORTS, { cookie: boss.cookie });
    expect(list.status).toBe(200);
    const ids = list.json.data.reports.map((r: { id: string }) => r.id);
    expect(ids.indexOf(second.json.data.report.id)).toBeLessThan(ids.indexOf(first.json.data.report.id));
    expect(ids.length).toBeLessThanOrEqual(50);
  });
});
