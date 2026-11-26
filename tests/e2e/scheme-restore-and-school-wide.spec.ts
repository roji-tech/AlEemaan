import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0128 on screen (Academics > Assessment and grading): an archived scheme and an archived grade scale are shown on request and brought back with Restore; the school-wide default is edited
// (a CA added, the sum kept at 100); and a branch with no scheme of its own copies the school-wide one with "Use the school-wide scheme", after which marks entry has a scheme. Desktop and phone, axe.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}
const dialog = (page: Page) => page.getByRole("dialog");
test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp() {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Scheme Boss" });
  return { branch, sup };
}

test("an archived scheme and grade scale are shown on request and restored", async ({ page }) => {
  const { branch, sup } = await setUp();
  await db.assessmentScheme.create({
    data: { branchId: branch.id, name: "Old default", totalMax: 100, examMax: 60, archivedAt: new Date() },
  });
  await db.gradeScale.create({ data: { branchId: branch.id, name: "Live scale", isDefault: true } });
  await db.gradeScale.create({ data: { branchId: branch.id, name: "Old scale", archivedAt: new Date() } });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=grading&branch=${branch.id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Assessment schemes" })).toBeVisible();
  await expect(page.getByText("Old default")).toHaveCount(0);

  await page.getByLabel("Show archived schemes and grade scales").check();
  const scheme = page.getByRole("listitem").filter({ hasText: "Old default" });
  await expect(scheme).toContainText("Archived");
  await expectAccessible(page, "the grading tab with archived items");
  await page.getByRole("button", { name: "Restore Old default" }).click();
  await expect(page.getByText("Old default restored.")).toBeVisible();
  expect((await db.assessmentScheme.findFirstOrThrow({ where: { name: "Old default" } })).archivedAt).toBeNull();

  await page.getByRole("button", { name: "Restore Old scale" }).click();
  await expect(page.getByText("Old scale restored.")).toBeVisible();
  const scale = await db.gradeScale.findFirstOrThrow({ where: { name: "Old scale" } });
  expect([scale.archivedAt, scale.isDefault]).toEqual([null, false]);
});

test("a restore that cannot happen says why on screen and changes nothing", async ({ page }) => {
  const { branch, sup } = await setUp();
  await db.assessmentScheme.create({
    data: { branchId: branch.id, name: "Old default", totalMax: 100, examMax: 60, archivedAt: new Date() },
  });
  await db.assessmentScheme.create({ data: { branchId: branch.id, name: "New default", totalMax: 100, examMax: 60 } });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=grading&branch=${branch.id}`);
  await page.getByLabel("Show archived schemes and grade scales").check();
  await page.getByRole("button", { name: "Restore Old default" }).click();
  await expect(page.getByText(/already has a default scheme/)).toBeVisible();
  expect((await db.assessmentScheme.findFirstOrThrow({ where: { name: "Old default" } })).archivedAt).not.toBeNull();
});

test("the school-wide default is edited, and a branch with no scheme of its own copies it", async ({ page }) => {
  const { branch, sup } = await setUp();
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=grading&branch=${branch.id}`);
  // Make the school-wide default (the screen the maintainer had: two CAs of 20 and an exam of 60).
  await page.getByRole("button", { name: "New school-wide scheme" }).click();
  await dialog(page).getByLabel("Scheme name").fill("General School-wide Schema");
  await dialog(page).getByLabel("Part 1 name").fill("CA 1");
  await dialog(page).getByLabel("Part 1 marks").fill("20");
  await dialog(page).getByRole("button", { name: "Add a part" }).click();
  await dialog(page).getByLabel("Part 2 name").fill("CA 2");
  await dialog(page).getByLabel("Part 2 marks").fill("20");
  await dialog(page).getByLabel("Exam marks").fill("60");
  await dialog(page)
    .getByLabel(/This is the school-wide default scheme/)
    .check();
  await dialog(page).getByRole("button", { name: "Save scheme" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Edit it: 4 CAs of 10 and an exam of 60.
  await page.getByRole("button", { name: "Edit the school-wide scheme General School-wide Schema" }).click();
  const edit = dialog(page);
  await expect(edit.getByLabel("Scheme name")).toHaveValue("General School-wide Schema");
  await expect(edit.getByLabel(/This is the school-wide default scheme/)).toBeChecked();
  await edit.getByLabel("Part 1 marks").fill("10");
  await edit.getByLabel("Part 2 marks").fill("10");
  await edit.getByRole("button", { name: "Add a part" }).click();
  await edit.getByLabel("Part 3 name").fill("CA 3");
  await edit.getByLabel("Part 3 marks").fill("10");
  await edit.getByRole("button", { name: "Add a part" }).click();
  await edit.getByLabel("Part 4 name").fill("CA 4");
  await edit.getByLabel("Part 4 marks").fill("10");
  await expect(edit.getByText("Adds up to 100 of 100.")).toBeVisible();
  await expectAccessible(page, "the school-wide scheme edit dialog");
  await edit.getByRole("button", { name: "Save scheme" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "General School-wide Schema" }).first()).toContainText(
    "CA 1 10 + CA 2 10 + CA 3 10 + CA 4 10 + Exam 60 = 100",
  );

  // The branch has no scheme of its own yet: copy the school-wide one.
  await expect(page.getByRole("button", { name: "Use the school-wide scheme" })).toBeVisible();
  await page.getByRole("button", { name: "Use the school-wide scheme" }).click();
  await expect(page.getByText("The school-wide scheme is now this branch's default.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use the school-wide scheme" })).toHaveCount(0);
  const copy = await db.assessmentScheme.findFirstOrThrow({
    where: { branchId: branch.id, hosted: false, classGroupId: null },
    include: { components: true },
  });
  expect(copy.components).toHaveLength(4);
  expect(Number(copy.examMax)).toBe(60);
});

