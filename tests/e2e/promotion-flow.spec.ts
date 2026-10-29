import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import { EnrollmentStatus, Gender } from "@prisma/client";

// The promotion screens driven the way an administrator uses them, end to end: pick the sessions, preview, override two pupils with a reason (one with an arm chosen by hand),
// run the rollover, and read the audit history. The first UI spec (promotion-a11y) stops before executing and shows an empty history, which is how the console and the history
// view came to use field names the API does not (overrides lost their reason and arm; every non-empty history crashed on `initiatedByUser`).

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

async function setUp(opts: { later?: boolean; currentTerm?: 1 | 3 } = {}) {
  const { later = true, currentTerm = 3 } = opts;
  const branch = await db.branch.findFirstOrThrow();
  const admin = await createUser({ role: Role.ADMIN, name: "Ada Admin", superAdmin: false });
  const session = (label: string, start: string, end: string, status: "CLOSED" | "ACTIVE" | "PLANNED") =>
    db.academicSession.create({ data: { branchId: branch.id, label, startDate: new Date(start), endDate: new Date(end), status } });
  await session("2024/2025", "2024-09-01", "2025-07-20", "CLOSED");
  const s1 = await session("2025/2026", "2025-09-01", "2026-07-20", "ACTIVE");
  const s2 = later ? await session("2026/2027", "2026-09-01", "2027-07-20", "PLANNED") : null;
  for (const [ordinal, label, start, end] of [
    [1, "1st Term", "2025-09-01", "2025-12-15"],
    [2, "2nd Term", "2026-01-05", "2026-04-10"],
    [3, "3rd Term", "2026-04-27", "2026-07-20"],
  ] as const) {
    await db.academicPeriod.create({
      data: {
        branchId: branch.id,
        sessionId: s1.id,
        ordinal,
        label,
        startDate: new Date(start),
        endDate: new Date(end),
        isCurrent: ordinal === currentTerm,
      },
    });
  }
  const jss1 = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1", sortOrder: 1 } });
  const jss2 = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 2", sortOrder: 2 } });
  const arm = (classGroupId: string, name: string) => db.classArm.create({ data: { branchId: branch.id, classGroupId, name } });
  const jss1Gold = await arm(jss1.id, "Gold");
  const jss1Silver = await arm(jss1.id, "Silver");
  const jss2Gold = await arm(jss2.id, "Gold");
  const jss2Silver = await arm(jss2.id, "Silver");
  const pupil = async (admissionNo: string, firstName: string, lastName: string, classArm: { id: string; name: string }) => {
    const row = await db.studentRecord.create({
      data: { branchId: branch.id, firstName, lastName, gender: Gender.FEMALE, dateOfBirth: new Date("2013-05-10"), admissionNo },
    });
    await db.studentEnrollment.create({
      data: {
        studentId: row.id,
        branchId: branch.id,
        sessionId: s1.id,
        className: "JSS 1",
        arm: classArm.name,
        classArmId: classArm.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    return row;
  };
  const amina = await pupil("PF-001", "Amina", "Bello", jss1Gold);
  const binta = await pupil("PF-002", "Binta", "Sani", jss1Silver);
  return { branch, admin, s1, s2, amina, binta, jss2Gold, jss2Silver };
}

async function openConsole(page: import("@playwright/test").Page, admin: { email: string; password: string }) {
  await signInThroughUi(page, admin);
  await page.goto("/academics");
  const tab = page.getByRole("tab", { name: "Promotion & rollover", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test("the console starts on the right sessions, takes two overrides, runs the rollover, and the history tells the story", async ({
  page,
}) => {
  const d = await setUp();
  await openConsole(page, d.admin);

  // The list is newest first; the console must still evaluate the ACTIVE session and enrol into the one that begins after it.
  await expect(page.locator("#source-session-select")).toHaveValue(d.s1.id);
  await expect(page.locator("#target-session-select")).toHaveValue(d.s2!.id);

  await page.getByRole("button", { name: "Generate Promotion Preview" }).click();
  const table = page.getByRole("table", { name: "Student promotion preview" });
  await expect(table.getByText("Amina Bello")).toBeVisible();
  await expect(page.getByText("This session is not at its final term")).toHaveCount(0);

  // Neither pupil has results, so both are advised to repeat. Amina is promoted with the matching arm; Binta is promoted into an arm chosen by hand.
  await page.getByLabel("Final decision for Amina Bello").selectOption("PROMOTED");
  await expect(page.getByLabel("Target arm for Amina Bello")).toHaveValue(d.jss2Gold.id); // Gold -> Gold, shown before anything is chosen
  await page.getByLabel("Reason for overriding Amina Bello").fill("Strong exam, moved up");
  await page.getByLabel("Final decision for Binta Sani").selectOption("PROMOTED");
  await page.getByLabel("Target arm for Binta Sani").selectOption(d.jss2Gold.id);
  await page.getByLabel("Reason for overriding Binta Sani").fill("Moves with her sister");

  await page.getByRole("button", { name: /Review & Execute Rollover/ }).click();
  await page.getByRole("button", { name: "Confirm & Execute Promotion" }).click();
  await expect(page.getByText(/Successfully executed promotion for JSS 1! 2 promoted, 0 repeated\./)).toBeVisible();

  const amina = await db.studentEnrollment.findUniqueOrThrow({
    where: { studentId_sessionId: { studentId: d.amina.id, sessionId: d.s2!.id } },
  });
  const binta = await db.studentEnrollment.findUniqueOrThrow({
    where: { studentId_sessionId: { studentId: d.binta.id, sessionId: d.s2!.id } },
  });
  expect([amina.className, amina.classArmId]).toEqual(["JSS 2", d.jss2Gold.id]);
  expect([binta.className, binta.classArmId]).toEqual(["JSS 2", d.jss2Gold.id]); // her own choice, not Silver
  const record = await db.promotionRecord.findFirstOrThrow({ where: { studentId: d.binta.id } });
  expect(record.overrideReason).toBe("Moves with her sister");

  // History: the batch row, then its records.
  await page.getByRole("tab", { name: "Audit History" }).click();
  await expect(page.getByRole("heading", { name: "Promotion Audit Log" })).toBeVisible();
  const row = page.getByRole("row", { name: /2025\/2026/ });
  await expect(row).toContainText("2026/2027");
  await expect(row).toContainText("Ada Admin");
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);

  await row.getByRole("button", { name: "View Details" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Amina Bello")).toBeVisible();
  await expect(dialog.getByText("Override: Strong exam, moved up")).toBeVisible();
  await expect(dialog.getByText("Override: Moves with her sister")).toBeVisible();
  await expect(dialog.getByText("JSS 2 Gold").first()).toBeVisible(); // "Moved To"
  await expect(dialog.getByText("REPEATED").first()).toBeVisible(); // what the rule advised
  await expect(dialog.getByText("PROMOTED").first()).toBeVisible(); // what was done
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test("with no session after the source, the console says to create one and offers no preview", async ({ page }) => {
  const d = await setUp({ later: false });
  await openConsole(page, d.admin);
  await expect(page.locator("#source-session-select")).toHaveValue(d.s1.id);
  await expect(page.locator("#target-session-select")).toHaveValue("");
  await expect(page.getByText(/No academic session begins after 2025\/2026 yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Promotion Preview" })).toBeDisabled();
});

test("before the final term the preview and the confirmation both say so, and the rollover is still the administrator's call", async ({
  page,
}) => {
  const d = await setUp({ currentTerm: 1 });
  await openConsole(page, d.admin);
  await page.getByRole("button", { name: "Generate Promotion Preview" }).click();
  await expect(page.getByText("This session is not at its final term")).toBeVisible();
  await page.getByRole("button", { name: /Review & Execute Rollover/ }).click();
  await expect(page.getByRole("dialog").getByText(/Not at the final term/)).toBeVisible();
});
