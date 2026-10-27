import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { signInThroughUi } from "./helpers";

// The scheme levels in a real browser (Slice UI1): a superadmin writes the school-wide default, an administrator gives one class its own scheme, and a teacher
// writes a scheme for their subject with a reason, uses it while it waits, and an administrator approves it under Approvals. Axe (WCAG 2.2 A/AA) in both themes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const dialog = (page: Page) => page.getByRole("dialog");

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

for (const theme of ["dark", "light"] as const) {
  test(`scheme levels: a school-wide default and a class's own scheme (${theme} theme)`, async ({ page, baseURL }, info) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const branch = await seedInstance();
    const w = await resultsWorld(branch.id, "LVL");
    const sup = await createUser({ superAdmin: true, name: "Sola Super" });
    await db.membership.create({ data: { userId: sup.id, branchId: branch.id, role: Role.ADMIN } });
    await signInThroughUi(page, sup);
    await page.goto("/academics");
    await page.getByRole("tab", { name: "Assessment and grading" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Scheme levels" })).toBeVisible();
    await page.getByLabel("Branch").last().selectOption({ label: "Secondary (English)" });
    await expectAccessible(page, `scheme levels (${theme})`);

    await page.getByRole("button", { name: "New school-wide scheme" }).click();
    await dialog(page).getByLabel("Scheme name").fill("School standard");
    await dialog(page).getByLabel("Part 1 name").fill("Test");
    await dialog(page).getByLabel("Part 1 marks").fill("30");
    await dialog(page).getByLabel("Exam marks").fill("60");
    await expect(dialog(page).getByText("Adds up to 90 of 100.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Save scheme" }).click();
    await expect(dialog(page).getByText(/add up|exactly 100/i)).toBeVisible(); // the server's own sentence
    await dialog(page).getByLabel("Exam marks").fill("70");
    await expectAccessible(page, `school-wide scheme dialog (${theme})`);
    await dialog(page)
      .getByLabel(/Make it the default/)
      .check();
    await dialog(page).getByRole("button", { name: "Save scheme" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "School standard" })).toContainText("Test 30 + Exam 70 = 100");

    await page.getByRole("button", { name: `Set the scheme for ${w.group.name}` }).click();
    await dialog(page).getByLabel("Scheme name").fill("Junior scheme");
    await dialog(page).getByLabel("Part 1 name").fill("Test 1");
    await dialog(page).getByLabel("Part 1 marks").fill("20");
    await dialog(page).getByRole("button", { name: "Add a part" }).click();
    await dialog(page).getByLabel("Part 2 name").fill("Test 2");
    await dialog(page).getByLabel("Part 2 marks").fill("20");
    await dialog(page).getByLabel("Exam marks").fill("60");
    await dialog(page).getByRole("button", { name: "Save scheme" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: w.group.name })).toContainText("Test 1 20 + Test 2 20 + Exam 60 = 100");
    await page.screenshot({ path: path.join(SHOTS, `scheme-levels-${theme}-${info.project.name}.png`), fullPage: true });
  });
}

test("scheme levels: a teacher's own scheme is written with a reason, waits, and an administrator approves it", async ({
  page,
  browser,
  baseURL,
}) => {
  const branch = await seedInstance();
  const w = await resultsWorld(branch.id, "TCH");
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tola Teacher" });
  const staff = await db.staffRecord.create({
    data: { branchId: branch.id, userId: teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
  });
  await db.staffSubjectAssignment.create({
    data: { branchId: branch.id, staffRecordId: staff.id, subjectId: w.subject.id, classArmId: w.arm.id },
  });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Ada Admin" });

  await signInThroughUi(page, teacher);
  await page.goto("/results");
  await page.getByLabel("Class and subject").selectOption({ label: `${w.group.name} A · ${w.subject.name}` });
  await expect(page.getByRole("heading", { level: 3, name: `Your own scheme for ${w.subject.name}` })).toBeVisible();
  await page.getByRole("button", { name: `New scheme for ${w.subject.name}` }).click();
  await dialog(page).getByLabel("Scheme name").fill("Maths practical");
  await dialog(page).getByLabel("Part 1 name").fill("Practical");
  await dialog(page).getByLabel("Part 1 marks").fill("40");
  await dialog(page).getByLabel("Exam marks").fill("60");
  await expect(dialog(page).getByRole("button", { name: "Save and ask for approval" })).toBeDisabled(); // a reason is needed first
  await dialog(page)
    .getByLabel(/Why does this subject/)
    .fill("Half the marks are practical work.");
  await expectAccessible(page, "teacher scheme dialog");
  await dialog(page).getByRole("button", { name: "Save and ask for approval" }).click();
  await expect(page.getByText("Sent for approval.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Maths practical" })).toContainText("Waiting for approval");

  const adminPage = await (await browser.newContext({ baseURL: baseURL! })).newPage();
  await signInThroughUi(adminPage, admin);
  await adminPage.goto("/approvals");
  await expect(adminPage.getByText("A teacher's assessment scheme")).toBeVisible();
  await adminPage.getByRole("button", { name: /^Approve A teacher's assessment scheme/ }).click();
  await adminPage.getByLabel(/Your reason/).fill("Fine.");
  await adminPage.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(adminPage.getByText("Approved.")).toBeVisible();
  await adminPage.context().close();

  await page.reload();
  await page.getByLabel("Class and subject").selectOption({ label: `${w.group.name} A · ${w.subject.name}` });
  await expect(page.getByRole("listitem").filter({ hasText: "Maths practical" })).toContainText("Approved");
});