test("a scheme connected to nothing is deleted after a confirmation; one in use has no Delete, and one a template holds is refused in words", async ({
  page,
}) => {
  const { branch, sup } = await setUp();
  const unused = await db.assessmentScheme.create({ data: { branchId: branch.id, name: "Unused scheme", totalMax: 100, examMax: 60 } });
  await db.assessmentComponent.create({ data: { branchId: branch.id, schemeId: unused.id, name: "CA", maxScore: 40, sortOrder: 0 } });
  const used = await db.assessmentScheme.create({
    data: {
      branchId: branch.id,
      name: "Used scheme",
      totalMax: 100,
      examMax: 60,
      lockedAt: new Date(),
      classGroupId: (await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } })).id,
    },
  });
  const held = await db.assessmentScheme.create({
    data: {
      branchId: branch.id,
      name: "Held scheme",
      totalMax: 100,
      examMax: 60,
      classGroupId: (await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 2" } })).id,
    },
  });
  await db.resultTemplate.create({ data: { branchId: branch.id, name: "Card holding it", schemeId: held.id } });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=grading&branch=${branch.id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Assessment schemes" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Delete Used scheme" })).toHaveCount(0); // marks use it: archive is the only way out
  await expect(page.getByRole("button", { name: "Archive Used scheme" })).toBeVisible();

  // cancelling removes nothing
  await page.getByRole("button", { name: "Delete Unused scheme" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Delete Unused scheme?" })).toBeVisible();
  await expectAccessible(page, "the delete confirmation");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  expect(await db.assessmentScheme.count({ where: { id: unused.id } })).toBe(1);

  // the server's reason is shown in the dialog and nothing is removed
  await page.getByRole("button", { name: "Delete Held scheme" }).click();
  await dialog(page).getByRole("button", { name: "Delete Held scheme for good" }).click();
  await expect(dialog(page).getByText(/report-card template uses this scheme/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  expect(await db.assessmentScheme.count({ where: { id: held.id } })).toBe(1);

  // confirmed: gone for good, with its parts
  await page.getByRole("button", { name: "Delete Unused scheme" }).click();
  await dialog(page).getByRole("button", { name: "Delete Unused scheme for good" }).click();
  await expect(page.getByText("Unused scheme deleted.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Unused scheme" })).toHaveCount(0);
  expect(await db.assessmentScheme.count({ where: { id: unused.id } })).toBe(0);
  expect(await db.assessmentComponent.count({ where: { schemeId: unused.id } })).toBe(0);
  expect(await db.assessmentScheme.count({ where: { id: used.id } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: "ASSESSMENT_SCHEME_DELETED", targetId: unused.id } })).toBe(1);
});
