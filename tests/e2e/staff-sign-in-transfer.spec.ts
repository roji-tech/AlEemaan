import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0112 on screen (the maintainer, 2026-11-19): staff are invited from their records on Users > Staff (no e-mail copied), moved or added to another branch from the card's menu, an arm's
// class teacher is set on Academics > Classes, a list is exported, and a record is found from the top-bar search. Driven on a desktop and a phone.

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

async function setUp(page: Page) {
  const branch = await seedInstance();
  // A superadmin: every branch, so the transfer has somewhere to go.
  const admin = await createUser({ role: Role.ADMIN, name: "Sweep Admin" });
  await db.staffRecord.createMany({
    data: [
      {
        branchId: branch.id,
        category: "TEACHING",
        title: "Mrs",
        firstName: "Amina",
        lastName: "Yusuf",
        email: `amina-${Date.now()}@school.example`,
      },
      { branchId: branch.id, category: "NON_TEACHING", firstName: "Bala", lastName: "Musa", email: `bala-${Date.now()}@school.example` },
      { branchId: branch.id, category: "TEACHING", firstName: "Chika", lastName: "Obi" },
    ],
  });
  await signInThroughUi(page, admin);
  return { branch, admin };
}

test("Users > Staff: select everyone who can be invited and invite them, no e-mail typed; the cards then say Invited", async ({ page }) => {
  await setUp(page);
  await page.goto("/users?tab=staff");
  await expect(page.getByRole("heading", { level: 2, name: "Staff" })).toBeVisible();
  await page.getByRole("button", { name: "Select everyone who can be invited (2)" }).click();
  const bar = page.getByRole("region", { name: "Selected staff" });
  await expect(bar).toContainText("2 selected");
  await expectAccessible(page, "the staff tab with two selected");
  await bar.getByRole("button", { name: "Invite to sign in" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite 2 people to sign in" });
  await expect(dialog).toContainText("Amina Yusuf");
  await dialog.getByRole("button", { name: "Send 2 invitations" }).click();
  await expect(dialog).toContainText("2 sent");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("2 invitations sent.")).toBeVisible();
  const list = page.getByRole("list", { name: "Staff" });
  await expect(list.getByRole("listitem").filter({ hasText: "Amina Yusuf" })).toContainText(/Invited/);
  expect(await db.invitation.count({ where: { staffRecordId: { not: null } } })).toBe(2);
});

test("Invite someone points to the staff records", async ({ page }) => {
  await setUp(page);
  await page.goto("/users");
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByRole("dialog", { name: "Invite someone" }).getByRole("button", { name: "Choose from staff records" }).click();
  await expect(page).toHaveURL(/tab=staff/);
  await expect(page.getByRole("heading", { level: 2, name: "Staff" })).toBeVisible();
});

test("the card's menu adds a person to another branch; the card then says Also in", async ({ page }) => {
  const { branch } = await setUp(page);
  // A superadmin sees every branch, in name order: the address names the one with the records.
  await page.goto(`/academics?tab=staff&branch=${branch.id}`);
  await page.getByRole("button", { name: "Actions for Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Transfer Amina Yusuf or add them to another branch" }).click();
  const dialog = page.getByRole("dialog", { name: "Amina Yusuf: another branch" });
  await expectAccessible(page, "the transfer dialog");
  const target = await dialog.getByLabel("Branch").evaluate((el) => (el as HTMLSelectElement).selectedOptions[0].text);
  await dialog.getByRole("button", { name: "Add to branch" }).click();
  await expect(page.getByText(`Amina Yusuf now also works in ${target}.`)).toBeVisible();
  await expect(page.getByRole("list", { name: "Staff" }).getByRole("listitem").filter({ hasText: "Amina Yusuf" })).toContainText(
    `Also in: ${target}`,
  );
});

test("an arm's class teacher is set on the Classes tab and shown there", async ({ page }) => {
  const { branch } = await setUp(page);
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1", sortOrder: 1 } });
  await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  await page.getByRole("button", { name: "Class teacher of JSS 1 A: none yet. Change" }).click();
  const dialog = page.getByRole("dialog", { name: "Class teacher of JSS 1 A" });
  await dialog.getByLabel("Class teacher").selectOption({ label: "Mrs Amina Yusuf" });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Amina Yusuf is the class teacher of JSS 1 A.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Class teacher of JSS 1 A: Mrs Amina Yusuf. Change" })).toBeVisible();
});

test("Export: the subjects as CSV, with the template's header", async ({ page }) => {
  const { branch } = await setUp(page);
  await db.subject.createMany({
    data: [
      { branchId: branch.id, name: "English", code: "ENG" },
      { branchId: branch.id, name: "=SUM(A1)" },
    ],
  });
  await page.goto(`/academics?tab=subjects&branch=${branch.id}`);
  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export subjects" });
  await dialog.getByLabel("CSV").check();
  await expectAccessible(page, "the export dialog");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^subjects-.+-filtered-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile((await file.path())!, "utf8");
  expect(text.replace(/^﻿/, "").split("\r\n")[0]).toBe("Subject,Code");
  expect(text).toContain("'=SUM(A1)");
  await expect(dialog).toContainText("2 rows saved");
});

test("the top-bar search finds a member of staff and opens the list on them", async ({ page, isMobile }) => {
  test.skip(isMobile, "the field is in the top bar from the wide layout; the phone sheet uses the same box");
  await setUp(page);
  await page.goto("/dashboard");
  const field = page.getByRole("combobox", { name: "Find a page or setting" });
  await field.click();
  await field.fill("Amina Yusuf");
  const option = page.getByRole("option").filter({ hasText: "Mrs Amina Yusuf" });
  await expect(option).toContainText("Staff");
  await option.click();
  await expect(page).toHaveURL(/\/academics\?tab=staff&branch=.+&q=Amina\+Yusuf/);
  await expect(page.getByRole("searchbox", { name: "Search staff" })).toHaveValue("Amina Yusuf");
});
