import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi, signOut } from "./helpers";

// Security, as a browser sees it (Slice UI1). The API specs already cover headers, CSRF and the guards one request at a time; these check what only a real browser
// shows: who is shown which page, whether another branch's data can be reached by changing a URL, whether text typed by one person can run as code in another's
// page, whether the CSP really stops an injected script, whether a signed-out session is dead, and whether the page can be framed.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
async function noScriptRan(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
}

test("a teacher is kept out of every administrator page and API, and sees nothing of theirs", async ({ page }) => {
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false, name: "Tola Teacher" });
  await signInThroughUi(page, teacher);
  for (const path of ["/approvals", "/settings", "/branches", "/finance", "/users", "/communication"]) {
    await page.goto(path);
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    const sentAway = !new URL(page.url()).pathname.startsWith(path);
    const refused = /only (administrators|superadmins)|don.t have access|not allowed|forbidden/.test(bodyText);
    expect(sentAway || refused, `${path} must send a teacher away or refuse them`).toBe(true);
    expect(bodyText, `${path} must not show administrator controls`).not.toContain("new branch");
    expect(bodyText).not.toContain("batch generate invoices");
  }
  for (const url of [
    "/api/v1/members",
    "/api/v1/settings/enforcement",
    "/api/v1/settings/self-approval?branchId=x",
    "/api/v1/finance/invoices?branchId=x",
    "/api/v1/communication/dispatches",
  ]) {
    const res = await page.request.get(url);
    expect([401, 403, 404], `${url} must refuse a teacher, got ${res.status()}`).toContain(res.status());
  }
});

test("an administrator of one branch cannot reach another branch's pupils by changing a URL or a request", async ({ page }) => {
  const home = await seedInstance();
  const other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });
  const foreign = await db.studentRecord.create({
    data: {
      branchId: other.id,
      firstName: "Foreign",
      lastName: "Pupil",
      gender: "MALE",
      dateOfBirth: new Date("2013-01-01"),
      admissionNo: `X/${Date.now()}`,
    },
  });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Ada Admin" });
  await signInThroughUi(page, admin);
  await page.goto("/students");
  await expect(page.getByLabel("Branch")).toHaveCount(0); // only one branch offered
  await expect(page.getByText("Foreign Pupil")).toHaveCount(0);
  expect((await page.request.get(`/api/v1/students?branchId=${other.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/v1/students/${foreign.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/v1/students?branchId=${home.id}&q=Foreign`)).status()).toBe(200);
  const edit = await page.request.patch(`/api/v1/students/${foreign.id}`, {
    data: { firstName: "Hacked" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect([403, 404]).toContain(edit.status());
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id: foreign.id } })).firstName).toBe("Foreign");
  expect([403, 404]).toContain((await page.request.get(`/api/v1/settings/approval?branchId=${other.id}`)).status());
});

test("text typed by one person never runs as code in another person's page", async ({ page }) => {
  const home = await seedInstance();
  await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: XSS,
      lastName: "Pupil",
      gender: "MALE",
      dateOfBirth: new Date("2013-01-01"),
      admissionNo: `XS/${Date.now()}`,
    },
  });
  await db.subject.create({ data: { branchId: home.id, name: XSS } });
  await db.classGroup.create({ data: { branchId: home.id, name: XSS } });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Sola Super" });
  await db.announcement.create({ data: { branchId: home.id, title: XSS, body: XSS, authorUserId: admin.id } }).catch(() => undefined);
  let dialogs = 0;
  page.on("dialog", (d) => (dialogs++, void d.dismiss()));
  await signInThroughUi(page, admin);
  for (const path of ["/students", "/academics", "/announcements", "/timetable", "/results"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await noScriptRan(page);
  }
  await page.goto("/students", { waitUntil: "networkidle" });
  await page.getByLabel("Branch").selectOption({ label: "Secondary (English)" });
  await expect(page.getByText("<img src=x", { exact: false }).first()).toBeVisible(); // shown as text, not interpreted
  expect(dialogs).toBe(0);
});

test("the CSP stops inline code that gets into the page as markup", async ({ page, csp }) => {
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false });
  await signInThroughUi(page, teacher);
  // A script created by the page's own (nonce-trusted) code is allowed by design ('strict-dynamic'); what must never run is code arriving as MARKUP: an inline
  // event handler or a javascript: link, which is what an injected name or message would be.
  const violations = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        document.addEventListener("securitypolicyviolation", () => n++);
        const host = document.createElement("div");
        host.innerHTML = '<img src="x" onerror="window.__xss = 2"><a id="evil" href="javascript:window.__xss = 3">x</a>';
        document.body.appendChild(host);
        (document.getElementById("evil") as HTMLAnchorElement).click();
        setTimeout(() => resolve(n), 800);
      }),
  );
  expect(violations).toBeGreaterThan(0);
  expect(csp.take().length).toBeGreaterThan(0); // provoked on purpose: the fixture would otherwise fail the test
  await noScriptRan(page);
});

test("after sign-out the old session is dead, and nothing secret is kept in browser storage", async ({ page, browser, baseURL }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.httpOnly && /session/i.test(c.name)) ?? cookies.find((c) => c.httpOnly);
  expect(session, "a signed-in browser holds an HttpOnly session cookie").toBeTruthy();
  expect(session!.sameSite).not.toBe("None");
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain(session!.value);
  expect(await page.evaluate(() => document.cookie)).not.toContain(session!.name); // not readable by page scripts

  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  const replay = await browser.newContext({ baseURL: baseURL! });
  await replay.addCookies([session!]);
  const replayPage = await replay.newPage();
  await replayPage.goto("/dashboard");
  await expect(replayPage).toHaveURL(/\/login/);
  expect((await replayPage.request.get("/api/v1/auth/me")).status()).toBe(401);
  await replay.close();
});

test("the app cannot be framed by another site, and a cross-site request is refused", async ({ page, baseURL }) => {
  await page.goto("about:blank");
  await page.setContent(`<iframe id="f" src="${baseURL}/login" width="600" height="400"></iframe>`);
  await page.waitForTimeout(2500);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const framed = frame ? ((await frame.evaluate(() => document.body?.innerText ?? "").catch(() => "")) as string) : "";
  expect(framed.toLowerCase()).not.toContain("sign in");
  const res = await page.request.post(`${baseURL}/api/v1/auth/login`, {
    data: { email: "a@b.c", password: "x" },
    headers: { origin: "https://evil.example" },
  });
  expect(res.status()).toBe(403);
});

test("the first-run setup is closed once the school is set up", async ({ page, baseURL }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.post(`${baseURL}/api/v1/setup`, {
    data: { name: "Eve", email: "eve@example.com", password: "correct-horse-battery-9", confirmPassword: "correct-horse-battery-9" },
    headers: { origin: baseURL! },
  });
  expect([403, 409]).toContain(res.status());
  expect(await db.user.count({ where: { email: "eve@example.com" } })).toBe(0);
});
