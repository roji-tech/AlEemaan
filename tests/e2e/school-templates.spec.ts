import "../support/env";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { ensureReportTemplates } from "@/lib/results/seed-branch";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0120 on screen (the maintainer, 2026-11-20: "make all the templates I gave you school-wide templates"): the superadmin's Results > School templates (the four cards, edit to a new version,
// Update branches with the report of what happened), and a branch administrator's view (the school badge, Detach, and no School templates tab). Driven on a desktop and a phone, with axe.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}

const JUNIOR = "Junior Secondary (Year 7-9)";

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function branches() {
  await seedInstance();
  const [first, second] = await db.branch.findMany({ orderBy: { name: "asc" }, take: 2 });
  await ensureReportTemplates(first.id);
  await ensureReportTemplates(second.id);
  return { first, second };
}

/// Opens a Results tab. A tap that lands before the page's scripts are running is lost (seen on the phone), so tap until the tab is the selected one.
async function openTab(page: Page, name: string) {
  await page.goto("/results");
  const tab = page.getByRole("tab", { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

test("a superadmin sees the four school cards, edits one to version 2, and updates the branches that follow it", async ({ page }) => {
  const { first, second } = await branches();
  const boss = await createUser({ role: Role.ADMIN, name: "School Boss" }); // an administrator who is also a superadmin
  await signInThroughUi(page, boss);
  await openTab(page, "School templates");
  const list = page.getByRole("list", { name: "School templates" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  const card = list.getByRole("listitem").filter({ hasText: JUNIOR });
  await expect(card).toContainText("Version 1");
  await expect(card.getByRole("list", { name: `Branches that follow ${JUNIOR}` })).toContainText(`${first.name}: Up to date`);
  await expect(card).toContainText("bands to be confirmed"); // the junior cut-offs are still a guess
  await expectAccessible(page, "School templates");

  // Edit: a new version, and the branches are behind until updated.
  await clickAction(card, `Edit ${JUNIOR}`);
  const form = page.getByRole("dialog", { name: `Edit ${JUNIOR}` });
  await form.getByLabel("Description (optional)").fill("Junior card, from 2027");
  await expectAccessible(page, "the school template form");
  await form.getByRole("button", { name: "Save a new version" }).click();
  await expect(page.getByText(`${JUNIOR} saved as version 2.`)).toBeVisible();
  await expect(card).toContainText("Version 2");
  await expect(card.getByRole("list", { name: `Branches that follow ${JUNIOR}` })).toContainText(
    `${first.name}: Behind (v1, school has v2)`,
  );

  // Update branches: both are chosen (they are behind); the report says what happened to each.
  await clickAction(card, `Update branches to ${JUNIOR}`);
  const dialog = page.getByRole("dialog", { name: new RegExp(`Update branches to ${JUNIOR.replace(/[()]/g, "\\$&")} version 2`) });
  await expect(dialog.getByRole("checkbox", { name: new RegExp(first.name.replace(/[()]/g, "\\$&")) })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: new RegExp(second.name.replace(/[()]/g, "\\$&")) })).toBeChecked();
  await dialog.getByRole("button", { name: "Update branches" }).click();
  const report = dialog.getByRole("list", { name: "What happened" });
  await expect(report).toContainText(`${first.name}: Updated`);
  await expect(report).toContainText(`${second.name}: Updated`);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("2 of 2 branches updated.")).toBeVisible();
  await expect(card.getByRole("list", { name: `Branches that follow ${JUNIOR}` })).toContainText(`${first.name}: Up to date`);
  expect((await db.resultTemplate.findFirstOrThrow({ where: { branchId: first.id, layoutCode: "JUNIOR" } })).description).toBe(
    "Junior card, from 2027",
  );
});

test("a branch that changed its own copy is skipped, and replaced only when the superadmin ticks it", async ({ page }) => {
  const { first, second } = await branches();
  const boss = await createUser({ role: Role.ADMIN, name: "School Boss" });
  const row = await db.resultTemplate.findFirstOrThrow({ where: { branchId: second.id, layoutCode: "JUNIOR" } });
  await db.resultTemplate.update({ where: { id: row.id }, data: { description: "Our own words", localEditedAt: new Date() } }); // as a branch administrator's edit leaves it
  await signInThroughUi(page, boss);
  await openTab(page, "School templates");
  const card = page.getByRole("list", { name: "School templates" }).getByRole("listitem").filter({ hasText: JUNIOR });
  await expect(card.getByRole("list", { name: `Branches that follow ${JUNIOR}` })).toContainText(`${second.name}: Customised here`);
  await clickAction(card, `Edit ${JUNIOR}`);
  await page
    .getByRole("dialog", { name: `Edit ${JUNIOR}` })
    .getByLabel("Description (optional)")
    .fill("School words");
  await page
    .getByRole("dialog", { name: `Edit ${JUNIOR}` })
    .getByRole("button", { name: "Save a new version" })
    .click();
  await expect(page.getByText(`${JUNIOR} saved as version 2.`)).toBeVisible();

  await clickAction(card, `Update branches to ${JUNIOR}`);
  const dialog = page.getByRole("dialog", { name: /Update branches to/ });
  await expect(dialog.getByRole("checkbox", { name: `Replace local changes in ${second.name}` })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Update branches" }).click();
  const report = dialog.getByRole("list", { name: "What happened" });
  await expect(report).toContainText(`${first.name}: Updated`);
  await expect(report).toContainText(`${second.name}: Skipped: customised in the branch`);
  await dialog.getByRole("button", { name: "Done" }).click();
  expect((await db.resultTemplate.findUniqueOrThrow({ where: { id: row.id } })).description).toBe("Our own words");

  await clickAction(card, `Update branches to ${JUNIOR}`);
  const again = page.getByRole("dialog", { name: /Update branches to/ });
  await expect(again.getByRole("checkbox", { name: `${second.name} (Customised here, and behind)` })).toBeChecked(); // picked, as it is behind
  await again.getByRole("checkbox", { name: `Replace local changes in ${second.name}` }).check();
  await again.getByRole("button", { name: "Update branches" }).click();
  await expect(again.getByRole("list", { name: "What happened" })).toContainText(`${second.name}: Updated`);
  expect((await db.resultTemplate.findUniqueOrThrow({ where: { id: row.id } })).description).toBe("School words");
});

test("a branch administrator sees the school badge and can detach, and has no School templates tab", async ({ page }) => {
  const { first } = await branches();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" });
  await db.membership.deleteMany({ where: { userId: admin.id } });
  await db.membership.create({ data: { userId: admin.id, branchId: first.id, role: Role.ADMIN } });
  await signInThroughUi(page, admin);
  await openTab(page, "Templates");
  await expect(page.getByRole("tab", { name: "School templates" })).toHaveCount(0);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: JUNIOR }) });
  await expect(card).toContainText("School template · Up to date");
  await expect(card).toContainText("From the school template");
  await clickAction(card, `Detach ${JUNIOR} from the school template`);
  const dialog = page.getByRole("dialog", { name: `Detach ${JUNIOR} from the school template` });
  await expectAccessible(page, "the detach confirmation");
  await dialog.getByRole("button", { name: "Detach" }).click();
  await expect(page.getByText(`${JUNIOR} no longer follows the school template.`)).toBeVisible();
  await expect(card).not.toContainText("School template ·");
  expect((await db.resultTemplate.findFirstOrThrow({ where: { branchId: first.id, layoutCode: "JUNIOR" } })).schoolTemplateId).toBeNull();
});
