import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance, uniqueEmail } from "../support/db";
import { linkFrom, mailAfterGrace, waitForMail } from "../support/outbox";
import { signInThroughUi } from "./helpers";

// Changing your email address needs approval (task 0088), in a real browser: a member asks on the Account page, sees that it is waiting (and can withdraw it),
// an administrator decides on Approvals, and only then does the link go to the new address.

test.beforeAll(async () => {
  await seedInstance();
});

const ask = async (page: import("@playwright/test").Page, user: { password: string }, newEmail: string) => {
  await page.goto("/account");
  await page.getByRole("button", { name: "Change email address" }).click();
  await expect(page.getByText("An administrator has to approve this first.")).toBeVisible();
  await page.getByLabel("New email address").fill(newEmail);
  await page.getByLabel("Your password").fill(user.password);
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("heading", { name: "Sent for approval" })).toBeFocused();
};

test("the whole journey: a teacher asks → waits → the administrator approves on Approvals → the link reaches the new address → it switches", async ({
  page,
  browser,
}) => {
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hauwa Bello" });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" });
  const newEmail = uniqueEmail("fresh");

  await signInThroughUi(page, teacher);
  await ask(page, teacher, newEmail);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for approval" })).toContainText(newEmail);
  expect(await mailAfterGrace(newEmail, 1000)).toHaveLength(0); // nothing for the new address yet

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInThroughUi(adminPage, admin);
  await adminPage.goto("/approvals");
  await expect(adminPage.getByRole("tab", { name: "Email changes (1)" })).toBeVisible();
  await adminPage.getByRole("tab", { name: /^Email changes/ }).click();
  const row = adminPage.getByRole("listitem").filter({ hasText: "Hauwa Bello" });
  await expect(row).toContainText(newEmail);
  await row.getByRole("button", { name: "Approve the email change for Hauwa Bello" }).click();
  await adminPage.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(adminPage.getByText("Approved. A confirmation link is on its way")).toBeVisible();
  await expect(adminPage.getByText("No email changes are waiting for you.")).toBeVisible();

  const link = linkFrom((await waitForMail(newEmail))[0]);
  await page.goto(link);
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page.getByRole("heading", { name: "Email address changed" })).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: teacher.id } })).email).toBe(newEmail);
  await adminContext.close();
});

test("a waiting request can be withdrawn, and the administrator's list is then empty; a denial changes nothing", async ({
  page,
  browser,
}) => {
  const pupil = await createUser({ role: Role.STUDENT, name: "Zainab Musa" });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, pupil);
  await ask(page, pupil, uniqueEmail("one"));
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Cancel this request" }).click();
  await expect(page.getByText("Waiting for approval")).toHaveCount(0);
  expect(await db.emailChangeRequest.count({ where: { userId: pupil.id } })).toBe(0);

  await ask(page, pupil, uniqueEmail("two"));
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInThroughUi(adminPage, admin);
  await adminPage.goto("/approvals");
  await adminPage.getByRole("tab", { name: /^Email changes/ }).click();
  await adminPage.getByRole("button", { name: "Deny the email change for Zainab Musa" }).click();
  await adminPage.getByLabel(/Your note/).fill("Please ask at the office");
  await adminPage.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(adminPage.getByText("Zainab Musa has been told their address was not changed.")).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: pupil.id } })).email).toBe(pupil.email);
  expect((await db.emailChangeRequest.findFirstOrThrow({ where: { userId: pupil.id } })).decisionReason).toBe("Please ask at the office");
  await adminContext.close();
});

test("a superadmin changes their own address without anyone approving it: the form says so and the link arrives", async ({ page }) => {
  const sa = await createUser({ role: Role.ADMIN, superAdmin: true });
  const newEmail = uniqueEmail("sa");
  await signInThroughUi(page, sa);
  await page.goto("/account");
  await page.getByRole("button", { name: "Change email address" }).click();
  await expect(page.getByText("An administrator has to approve this first.")).toHaveCount(0);
  await page.getByLabel("New email address").fill(newEmail);
  await page.getByLabel("Your password").fill(sa.password);
  await page.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeFocused();
  await waitForMail(newEmail);
});
