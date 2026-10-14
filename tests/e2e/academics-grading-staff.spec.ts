import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Assessment and grading and Staff sections of the Academics page in a real browser (Slice P1d). A branch administrator builds an assessment scheme (and
// meets the server's sentence when the marks do not add up), applies the WAEC-style template to a grade scale and makes it the default, records a staff member,
// links a sign-in, assigns a subject to an arm and removes it; a teacher only looks. Axe (WCAG 2.2 A/AA) runs on each section and dialog in BOTH themes.
// Screenshots go to out/screenshots for the maintainer.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const SHOTS = "/home/rojitech/Desktop/CODEC/out/screenshots";
const dialog = (page: Page) => page.getByRole("dialog");

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `G${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  const starts = { startsWith: tag };
  await db.staffSubjectAssignment.deleteMany({ where: { staffRecord: { firstName: starts } } });
  await db.staffRecord.deleteMany({ where: { firstName: starts } });
  await db.subjectOffering.deleteMany({ where: { subject: { name: starts } } });
  await db.classArm.deleteMany({ where: { classGroup: { name: starts } } });
  await db.classGroup.deleteMany({ where: { name: starts } });
  await db.subject.deleteMany({ where: { name: starts } });
  await db.assessmentComponent.deleteMany({ where: { scheme: { name: starts } } });
  await db.assessmentScheme.deleteMany({ where: { name: starts } });
  await db.gradeBand.deleteMany({ where: { scale: { name: starts } } });
  await db.gradeScale.deleteMany({ where: { name: starts } });
});

async function openSection(page: Page, tab: string, role: Role = Role.ADMIN) {
  const user = await createUser({ role, superAdmin: false, name: `${tag} Teacher` }); // a branch administrator sees only the home branch, where the test data lives
  await signInThroughUi(page, user);
  await page.goto("/academics");
  await expect(page.getByRole("heading", { level: 1, name: "Academics" })).toBeVisible();
  await page.getByRole("tab", { name: tab }).click();
  return user;
}

for (const theme of ["dark", "light"] as const) {
  test(`assessment and grading: a scheme with the server's sentence, a template scale made default (${theme} theme)`, async ({
    page,
    baseURL,
  }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    await openSection(page, "Assessment and grading");
    await expect(page.getByRole("heading", { level: 2, name: "Assessment schemes" })).toBeVisible();
    await expect(page.getByText("No assessment schemes yet.")).toBeVisible();
    await expectAccessible(page, `grading section (${theme})`);

    await page.getByRole("button", { name: "New scheme" }).click();
    await dialog(page).getByLabel("Scheme name").fill(`${tag} Primary`);
    await dialog(page).getByLabel("Part 1 name").fill("Test 1");
    await dialog(page).getByLabel("Part 1 marks").fill("20");
    await dialog(page).getByRole("button", { name: "Add a part" }).click();
    await dialog(page).getByLabel("Part 2 name").fill("Test 2");
    await dialog(page).getByLabel("Part 2 marks").fill("20");
    await dialog(page).getByLabel("Exam marks").fill("50");
    await expect(dialog(page).getByText("Adds up to 90 of 100.")).toBeVisible();
    await expectAccessible(page, `new scheme dialog (${theme})`);
    await dialog(page).getByRole("button", { name: "Create scheme" }).click();
    await expect(dialog(page).getByText("The components and the exam must add up to the total exactly.")).toBeVisible(); // the server's own words
    await dialog(page).getByLabel("Exam marks").fill("60");
    await expect(dialog(page).getByText("Adds up to 100 of 100.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Create scheme" }).click();
    const scheme = page
      .getByRole("listitem")
      .filter({ hasText: `${tag} Primary` })
      .first();
    await expect(scheme).toContainText("Branch default");
    await expect(scheme).toContainText("Test 1 · 20");
    await expect(scheme).toContainText("Exam · 60");

    await page.getByRole("button", { name: "New grade scale" }).click();
    await dialog(page).getByLabel("Scale name").fill(`${tag} WAEC`);
    await dialog(page).getByRole("button", { name: "Use the WAEC-style template" }).click();
    await expect(dialog(page).getByLabel("Band 1 grade")).toHaveValue("F9");
    await expectAccessible(page, `new grade scale dialog (${theme})`);
    await dialog(page).getByRole("button", { name: "Create scale" }).click();
    const scale = page
      .getByRole("listitem")
      .filter({ hasText: `${tag} WAEC` })
      .first();
    await expect(scale).toContainText("F9");
    await expect(scale).toContainText("Default"); // the branch's first scale becomes its default
    await page.getByRole("button", { name: "New grade scale" }).click();
    await dialog(page).getByLabel("Scale name").fill(`${tag} Simple`);
    await dialog(page).getByLabel("Band 1 grade").fill("P");
    await dialog(page).getByLabel("Band 1 remark").fill("Pass");
    await dialog(page).getByRole("button", { name: "Create scale" }).click();
    const simple = page
      .getByRole("listitem")
      .filter({ hasText: `${tag} Simple` })
      .first();
    await expect(simple).not.toContainText("Default");
    await simple.getByRole("button", { name: `Make ${tag} Simple the default` }).click();
    await expect(page.getByText(`${tag} Simple is now the default.`)).toBeVisible();
    await expect(simple).toContainText("Default");
    await expect(scale).not.toContainText("Default");
    await expectAccessible(page, `grading section filled (${theme})`);
    await page.screenshot({ path: `${SHOTS}/aleemaan-grading-${theme}.png`, fullPage: true });

    await scheme.getByRole("button", { name: `Archive ${tag} Primary` }).click();
    await expect(page.getByText(`${tag} Primary archived.`)).toBeVisible();
    expect(await db.assessmentScheme.count({ where: { name: `${tag} Primary`, archivedAt: { not: null } } })).toBe(1); // archived, not deleted
  });

  test(`staff: record, link a sign-in, assign a subject to an arm, remove it (${theme} theme)`, async ({ page, baseURL }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const branch = await seedInstance();
    const group = await db.classGroup.create({ data: { branchId: branch.id, name: `${tag} JSS 1` } });
    await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
    const maths = await db.subject.create({ data: { branchId: branch.id, name: `${tag} Maths` } });
    await db.subjectOffering.create({ data: { branchId: branch.id, classGroupId: group.id, subjectId: maths.id } });
    const colleague = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Colleague` });
    await openSection(page, "Staff");
    await expect(page.getByRole("heading", { level: 2, name: "Staff" })).toBeVisible();
    await expectAccessible(page, `staff section (${theme})`);

    await page.getByRole("button", { name: "New staff record" }).click();
    await dialog(page).getByLabel("First name").fill(`${tag}Amina`);
    await dialog(page).getByLabel("Last name").fill("Bello");
    await dialog(page).getByLabel("Email (optional)").fill("not an email");
    await dialog(page).getByRole("button", { name: "Add staff record" }).click();
    await expect(dialog(page).getByText("That does not look like an email address.")).toBeVisible(); // the server's own words, at the field
    await expectAccessible(page, `staff record dialog with an error (${theme})`);
    await dialog(page).getByLabel("Email (optional)").fill("");
    await dialog(page).getByRole("button", { name: "Add staff record" }).click();
    const row = page
      .getByRole("listitem")
      .filter({ hasText: `${tag}Amina Bello` })
      .first();
    await expect(row).toContainText("Teaching · No sign-in · 0 assignments");

    await row.getByRole("button", { name: `Manage ${tag}Amina Bello` }).click();
    await expectAccessible(page, `manage dialog (${theme})`);
    await dialog(page).getByLabel("Link to a member").selectOption({ label: colleague.name });
    await dialog(page).getByRole("button", { name: "Link sign-in" }).click();
    await expect(dialog(page).getByText("Sign-in linked.")).toBeVisible();
    await expect(dialog(page).getByText(`Linked to ${colleague.name}.`)).toBeVisible();

    await dialog(page)
      .getByLabel("Class and arm")
      .selectOption({ label: `${tag} JSS 1 A` });
    await dialog(page)
      .getByLabel("Subject")
      .selectOption({ label: `${tag} Maths` });
    await dialog(page).getByRole("button", { name: "Assign" }).click();
    await expect(dialog(page).getByText(`${tag} Maths · ${tag} JSS 1 A`)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/aleemaan-staff-${theme}.png`, fullPage: true });
    await dialog(page)
      .getByRole("button", { name: `Remove ${tag} Maths in ${tag} JSS 1 A` })
      .click();
    await expect(dialog(page).getByText("No subjects assigned.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close" }).last().click();

    await row.getByRole("button", { name: `Archive ${tag}Amina Bello` }).click();
    await expect(page.getByText(`${tag}Amina Bello archived.`)).toBeVisible();
    expect(await db.staffRecord.count({ where: { firstName: `${tag}Amina`, archivedAt: { not: null } } })).toBe(1); // archived, not deleted
  });
}

test("a teacher sees the grading and staff lists but none of the controls; the tabs work from the keyboard", async ({ page }) => {
  const branch = await seedInstance();
  await db.staffRecord.create({ data: { branchId: branch.id, category: "TEACHING", firstName: `${tag}Look`, lastName: "Only" } });
  await openSection(page, "Staff", Role.TEACHING_STAFF);
  await expect(page.getByText(`${tag}Look Only`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^(New|Edit|Archive|Restore)/ })).toHaveCount(0);
  await page.getByRole("button", { name: `View ${tag}Look Only` }).click();
  await expect(dialog(page).getByRole("button", { name: /Unlink|Link sign-in|Assign|Remove/ })).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Close" }).last().click(); // the dialog also has its own X, named Close

  await page.getByRole("tab", { name: "Staff" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Assessment and grading" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /^New/ })).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Classes and subjects" })).toHaveAttribute("aria-selected", "true");
});
