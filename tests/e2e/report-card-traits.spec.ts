import "../support/env";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { ensureReportTemplates } from "@/lib/results/seed-branch";
import { signInThroughUi } from "./helpers";
import { resultFootprint } from "../support/result-footprint";

// Task 0116 on screen (the maintainer, 2026-11-20): the school's four printed report cards. An administrator enters a pupil's trait ratings and attendance from the report card screen and sees them
// on the coloured card; after publication they are read-only; the card prints with its colours kept. Desktop and phone, with axe.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp(page: Page, layout: "SENIOR" | "PRESCHOOL" = "SENIOR") {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Cards Admin" });
  const w = await resultsWorld(branch.id);
  await ensureReportTemplates(branch.id);
  const template = await db.resultTemplate.findFirstOrThrow({ where: { branchId: branch.id, layoutCode: layout } });
  await db.resultTemplateClass.create({ data: { branchId: branch.id, templateId: template.id, classGroupId: w.group.id } });
  await signInThroughUi(page, admin);
  return { branch, admin, w };
}

/// One result for the pupil. DRAFT is seen by an administrator in the preview and leaves ratings editable; PUBLISHED locks the pupil's traits and attendance for the term.
const seedResult = async (w: Awaited<ReturnType<typeof resultsWorld>>, branchId: string, status: "DRAFT" | "PUBLISHED") =>
  db.result.create({
    data: {
      branchId,
      studentId: w.student.id,
      subjectId: w.subject.id,
      periodId: w.period.id,
      classArmId: w.arm.id,
      schemeId: w.scheme.id,
      scaleId: w.scale.id,
      componentScores: [{ name: "Test 1", max: 20, score: 10 }],
      examScore: 50,
      examMax: 60,
      caTotal: 10,
      total: 60,
      maxScore: 100,
      gradeLetter: "C",
      gradeRemark: "Credit",
      ...(await (async () => {
        const by = (await db.user.findFirstOrThrow()).id;
        return { enteredByUserId: by, ...resultFootprint(status, by) };
      })()),
    },
  });

