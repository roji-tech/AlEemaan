import "../support/env";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { ensureReportTemplates } from "@/lib/results/seed-branch";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0116 on screen (the maintainer, 2026-11-19): five result templates over sixteen scattered classes, made and filled in a few clicks on Results > Templates; a class moved from one
// template to another with the confirmation naming it; the template shown on the Classes tab and chosen there. Driven on a desktop and a phone, with axe on the screens.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}

const CLASSES = [
  "Prep A",
  "Prep B",
  "Nur 1",
  "Nur 2",
  "Basic 1",
  "Basic 2",
  "Basic 3",
  "Basic 4",
  "Basic 5",
  "Basic 6",
  "JSS 1",
  "JSS 2",
  "JSS 3",
  "SSS 1",
  "SSS 2",
  "SSS 3",
];

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp(page: Page) {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Templates Admin" });
  await db.classGroup.createMany({ data: CLASSES.map((name, i) => ({ branchId: branch.id, name, sortOrder: i })) });
  await signInThroughUi(page, admin);
  return { branch, admin };
}

/// Opens Results > Templates. A tap that lands before the page's scripts are running is lost (2026-11-19, seen on the phone), so tap until the tab is the selected one.
async function openTemplates(page: Page) {
  await page.goto("/results");
  const tab = page.getByRole("tab", { name: "Templates", exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 2, name: "Result templates" })).toBeVisible();
}

async function makeTemplate(page: Page, name: string) {
  await page.getByRole("button", { name: "New template" }).click();
  const form = page.getByRole("dialog", { name: "New result template" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Make template" }).click();
  await expect(page.getByText(`${name} made.`)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "New result template" })).toBeHidden();
}

async function pickRange(page: Page, template: string, from: string, to: string) {
  await page.getByRole("button", { name: `Add classes to ${template}` }).click();
  const box = page.getByRole("dialog", { name: `Classes of ${template}` });
  await box.getByLabel("From class").selectOption({ label: from });
  await box.getByLabel("To class").selectOption({ label: to });
  await box.getByRole("button", { name: "Select the range" }).click();
  return box;
}

