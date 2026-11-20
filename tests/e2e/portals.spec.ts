import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { PORTALS_PORT } from "../support/env";
import { DEFAULT_PASSWORD, Role, createUser, seedInstance } from "../support/db";

// The sign-in portals in a real browser (task 0086), on the server that has them on: `admin.localhost`, `staff.localhost`, `student.localhost`, `parent.localhost` and the school's own host
// `localhost` (Chromium sends every `*.localhost` name to this machine). Desktop and phone; axe (WCAG 2.2 A/AA) on the pages.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const at = (portal: string, path = "") => `http://${portal === "apex" ? "" : `${portal}.`}localhost:${PORTALS_PORT}${path}`;
test.beforeAll(async () => {
  await seedInstance();
});

// On student. and parent. the first form is the families' (admission number and code, task 0113); the e-mail sign-in of an invited account is one click under it.
const EMAIL_LINK = "I have an account with an e-mail address";
async function signIn(page: Page, portal: string, email: string, password: string) {
  await page.goto(at(portal, "/login"));
  if (portal === "student" || portal === "parent") await page.getByRole("button", { name: EMAIL_LINK }).click();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const HEADINGS: [string, string][] = [
  ["admin", "Administrator sign-in"],
  ["staff", "Staff sign-in"],
  ["student", "Student sign-in"],
  ["parent", "Parent sign-in"],
];

test("the school's own host has no sign-in form: /login goes to the sign-in page, with a button for parent, student and staff, each to its portal", async ({
  page,
}) => {
  await page.goto(at("apex", "/login"));
  await expect(page).toHaveURL(at("apex", "/select-role"));
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  const list = page.getByRole("list", { name: "Sign-in portals" });
  await expect(list.getByRole("link")).toHaveCount(3);
  await expect(list.getByRole("link", { name: /Administrator/ })).toHaveCount(0);
  for (const [portal, title] of HEADINGS.filter(([p]) => p !== "admin")) {
    await expect(list.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", at(portal, "/login"));
  }
  await expectAccessible(page, "the website's sign-in page");
});

test("a button on the sign-in page leads to that portal's own sign-in page", async ({ page }) => {
  await page.goto(at("apex", "/select-role"));
  await page
    .getByRole("list", { name: "Sign-in portals" })
    .getByRole("link", { name: /Parent sign-in/ })
    .click();
  await expect(page).toHaveURL(at("parent", "/login"));
  await expect(page.getByRole("heading", { level: 1, name: "Parent sign-in" })).toBeVisible();
});

for (const [portal, title] of HEADINGS) {
  test(`${portal}.: the sign-in page says it is the ${portal} portal`, async ({ page }) => {
    await page.goto(at(portal, "/login"));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator(`[data-portal="${portal}"]`)).toBeVisible();
    if (portal === "student" || portal === "parent") {
      // The families' form first: admission number and code, with the e-mail sign-in one click away.
      await expect(page.getByLabel("Admission number", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
      await expectAccessible(page, `the ${portal} sign-in (families)`);
      await page.getByRole("button", { name: EMAIL_LINK }).click();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator(`[data-portal="${portal}"]`)).toBeVisible();
    }
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expectAccessible(page, `the ${portal} sign-in`);
  });
}

test("an administrator signs in on admin., and that session is not sent to staff.: the other portal asks to sign in", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  await signIn(page, "admin", admin.email, admin.password);
  await expect(page).toHaveURL(at("admin", "/dashboard"));
  await page.goto(at("staff", "/dashboard"));
  await expect(page).toHaveURL(at("staff", "/login"));
  await expect(page.getByRole("heading", { level: 1, name: "Staff sign-in" })).toBeVisible();
});

test("a parent's right password on admin. is answered like a wrong password: the same words, still on the sign-in page, no session", async ({
  page,
}) => {
  const parent = await createUser({ role: Role.PARENT });
  await signIn(page, "admin", parent.email, DEFAULT_PASSWORD);
  const wrongPortal = page.getByRole("alert").filter({ hasText: "The email or password you entered is incorrect" });
  await expect(wrongPortal).toBeVisible();
  const words = await wrongPortal.innerText();
  await expect(page).toHaveURL(at("admin", "/login"));
  await page.reload();
  await signIn(page, "admin", parent.email, "not-the-password-1");
  await expect(page.getByRole("alert").filter({ hasText: "The email or password you entered is incorrect" })).toHaveText(words);
  await page.goto(at("admin", "/dashboard"));
  await expect(page).toHaveURL(at("admin", "/login")); // no session was made
  await signIn(page, "parent", parent.email, DEFAULT_PASSWORD); // and on their own portal the same person is in
  await expect(page).toHaveURL(at("parent", "/dashboard"));
});

test("the public website is the school's own host's: asked for on a portal it redirects there", async ({ page }) => {
  await page.goto(at("staff", "/about"));
  await expect(page).toHaveURL(at("apex", "/about"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto(at("parent", "/"));
  await expect(page).toHaveURL(at("apex", "/"));
});
