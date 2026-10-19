import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Students screen in a real browser (Slice UI1): a branch administrator registers a pupil (with the server's namesake refusal and the audited "register
// anyway"), edits, archives and restores, and imports a small spreadsheet; a teacher only looks. Axe (WCAG 2.2 A/AA) runs on the list and each dialog in BOTH themes.
// Runs on desktop and phone viewports (the e2e-mobile project). Screenshots go to out/screenshots for the maintainer.

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

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `S${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  const starts = { startsWith: tag };
  await db.studentEnrollment.deleteMany({ where: { student: { firstName: starts } } });
  await db.studentRecord.deleteMany({ where: { firstName: starts } });
  await db.classArm.deleteMany({ where: { classGroup: { name: starts } } });
  await db.classGroup.deleteMany({ where: { name: starts } });
  await db.academicSession.deleteMany({ where: { label: `${tag} session` } });
});

for (const theme of ["dark", "light"] as const) {
  test(`students: register, namesake confirm, edit, archive, restore, import (${theme} theme)`, async ({ page, baseURL }, info) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const branch = await seedInstance();
    await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: `${tag} session`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
        status: "ACTIVE",
      },
    });
    const group = await db.classGroup.create({ data: { branchId: branch.id, name: `${tag} JSS 1` } });
    await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: `${tag} Admin` });
    await signInThroughUi(page, admin);
    await page.goto("/students");
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
    await expectAccessible(page, `students list (${theme})`);

    // Register one, in a class.
    await page.getByRole("button", { name: "New student" }).click();
    await dialog(page).getByLabel("First name", { exact: true }).fill(`${tag}Amina`);
    await dialog(page).getByLabel("Last name").fill("Yusuf");
    await dialog(page).getByLabel("Gender").selectOption("FEMALE");
    await dialog(page).getByLabel("Date of birth").fill("2014-03-21");
    await dialog(page).getByLabel("Class (optional)").selectOption(`${tag} JSS 1`);
    await dialog(page).getByLabel("Arm").selectOption("A");
    await dialog(page).getByLabel("Guardian name (optional)").fill("Mr Yusuf");
    await expectAccessible(page, `new student dialog (${theme})`);
    await dialog(page).getByRole("button", { name: "Register student" }).click();
    const row = page.getByRole("listitem").filter({ hasText: `${tag}Amina` });
    await expect(row).toContainText(`${tag} JSS 1 A`);
    await expect(row).toContainText("Guardian Mr Yusuf");
    await page.screenshot({ path: path.join(SHOTS, `students-list-${theme}-${info.project.name}.png`) });

    // The same name and birth date again: refused until the administrator confirms; the confirmation is audited.
    await page.getByRole("button", { name: "New student" }).click();
    await dialog(page).getByLabel("First name", { exact: true }).fill(`${tag}Amina`);
    await dialog(page).getByLabel("Last name").fill("Yusuf");
    await dialog(page).getByLabel("Gender").selectOption("FEMALE");
    await dialog(page).getByLabel("Date of birth").fill("2014-03-21");
    await dialog(page).getByRole("button", { name: "Register student" }).click();
    await expect(dialog(page).getByText(/already exists/)).toBeVisible();
    await expectAccessible(page, `namesake refusal (${theme})`);
    await dialog(page).getByRole("button", { name: "Register anyway" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: `${tag}Amina` })).toHaveCount(2);
    expect(
      await db.auditLog.count({ where: { action: "STUDENT_CREATED", afterValue: { path: ["duplicateOverridden"], equals: true } } }),
    ).toBeGreaterThanOrEqual(1);

    // Edit the first, archive it, find it under Archived, restore it.
    await page
      .getByRole("button", { name: `Edit ${tag}Amina Yusuf` })
      .first()
      .click();
    await dialog(page).getByLabel("Guardian phone (optional)").fill("08030000000");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    // Two pupils now share the name and birth date, so saving either asks again before it goes through.
    await expect(dialog(page).getByText(/Another student with this name/)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Save anyway" }).click();
    await expect(page.getByText(`${tag}Amina Yusuf saved.`)).toBeVisible();
    await page
      .getByRole("button", { name: `Archive ${tag}Amina Yusuf` })
      .first()
      .click();
    await expect(page.getByText(`${tag}Amina Yusuf archived.`)).toBeVisible();
    await page.getByLabel("Show").selectOption("archived");
    await expect(page.getByRole("button", { name: `Restore ${tag}Amina Yusuf` })).toBeVisible();
    await page.getByRole("button", { name: `Restore ${tag}Amina Yusuf` }).click();
    // A current namesake exists, so restoring asks before it goes through.
    await expect(page.getByText(/An active student with this name/)).toBeVisible();
    await page.getByRole("button", { name: "Restore anyway" }).click();
    await expect(page.getByText(`${tag}Amina Yusuf restored.`)).toBeVisible();
    await page.getByLabel("Show").selectOption("live");

    // Import: one good line, one bad line (reported by line number before anything is sent).
    await page.getByRole("button", { name: "Import from spreadsheet" }).click();
    await dialog(page)
      .getByLabel("Or paste the rows here")
      .fill(
        `firstName,lastName,gender,dateOfBirth,className,arm\n${tag}Musa,Bello,M,2013-12-01,${tag} JSS 1,A\n${tag}X,Y,Q,2013-02-31,,\n`,
      );
    await expect(dialog(page).getByText("1 ready to import, 1 with problems.")).toBeVisible();
    await expect(dialog(page).getByText(/Line 3:/)).toBeVisible();
    await expectAccessible(page, `import dialog (${theme})`);
    await dialog(page).getByRole("button", { name: "Import 1 students" }).click();
    await expect(page.getByText(/Imported 1 students into/)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: `${tag}Musa` })).toContainText(`${tag} JSS 1 A`);
  });
}

test("students: a teacher can look but has no buttons that change anything", async ({ page }) => {
  const branch = await seedInstance();
  await db.studentRecord.create({
    data: {
      branchId: branch.id,
      firstName: `${tag}Look`,
      lastName: "Only",
      gender: "MALE",
      dateOfBirth: new Date("2013-05-05"),
      admissionNo: `${tag}/1`,
    },
  });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false, name: `${tag} Teacher` });
  await signInThroughUi(page, teacher);
  await page.goto("/students");
  await expect(page.getByRole("listitem").filter({ hasText: `${tag}Look` })).toBeVisible();
  await expect(page.getByRole("button", { name: "New student" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit |^Archive / })).toHaveCount(0);
  await expectAccessible(page, "students list as a teacher");
  await db.studentRecord.deleteMany({ where: { firstName: { startsWith: tag } } });
});
