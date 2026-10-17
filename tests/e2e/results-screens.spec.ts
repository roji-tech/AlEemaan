import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { signInThroughUi } from "./helpers";

// The Results screens in a real browser (Slice P2d): a teacher enters marks (live total and grade, the server's sentences, save, submit), an administrator who did
// not enter them approves and publishes, writes remarks, reads and prints the report card, and the card's verification link opens the public page. Axe (WCAG 2.2 A/AA)
// runs on every section, dialog and the public page in BOTH themes. Screenshots go to out/screenshots for the maintainer.

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
  await resetDatabase(); // published results cannot be deleted row by row, and a later screen spec expects an empty branch
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

async function teacherWorld() {
  const branch = await seedInstance();
  const w = await resultsWorld(branch.id, "E2E");
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tola Teacher" });
  const staff = await db.staffRecord.create({
    data: { branchId: branch.id, userId: teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
  });
  await db.staffSubjectAssignment.create({
    data: { branchId: branch.id, staffRecordId: staff.id, subjectId: w.subject.id, classArmId: w.arm.id },
  });
  return { branch, w, teacher, armLabel: `${w.group.name} A`, pairLabel: `${w.group.name} A · ${w.subject.name}` };
}

for (const theme of ["dark", "light"] as const) {
  test(`a teacher enters marks with a live total and grade, meets the server's sentence, saves and submits (${theme} theme)`, async ({
    page,
    baseURL,
  }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const { teacher, w, pairLabel } = await teacherWorld();
    await signInThroughUi(page, teacher);
    await page.goto("/results");
    await expect(page.getByRole("heading", { level: 1, name: "Results" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Review" })).toHaveCount(0); // administrators only
    await expectAccessible(page, `results, enter marks, empty (${theme})`);

    await page.getByLabel("Class and subject").selectOption({ label: pairLabel });
    const row = page.getByRole("row").filter({ hasText: w.student.lastName });
    await expect(row).toContainText("Not entered");
    await row.getByLabel(/Test 1$/).fill("25"); // out of 20
    await expect(row.getByLabel(/Test 1$/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: "Save drafts" })).toBeDisabled();
    await row.getByLabel(/Test 1$/).fill("15");
    await row.getByLabel(/Test 2$/).fill("10");
    await expect(row).toContainText("Needs attention"); // the exam is missing
    await row.getByLabel(/Exam$/).fill("40");
    await expect(row.getByRole("cell").nth(3)).toHaveText("65"); // live total
    await expect(row.getByRole("cell").nth(4)).toHaveText("C"); // live grade (50-70)
    await expectAccessible(page, `results, enter marks, filled grid (${theme})`);
    await page.screenshot({ path: `${SHOTS}/aleemaan-results-entry-${theme}.png`, fullPage: true });

    await page.getByRole("button", { name: "Save drafts" }).click();
    await expect(page.getByText("Saved: 1 added, 0 changed, 0 removed.")).toBeVisible();
    await expect(row).toContainText("Draft");
    await page.getByRole("button", { name: /Submit 1 for review/ }).click();
    await expect(page.getByText("1 result submitted for review.")).toBeVisible();
    await expect(row).toContainText("Submitted");
    await expect(row.getByLabel(/Exam$/)).toHaveJSProperty("readOnly", true); // past DRAFT: read-only
  });

  test(`an administrator approves and publishes, writes remarks, reads and prints the card, and its verification link opens the public page (${theme} theme)`, async ({
    page,
    baseURL,
  }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const { branch, w, teacher, armLabel } = await teacherWorld();
    // the teacher's marks, entered and submitted directly through the database layer's own rules (the entry flow is the previous test's job)
    const author = teacher;
    await db.result.create({
      data: {
        branchId: branch.id,
        studentId: w.student.id,
        subjectId: w.subject.id,
        periodId: w.period.id,
        classArmId: w.arm.id,
        schemeId: w.scheme.id,
        scaleId: w.scale.id,
        componentScores: [
          { name: "Test 1", max: 20, score: 15 },
          { name: "Test 2", max: 20, score: 10 },
        ],
        examScore: 40,
        examMax: 60,
        caTotal: 25,
        total: 65,
        maxScore: 100,
        gradeLetter: "C",
        gradeRemark: "Credit",
        enteredByUserId: author.id,
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedByUserId: author.id,
      },
    });
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Ada Admin" });
    await signInThroughUi(page, admin);
    await page.goto("/results");
    await page.getByRole("tab", { name: "Review" }).click();
    const group = page
      .getByRole("listitem")
      .filter({ hasText: `${armLabel} · ${w.subject.name}` })
      .first();
    await expect(group).toContainText("Submitted · 1");
    await expectAccessible(page, `results, review (${theme})`);
    await group.getByRole("button", { name: /^Approve 1 submitted/ }).click();
    await expect(group).toContainText("Approved · 1");

    // remarks and a preview while the results are only approved
    await page.getByRole("tab", { name: "Report cards" }).click();
    await page.getByLabel("Class", { exact: true }).selectOption({ label: armLabel });
    await page.getByLabel("Student").selectOption({ label: `Amina ${w.student.lastName}` });
    await expect(page.getByText("No published results for this term yet.")).toBeVisible();
    await page.getByLabel("Preview with results that are not published yet").check();
    await expect(page.getByText("Preview: some of these results are not published yet")).toBeVisible();
    await expect(page.getByRole("article")).toContainText(w.subject.name);
    await page.getByLabel("Teacher's remark").fill("A hard-working pupil.");
    await page.getByLabel("Principal's remark").fill("Keep it up.");
    await page.getByRole("button", { name: "Save remarks" }).click();
    await expect(page.getByText("Remarks saved.")).toBeVisible();

    await page.getByRole("tab", { name: "Review" }).click();
    await group.getByRole("button", { name: /^Publish 1 approved/ }).click();
    await expect(group).toContainText("Published · 1");
    await group.getByRole("button", { name: /^Unlock 1 published/ }).click(); // the reason dialog
    await expectAccessible(page, `unlock dialog (${theme})`);
    await dialog(page).getByLabel("Reason").fill("no");
    await dialog(page).getByRole("button", { name: "Unlock" }).click();
    await expect(dialog(page).getByText("Give a reason of at least 5 characters.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("tab", { name: "Report cards" }).click();
    await page.getByLabel("Class", { exact: true }).selectOption({ label: armLabel });
    await page.getByLabel("Student").selectOption({ label: `Amina ${w.student.lastName}` });
    const card = page.getByRole("article");
    await expect(card).toContainText("65");
    await expect(card).toContainText("Credit");
    await expect(card).toContainText("1st");
    await expect(card).toContainText("A hard-working pupil.");
    await expect(page.getByText("results are published, so the remarks can no longer change.")).toBeVisible();
    await expect(page.getByLabel("Teacher's remark")).toBeDisabled();
    await expectAccessible(page, `results, report card (${theme})`);
    await page.screenshot({ path: `${SHOTS}/aleemaan-results-card-${theme}.png`, fullPage: true });

    // print: only the card remains
    await page.emulateMedia({ media: "print" });
    await expect(card).toBeVisible();
    await expect(page.getByRole("tablist")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Results" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Print this report card" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    // the card's verification link opens the public page, which says nothing about the marks
    const link = (
      await card
        .getByText(/\/verify\//)
        .first()
        .innerText()
    )
      .split(": ")[1]
      .trim();
    await page.context().clearCookies();
    await page.goto(new URL(link).pathname);
    await expect(page.getByText("This result is genuine.")).toBeVisible();
    await expect(page.getByText("Amina Y.")).toBeVisible();
    await expect(page.getByText(w.student.admissionNo)).toHaveCount(0);
    await expect(page.getByText("Credit")).toHaveCount(0);
    await expectAccessible(page, `public verification page (${theme})`);
  });
}

test("a teacher with no assignments is told so, not shown an empty form", async ({ page }) => {
  const branch = await seedInstance();
  await resultsWorld(branch.id, "NOASSIGN");
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Nobody Assigned" });
  await signInThroughUi(page, teacher);
  await page.goto("/results");
  await expect(page.getByText("You are not assigned to any subject in this branch yet.")).toBeVisible();
  await expect(page.getByLabel("Class and subject")).toHaveCount(0);
});

test("a student or parent has no branch with staff access here, and the tabs work from the keyboard", async ({ page }) => {
  const parent = await createUser({ role: Role.PARENT });
  await signInThroughUi(page, parent);
  await page.goto("/results");
  await expect(page.getByText("You don't belong to a branch with staff access yet.")).toBeVisible();
  const { teacher } = await teacherWorld();
  await page.context().clearCookies();
  await signInThroughUi(page, teacher);
  await page.goto("/results");
  await page.getByRole("tab", { name: "Enter marks" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Report cards" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Enter marks" })).toHaveAttribute("aria-selected", "true");
});
