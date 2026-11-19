import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0111 (the maintainer, 2026-11-19), on Academics > Staff: a title (Mr, Mrs…), gender, a job title for non-teaching staff, a qualification and an NYSC corps member tick on the
// form; the name opens everything about the person; the card shows the kind, the corps member badge and what they do; the Filters panel has kind, gender, corps member, sign-in and
// standing. Driven on a desktop and a phone (the two projects).

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

async function openStaff(page: Page) {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Staff Admin" });
  await db.staffRecord.createMany({
    data: [
      {
        branchId: branch.id,
        category: "TEACHING",
        title: "Mrs",
        firstName: "Amina",
        lastName: "Yusuf",
        gender: "FEMALE",
        qualification: "B.Ed. Mathematics",
        corpsMember: true,
        email: "amina.yusuf.long.address@example.com",
      },
      { branchId: branch.id, category: "NON_TEACHING", firstName: "Bala", lastName: "Musa", gender: "MALE", designation: "Bursar" },
      { branchId: branch.id, category: "TEACHING", firstName: "Chika", lastName: "Obi" },
    ],
  });
  await signInThroughUi(page, admin);
  await page.goto("/academics?tab=staff");
  await expect(page.getByRole("heading", { level: 2, name: "Staff" })).toBeVisible();
}

test("the card says what a person does and whether they are a corps member; the name opens all their details", async ({ page }) => {
  await openStaff(page);
  const list = page.getByRole("list", { name: "Staff" });
  const amina = list.getByRole("listitem").filter({ hasText: "Mrs Amina Yusuf" });
  await expect(amina).toContainText("Teaching · B.Ed. Mathematics");
  await expect(amina).toContainText("NYSC corps member");
  await expect(list.getByRole("listitem").filter({ hasText: "Bala Musa" })).toContainText("Bursar");
  await expectAccessible(page, "the staff list");

  await amina.getByRole("button", { name: "Details of Amina Yusuf" }).click();
  const details = page.getByRole("dialog", { name: "Mrs Amina Yusuf" });
  await expect(details).toBeVisible();
  for (const text of ["Female", "B.Ed. Mathematics", "amina.yusuf.long.address@example.com", "No sign-in"])
    await expect(details).toContainText(text);
  await expect(details.getByText("NYSC corps member").first()).toBeVisible();
  await expectAccessible(page, "a staff member's details");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(details).toBeHidden();
});

test("the Filters panel narrows by corps member, kind and gender, and Clear brings everyone back", async ({ page }) => {
  await openStaff(page);
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("combobox", { name: "NYSC corps member" }).selectOption("yes");
  await expect(page.getByText("1 staff record match")).toBeVisible();
  await page.getByRole("combobox", { name: "NYSC corps member" }).selectOption("");
  await page.getByLabel("Kind of staff").selectOption("NON_TEACHING");
  await expect(page.getByRole("list", { name: "Staff" }).getByRole("listitem")).toHaveCount(1);
  await page.getByLabel("Kind of staff").selectOption("");
  await page.getByLabel("Gender").selectOption("NONE");
  await expect(page.getByRole("list", { name: "Staff" }).getByRole("listitem").filter({ hasText: "Chika Obi" })).toBeVisible();
  await expect(page.getByText("1 staff record match")).toBeVisible();
  await page
    .getByRole("button", { name: /^Clear/ })
    .first()
    .click();
  await expect(page.getByText("3 staff records")).toBeVisible();
});

test("the form: title, gender, job title only for non-teaching staff, qualification and the corps member tick are saved", async ({
  page,
}) => {
  await openStaff(page);
  await page.getByRole("button", { name: "New staff record" }).click();
  const form = page.getByRole("dialog", { name: "New staff record" });
  await expect(form.getByLabel("Job title (optional)")).toHaveCount(0); // a teacher: not asked
  await form.getByLabel("Kind of staff").selectOption("NON_TEACHING");
  await form.getByLabel("Title (optional)", { exact: true }).fill("Mallam");
  await form.getByLabel("First name").fill("Dauda");
  await form.getByLabel("Last name").fill("Sule");
  await form.getByLabel("Gender (optional)").selectOption("MALE");
  await form.getByLabel("Job title (optional)").fill("Driver");
  await form.getByLabel("Qualification (optional)").fill("OND");
  await form.getByLabel("NYSC corps member").check();
  await expectAccessible(page, "the staff form");
  await form.getByRole("button", { name: "Add staff record" }).click();
  await expect(form).toBeHidden();
  const row = await db.staffRecord.findFirstOrThrow({ where: { firstName: "Dauda" } });
  expect(row).toMatchObject({
    title: "Mallam",
    gender: "MALE",
    designation: "Driver",
    qualification: "OND",
    corpsMember: true,
    category: "NON_TEACHING",
  });
  await expect(page.getByRole("list", { name: "Staff" }).getByRole("listitem").filter({ hasText: "Mallam Dauda Sule" })).toContainText(
    "Driver · OND",
  );
});