/// Opens Results > Report cards and chooses the pupil. A tap that lands before the page's scripts are running is lost (seen on the phone), so tap until the tab is the selected one.
async function openCard(page: Page, w: Awaited<ReturnType<typeof resultsWorld>>, preview = false) {
  await page.goto("/results");
  const tab = page.getByRole("tab", { name: "Report cards", exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  if (preview) await page.getByRole("checkbox", { name: "Preview with results that are not published yet" }).check();
  await page.getByLabel("Class").selectOption({ label: `${w.group.name} A` });
  await page.getByLabel("Student").selectOption({ label: `${w.student.firstName} ${w.student.lastName}` });
  const card = page.getByRole("article", { name: `Report card for ${w.student.firstName} ${w.student.lastName}` });
  await expect(card).toBeVisible();
  return card;
}

test("a senior card shows the template's trait sections, the dates and its colours; the traits and attendance are entered from the screen", async ({
  page,
}) => {
  const { branch, w } = await setUp(page);
  await seedResult(w, branch.id, "DRAFT");
  const card = await openCard(page, w, true);
  await expect(card).toHaveAttribute("data-report-template", "SENIOR");
  await expect(card.getByRole("table", { name: "Character development" })).toBeVisible();
  await expect(card.getByRole("table", { name: "Practical skills" })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "Sign", exact: true })).toHaveCount(2); // the secondary cards print a SIGN column beside the rating
  await expect(card.getByText("Next term begins:")).toBeVisible();
  await expectAccessible(page, "the senior report card");

  await page.getByRole("button", { name: "Traits and attendance" }).click();
  const dialog = page.getByRole("dialog", { name: /^Traits and attendance of / });
  await expect(dialog).toContainText("template Senior Secondary (Year 10-12)");
  await dialog.getByLabel("Neatness").selectOption({ label: "5 Excellent" });
  await dialog.getByLabel("Punctuality").first().selectOption({ label: "4 V. Good" });
  await dialog.getByLabel("Times school opened").fill("90");
  await dialog.getByLabel("Times present").fill("80");
  await dialog.getByLabel("Times absent").fill("10");
  await expectAccessible(page, "the traits and attendance dialog");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Traits and attendance saved for ${w.student.firstName} ${w.student.lastName}.`)).toBeVisible();

  await expect(card.getByRole("row", { name: /^Neatness/ })).toContainText("5");
  await expect(card.getByRole("row", { name: /^Punctuality/ }).first()).toContainText("4");
  await expect(card.getByText("No of times absent")).toBeVisible();
  await expect(card.getByRole("cell", { name: "90" })).toBeVisible();
  expect(await db.traitRating.count({ where: { studentId: w.student.id } })).toBe(2);
  expect(await db.reportAttendance.findFirstOrThrow({ where: { studentId: w.student.id } })).toMatchObject({
    timesOpen: 90,
    timesPresent: 80,
    timesAbsent: 10,
  });
});

test("a pre-school card has the psychomotor and affective sections and the term's dates, and printing keeps its colours", async ({
  page,
}) => {
  const { branch, w } = await setUp(page, "PRESCHOOL");
  await seedResult(w, branch.id, "DRAFT");
  const card = await openCard(page, w, true);
  await expect(card).toHaveAttribute("data-report-template", "PRESCHOOL");
  await expect(card.getByRole("table", { name: "Psychomotor skill" })).toBeVisible();
  await expect(card.getByRole("table", { name: "Affective domain" })).toBeVisible();
  await expect(card.getByRole("row", { name: /^Verbal fluency/ })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "Sign", exact: true })).toHaveCount(0);
  await expect(card.getByRole("columnheader", { name: "This term starts on" })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "School closed on" })).toBeVisible();
  await expect(card.getByText("Parent's / guardian's comment")).toBeVisible();
  await expect(card.getByText("Scale: 5 Excellent · 4 V. Good · 3 Good · 2 Fair · 1 Poor")).toBeVisible();
  // The header band is the logo's green and the real logo is drawn in colour; printing keeps both.
  await page.emulateMedia({ media: "print" });
  const band = card.locator("header").first();
  expect(await band.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(26, 107, 90)");
  expect(await band.evaluate((el) => getComputedStyle(el).printColorAdjust)).toBe("exact");
  await expect(card.locator('img[src="/school-site/aleeman-logo.png"]')).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("once the pupil's results are published the dialog is read-only", async ({ page }) => {
  const { branch, w } = await setUp(page);
  await seedResult(w, branch.id, "PUBLISHED");
  await openCard(page, w);
  await page.getByRole("button", { name: "Traits and attendance" }).click();
  const dialog = page.getByRole("dialog", { name: /^Traits and attendance of / });
  await expect(dialog).toContainText("This pupil's results for the term are published, so these can't change.");
  await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(dialog.getByLabel("Neatness")).toBeDisabled();
  await expect(dialog.getByLabel("Times school opened")).toBeDisabled();
  await expectAccessible(page, "the read-only traits dialog");
});

test("the class arm and the Verify these results block are hidden unless the template turns them on (task 0121)", async ({ page }) => {
  const { branch, w } = await setUp(page);
  await seedResult(w, branch.id, "PUBLISHED");
  let card = await openCard(page, w);
  // Default: the class reads without its arm, and there is no verification block, although the result is published and has its token.
  await expect(card).not.toContainText(`${w.group.name} A`);
  await expect(card).toContainText(w.group.name);
  await expect(card.getByRole("region", { name: "Verification" })).toHaveCount(0);

  await db.resultTemplate.updateMany({
    where: { branchId: branch.id, layoutCode: "SENIOR" },
    data: { layoutOptions: { classArm: true, verifyLinks: true } },
  });
  card = await openCard(page, w);
  await expect(card).toContainText(`${w.group.name} A`);
  await expect(card.getByRole("region", { name: "Verification" }).getByRole("heading", { name: "Verify these results" })).toBeVisible();
  await expectAccessible(page, "the senior card with the arm and the verify block shown");
});