test("five templates over sixteen scattered classes: made, filled with ranges and ticks, and every class is covered", async ({ page }) => {
  await setUp(page);
  await openTemplates(page);
  // A brand-new branch: only the default, every class uses it.
  // The default and the school's four report cards (task 0116).
  await expect(page.getByRole("list", { name: "Templates" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByText("16 of 16 classes use the default template because nobody has chosen one.")).toBeVisible();
  await expectAccessible(page, "the templates view, nothing placed yet");

  for (const name of ["Template A", "Template B", "Template C", "Template D", "Template E"]) await makeTemplate(page, name);
  await expect(page.getByRole("list", { name: "Templates" }).getByRole("listitem")).toHaveCount(10);

  // A: Prep A to Nur 1 (a range). The dialog says what it will do before saving.
  let box = await pickRange(page, "Template A", "Prep A", "Nur 1");
  await expect(box).toContainText("3 classes ticked");
  await expectAccessible(page, "the classes dialog");
  await box.getByRole("button", { name: "Save classes" }).click();
  await expect(page.getByText("Template A: 3 added.")).toBeVisible();

  box = await pickRange(page, "Template B", "Nur 2", "Basic 5");
  await box.getByRole("button", { name: "Save classes" }).click();
  await expect(page.getByText("Template B: 6 added.")).toBeVisible();

  box = await pickRange(page, "Template C", "Basic 6", "JSS 3");
  await box.getByRole("button", { name: "Save classes" }).click();
  await expect(page.getByText("Template C: 4 added.")).toBeVisible();

  // D: both SSS 1 and SSS 2 ticked one by one (a scattered choice), E: SSS 3 alone.
  await page.getByRole("button", { name: "Add classes to Template D" }).click();
  box = page.getByRole("dialog", { name: "Classes of Template D" });
  await box.getByRole("checkbox", { name: "SSS 1" }).check();
  await box.getByRole("checkbox", { name: "SSS 2" }).check();
  await box.getByRole("button", { name: "Save classes" }).click();
  await expect(page.getByText("Template D: 2 added.")).toBeVisible();
  await page.getByRole("button", { name: "Add classes to Template E" }).click();
  box = page.getByRole("dialog", { name: "Classes of Template E" });
  await box.getByRole("checkbox", { name: "SSS 3" }).check();
  await box.getByRole("button", { name: "Save classes" }).click();
  await expect(page.getByText("Template E: 1 added.")).toBeVisible();

  await expect(page.getByText("Every class has a template.")).toBeVisible();
  const coverage = page.getByRole("list", { name: "Coverage" });
  await expect(coverage.getByRole("listitem")).toHaveCount(16);
  const chosen = (name: string) => coverage.getByRole("combobox", { name: `Result template of ${name}` }).locator("option:checked");
  await expect(chosen("Prep B")).toHaveText("Template A");
  await expect(chosen("Nur 2")).toHaveText("Template B");
  await expect(chosen("Basic 5")).toHaveText("Template B");
  await expect(chosen("JSS 1")).toHaveText("Template C");
  await expect(chosen("SSS 2")).toHaveText("Template D");
  await expect(chosen("SSS 3")).toHaveText("Template E");
  await expect(page.getByRole("list", { name: "Classes of Template B" }).getByRole("listitem")).toHaveCount(6);
  await expectAccessible(page, "the templates view, every class placed");

  // Persisted: the database has the five sets.
  expect(await db.resultTemplateClass.count()).toBe(16);
});

test("moving a class from the coverage list shows what leaves where and needs the confirmation", async ({ page }) => {
  const { branch } = await setUp(page);
  const [a, b] = await Promise.all([
    db.resultTemplate.create({ data: { branchId: branch.id, name: "Template A", isDefault: true } }),
    db.resultTemplate.create({ data: { branchId: branch.id, name: "Template B" } }),
  ]);
  const sss2 = await db.classGroup.findFirstOrThrow({ where: { branchId: branch.id, name: "SSS 2" } });
  await db.resultTemplateClass.create({ data: { branchId: branch.id, templateId: a.id, classGroupId: sss2.id } });

  await openTemplates(page);
  const select = page.getByRole("list", { name: "Coverage" }).getByRole("combobox", { name: "Result template of SSS 2" });
  await expect(select.locator("option:checked")).toHaveText("Template A");
  await select.selectOption({ label: "Template B" });
  const ask = page.getByRole("dialog", { name: "Move this class?" });
  await expect(ask.getByRole("list", { name: "Classes that would move" })).toContainText("SSS 2 leaves Template A");
  await expectAccessible(page, "the move confirmation");
  await ask.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("SSS 2 now uses Template B.")).toBeVisible();
  await expect(select.locator("option:checked")).toHaveText("Template B");
  expect(await db.resultTemplateClass.findMany({ where: { branchId: branch.id } })).toMatchObject([
    { templateId: b.id, classGroupId: sss2.id },
  ]);

  // Back to "uses the default": no confirmation, the class is in no template again.
  await select.selectOption({ label: "Uses the default (Template A)" });
  await expect(page.getByText("The class now uses the default template.")).toBeVisible();
  expect(await db.resultTemplateClass.count()).toBe(0);
});

test("a template's look, marks structure and grade scale are chosen in its form, and a scheme can be made there", async ({ page }) => {
  const { branch } = await setUp(page);
  await db.gradeScale.create({ data: { branchId: branch.id, name: "Nursery scale" } });
  await openTemplates(page);
  await page.getByRole("button", { name: "New template" }).click();
  const form = page.getByRole("dialog", { name: "New result template" });
  await form.getByLabel("Name", { exact: true }).fill("Nursery");
  await form.getByLabel("Layout").selectOption({ label: "Legacy Layout" });
  await expect(form.getByRole("checkbox", { name: "Signature line" })).not.toBeChecked(); // the legacy layout's own default
  await form.getByLabel("Grade scale").selectOption({ label: "Nursery scale" });
  await expectAccessible(page, "the template form");

  // A scheme made for this template, from the same form.
  await form.getByLabel("Marks structure").selectOption({ label: "Make a new scheme for this template…" });
  const scheme = page.getByRole("dialog", { name: "New scheme for this template" });
  await scheme.getByLabel("Scheme name").fill("Nursery marks");
  await scheme.getByLabel("Part 1 name").fill("Classwork");
  await scheme.getByLabel("Part 1 marks").fill("40");
  await scheme.getByLabel("Exam marks").fill("60");
  await scheme.getByRole("button", { name: "Save scheme" }).click();
  await expect(form.getByLabel("Marks structure").locator("option:checked")).toContainText("Nursery marks");
  await form.getByRole("button", { name: "Make template" }).click();
  await expect(page.getByText("Nursery made.")).toBeVisible();

  const card = page.getByRole("list", { name: "Templates" }).getByRole("listitem").filter({ hasText: "Nursery" });
  await expect(card).toContainText("Legacy Layout");
  await expect(card).toContainText("Nursery marks");
  await expect(card).toContainText("Nursery scale");
  expect(await db.resultTemplate.findFirstOrThrow({ where: { name: "Nursery" } })).toMatchObject({ layoutCode: "LEGACY" });
});

test("the Classes tab shows each class's template and chooses it in one step", async ({ page }) => {
  const { branch } = await setUp(page);
  const t = await db.resultTemplate.create({ data: { branchId: branch.id, name: "Template B" } });
  await db.resultTemplate.create({ data: { branchId: branch.id, name: "Template A", isDefault: true } });
  const group = await db.classGroup.findFirstOrThrow({ where: { branchId: branch.id, name: "Basic 1" } });
  await db.resultTemplateClass.create({ data: { branchId: branch.id, templateId: t.id, classGroupId: group.id } });

  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  const card = page.getByRole("listitem").filter({ hasText: "Basic 1" }).first();
  await expect(card).toContainText("Result template: Template B");
  await expect(page.getByRole("listitem").filter({ hasText: "Basic 2" }).first()).toContainText("Result template: Template A (default)");

  await clickAction(page, "Result template of Basic 1");
  const dlg = page.getByRole("dialog", { name: "Result template of Basic 1" });
  await expectAccessible(page, "the class's template dialog");
  await dlg.getByLabel("Result template").selectOption({ label: "Uses the default (Template A)" });
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Basic 1 uses the default template.")).toBeVisible();
  await expect(card).toContainText("Result template: Template A (default)");
  expect(await db.resultTemplateClass.count()).toBe(0);
});

test("a teacher does not get the Templates tab", async ({ page }) => {
  await seedInstance();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false, name: "Templates Teacher" });
  await signInThroughUi(page, teacher);
  await page.goto("/results");
  await expect(page.getByRole("tab", { name: "Enter marks" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Templates" })).toHaveCount(0);
});

test("a class's own grade scale is chosen on the coverage list and says where its scale comes from", async ({ page }) => {
  const { branch } = await setUp(page);
  const scale = await db.gradeScale.create({ data: { branchId: branch.id, name: "Nursery scale", isDefault: true } });
  await db.gradeBand.create({
    data: { branchId: branch.id, scaleId: scale.id, minScore: 0, maxScore: 100, letter: "A", remark: "All", sortOrder: 0 },
  });
  await db.gradeScale.create({ data: { branchId: branch.id, name: "Own scale", isDefault: false } });
  await openTemplates(page);
  const row = page.getByRole("list", { name: "Coverage" }).getByRole("listitem").filter({ hasText: "SSS 3" });
  await expect(row).toContainText("Grades on: Nursery scale (the branch's default)");
  await row.getByRole("combobox", { name: "Grade scale of SSS 3" }).selectOption({ label: "Scale: Own scale" });
  await expect(page.getByText("SSS 3 now grades on its own scale.")).toBeVisible();
  await expect(row).toContainText("Grades on: Own scale (set for this class)");
  expect(await db.classGradeScale.count({ where: { gradeScale: { name: "Own scale" } } })).toBe(1);
  await row.getByRole("combobox", { name: "Grade scale of SSS 3" }).selectOption({ label: "Scale: template's, else the branch default" });
  await expect(page.getByText("SSS 3 grades on its template's scale again.")).toBeVisible();
  await expect(row).toContainText("Grades on: Nursery scale (the branch's default)");
  expect(await db.classGradeScale.count()).toBe(0);
  await expectAccessible(page, "the coverage list with grade scales");
});

test("the seeded junior scale shows the unconfirmed notice until its bands are confirmed", async ({ page }) => {
  const { branch } = await setUp(page);
  await ensureReportTemplates(branch.id);
  await openTemplates(page);
  const scales = page.getByRole("list", { name: "Grade scales" });
  const junior = scales.getByRole("listitem").filter({ hasText: "Junior secondary report card scale" });
  await expect(junior).toContainText("Please confirm these grade bands: they were set from the card, which prints no ranges");
  await expect(junior.getByText("Unconfirmed")).toBeVisible();
  await expect(scales.getByRole("listitem").filter({ hasText: "Senior secondary report card scale" })).not.toContainText(
    "Please confirm these grade bands",
  );
  await expectAccessible(page, "the grade scales with an unconfirmed scale");
  await junior.getByRole("button", { name: "Confirm the bands of Junior secondary report card scale" }).click();
  await expect(page.getByText("Junior secondary report card scale confirmed. Results graded on it can be published.")).toBeVisible();
  await expect(junior).not.toContainText("Please confirm these grade bands");
  expect(await db.gradeScale.count({ where: { unconfirmed: true } })).toBe(0);
});

test("a scale is duplicated and its bands edited in the same editor as Grading; the classes using a scale are named before it is changed", async ({
  page,
}) => {
  const { branch } = await setUp(page);
  await ensureReportTemplates(branch.id);
  await openTemplates(page);
  const scales = page.getByRole("list", { name: "Grade scales" });
  await scales.getByRole("button", { name: "Duplicate Senior secondary report card scale" }).click();
  const dup = page.getByRole("dialog", { name: "Duplicate Senior secondary report card scale" });
  await expect(dup.getByLabel("Scale name")).toHaveValue("Senior secondary report card scale copy");
  await expect(dup.getByLabel("Band 1 grade")).toHaveValue("F9");
  await expectAccessible(page, "the scale editor");
  await dup.getByLabel("Scale name").fill("Nursery scale");
  await dup.getByRole("button", { name: "Create scale" }).click();
  await expect(page.getByText("Nursery scale created.")).toBeVisible();
  await expect(scales.getByRole("listitem").filter({ hasText: "Nursery scale" })).toBeVisible();

  // Editing the junior scale names the classes that grade on it and confirms it when the bands are saved.
  const group = await db.classGroup.findFirstOrThrow({ where: { branchId: branch.id, name: "JSS 1" } });
  const junior = await db.gradeScale.findFirstOrThrow({ where: { branchId: branch.id, name: "Junior secondary report card scale" } });
  await db.classGradeScale.create({ data: { branchId: branch.id, classGroupId: group.id, gradeScaleId: junior.id } });
  await page.reload();
  const tab = page.getByRole("tab", { name: "Templates", exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await scales.getByRole("button", { name: "Edit bands of Junior secondary report card scale" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Junior secondary report card scale" });
  await expect(edit).toContainText("Classes grading on this scale: JSS 1.");
  await expect(edit).toContainText("Marks already entered keep the letters they were given");
  await edit.getByLabel("Band 4 from").fill("75");
  await edit.getByLabel("Band 3 to").fill("75");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Junior secondary report card scale saved.")).toBeVisible();
  expect((await db.gradeScale.findUniqueOrThrow({ where: { id: junior.id } })).unconfirmed).toBe(false);
});

test("the Classes tab chooses a class's grade scale beside its template", async ({ page }) => {
  const { branch } = await setUp(page);
  await db.resultTemplate.create({ data: { branchId: branch.id, name: "Template A", isDefault: true } });
  const scale = await db.gradeScale.create({ data: { branchId: branch.id, name: "Class scale", isDefault: true } });
  await db.gradeBand.create({
    data: { branchId: branch.id, scaleId: scale.id, minScore: 0, maxScore: 100, letter: "A", remark: "All", sortOrder: 0 },
  });
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  await clickAction(page, "Result template of Basic 1");
  const dlg = page.getByRole("dialog", { name: "Result template of Basic 1" });
  await dlg.getByLabel("Grade scale").selectOption({ label: "Class scale (branch default)" });
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Basic 1 uses the default template. Its grade scale is its own.")).toBeVisible();
  expect(await db.classGradeScale.count()).toBe(1);
});
