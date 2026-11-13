import AxeBuilder from "@axe-core/playwright";
import * as fs from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { resetDatabase } from "../support/db";
import { GUARDIAN_PHONE, PUPIL_SECRET, REMARKS, SCHOOL, publishedWorld } from "../support/published-result";

// The report card in the portal, in a real browser on a desktop and a phone (task 0072): it is the card the school hands out, with the school's name, the class group and arm, the legend, the
// position and the remarks the school wrote; no remark is made up when none was written; and the card a pupil downloads is the same one.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.afterAll(async () => {
  await resetDatabase();
});

async function openResults(page: Page, admissionNo: string, secret: string) {
  await page.goto("/portal");
  await page.fill("#admissionNo", admissionNo);
  await page.fill("#secret", secret);
  await page.click("button:has-text('Access Student Portal')");
  await page.getByRole("tab", { name: "Academic Results" }).click();
}

test.describe("the portal's report card", () => {
  test("a pupil reads the school's card: the school, the class group and arm, the position, the legend and the remarks; it is accessible in both themes", async ({
    page,
  }) => {
    const { w } = await publishedWorld();
    await openResults(page, w.student.admissionNo, PUPIL_SECRET);
    const card = page.getByRole("article", { name: `Report card for ${w.student.firstName} ${w.student.lastName}` });
    await expect(card.getByRole("heading", { level: 2, name: SCHOOL.name })).toBeVisible();
    await expect(card).toContainText(SCHOOL.motto);
    await expect(card).toContainText(`${w.group.name} A`);
    await expect(card).toContainText(w.subject.name);
    await expect(card.getByText("Position")).toBeVisible();
    await expect(card).toContainText("A 70–100 Excellent");
    await expect(card).toContainText(REMARKS.teacher);
    await expect(card).toContainText(REMARKS.principal);
    // the term chooser names the class group as well as the arm
    await expect(page.getByLabel("Select Academic Term:")).toContainText(`${w.group.name} A`);
    for (const theme of ["dark", "light"]) {
      await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
        `accessibility on the portal's report card [${theme}]`,
      ).toEqual([]);
    }
  });

  test("a guardian reads the same card, and the card a person downloads is the school's: its name, principal, legend and class", async ({
    page,
  }) => {
    const { w } = await publishedWorld();
    await openResults(page, w.student.admissionNo, GUARDIAN_PHONE);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Card" }).click();
    const file = await (await download).path();
    const html = fs.readFileSync(file, "utf8");
    for (const text of [SCHOOL.name, SCHOOL.principal, `${w.group.name} A`, "Excellent", REMARKS.teacher, REMARKS.principal])
      expect(html, text).toContain(text);
  });

  test("when no remark was written the card says so with a dash: the portal no longer makes one up in the teacher's and the principal's name", async ({
    page,
  }) => {
    const { w } = await publishedWorld({ remarks: false });
    await openResults(page, w.student.admissionNo, PUPIL_SECRET);
    const card = page.getByRole("article", { name: /^Report card for/ });
    await expect(card).toBeVisible();
    await expect(page.getByText(/Commendable performance|Promising results/)).toHaveCount(0);
    await expect(card.getByText("—")).not.toHaveCount(0);
  });
});
