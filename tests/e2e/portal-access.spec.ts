import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { DEFAULT_PORTAL_ACCESS, PORTAL_ACCESS_KEY, type PortalAccess } from "@/lib/portal/access";
import { signInThroughUi } from "./helpers";

// What a pupil and a guardian see in the portal, and the Settings screen that decides it (task 0040), in a real browser on a desktop and a phone, in both themes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} (${theme})`,
    ).toEqual([]);
  }
  await page.evaluate(() => void (document.documentElement.dataset.theme = "dark"));
}
const noSideways = async (page: Page, what: string) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${what} scrolls sideways`).toBe(true);

const DOB = "2013-05-10";
const PHONE = "08011110001";

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  const branch = await seedInstance();
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: { branchId: branch.id, sessionId: session.id, ordinal: 1, label: "1st Term", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15"), isCurrent: true },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "Gold" } });
  const mk = (admissionNo: string, firstName: string, dateOfBirth: string) =>
    db.studentRecord.create({
      data: { branchId: branch.id, firstName, lastName: "Musa", gender: Gender.FEMALE, dateOfBirth: new Date(dateOfBirth), admissionNo, guardianPhone: "+2348011110001" },
    });
  const s1 = await mk("2026/0001", "Amina", DOB);
  const s2 = await mk("2026/0002", "Binta", "2015-02-03");
  for (const s of [s1, s2]) {
    await db.studentEnrollment.create({
      data: { studentId: s.id, branchId: branch.id, sessionId: session.id, className: "JSS 1", arm: "Gold", classArmId: arm.id, status: "ACTIVE" },
    });
  }
  await db.invoice.create({
    data: { branchId: branch.id, studentId: s1.id, periodId: period.id, invoiceNo: "INV-2026-0001", totalAmount: 45000, amountPaid: 20000, status: "PARTIALLY_PAID" },
  });
  const subject = await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
  await db.assignment.create({ data: { branchId: branch.id, subjectId: subject.id, title: "Essay on honesty", status: "PUBLISHED", dueDate: new Date(Date.now() + 864e5) } });
  const quiz = await db.quiz.create({ data: { branchId: branch.id, subjectId: subject.id, title: "Week 1 quiz", status: "PUBLISHED", passingScore: 50 } });
  await db.quizQuestion.create({
    data: {
      branchId: branch.id,
      quizId: quiz.id,
      prompt: "What is 2+2?",
      questionType: "MULTIPLE_CHOICE",
      options: [
        { id: "A", text: "Three" },
        { id: "B", text: "Four" },
      ],
      correctAnswer: "B",
    },
  });
});

async function portalSignIn(page: Page, secret: string) {
  await page.goto("/portal");
  await page.fill("#admissionNo", "2026/0001");
  await page.fill("#secret", secret);
  await page.click("button:has-text('Access Student Portal')");
  await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
}
const tab = (page: Page, name: string) => page.getByRole("tab", { name });

test.describe("the portal", () => {
  test("a pupil gets overview, results and coursework; no fees, no fee figure, no sibling selector", async ({ page }) => {
    await portalSignIn(page, DOB);
    await expect(tab(page, "Overview")).toBeVisible();
    await expect(tab(page, "Academic Results")).toBeVisible();
    await expect(tab(page, "Coursework (LMS)")).toBeVisible();
    await expect(tab(page, "Fees & Billing")).toHaveCount(0);
    await expect(page.getByText("School Fee Balance")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fees & Billing" })).toHaveCount(0);
    await expect(page.locator("#siblingSelect")).toHaveCount(0);
    await expectAccessible(page, "the pupil's overview");
    await noSideways(page, "the pupil's overview");

    await tab(page, "Coursework (LMS)").click();
    await expect(page.getByRole("button", { name: "Hand in: Essay on honesty" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start: Week 1 quiz" })).toBeVisible();
    await expectAccessible(page, "the pupil's coursework");
  });

  test("a guardian gets fees and every linked child; reads the coursework but cannot hand in or take the quiz", async ({ page }) => {
    await portalSignIn(page, PHONE);
    await expect(tab(page, "Fees & Billing")).toBeVisible();
    await expect(page.getByText("School Fee Balance")).toBeVisible();
    const siblings = page.locator("#siblingSelect");
    await expect(siblings).toBeVisible();
    await expect(siblings).toContainText("Amina Musa");
    await expect(siblings).toContainText("Binta Musa");
    await expectAccessible(page, "the guardian's overview");

    await tab(page, "Fees & Billing").click();
    await expect(page.getByText("INV-2026-0001")).toBeVisible();

    await tab(page, "Coursework (LMS)").click();
    await expect(page.getByText("Essay on honesty")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Hand in/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Quizzes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Start/ })).toHaveCount(0);
    await expectAccessible(page, "the guardian's coursework");
    await noSideways(page, "the guardian's coursework");
  });

  test("with fees blocking report cards, a pupil is told it is not available yet, with no amount and no way to the invoices", async ({ page }) => {
    await db.settingValue.create({ data: { scope: "GLOBAL", key: "block_unpaid_report_cards", value: true, status: "APPROVED" } });
    await portalSignIn(page, DOB);
    await tab(page, "Academic Results").click();
    await expect(page.getByText("This report card is not available yet. Please ask your guardian or the school office.")).toBeVisible();
    await expect(page.getByText(/₦/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Pay Fees/ })).toHaveCount(0);

    await page.locator("button:has-text('Sign Out'):visible").click();
    await portalSignIn(page, PHONE);
    await tab(page, "Academic Results").click();
    await expect(page.getByText("₦25,000")).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay Fees/ })).toBeVisible();
  });
});

test.describe("the Settings screen", () => {
  const panel = (page: Page) => page.getByRole("heading", { name: "Portal access", level: 2 });
  const box = (page: Page, who: string, area: string) => page.getByRole("checkbox", { name: `${who}: ${area}` });

  async function open(page: Page) {
    const admin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Portal access" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(box(page, "Pupil", "Overview")).toBeVisible();
  }

  test("it shows the recommended table; ticking fees for pupils and saving changes what a pupil sees, and the change is on the list", async ({ page }) => {
    await open(page);
    // the maintainer's table
    await expect(box(page, "Pupil", "Fees and invoices")).not.toBeChecked();
    await expect(box(page, "Guardian", "Fees and invoices")).toBeChecked();
    await expect(box(page, "Guardian", "Hand in assignments")).not.toBeChecked();
    await expect(box(page, "Pupil", "Take quizzes")).toBeChecked();
    await expect(box(page, "Pupil", "Other children who share the guardian's contact")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled(); // nothing to save yet
    await expect(page.getByText("Nothing has been changed for this branch.")).toBeVisible();
    await expectAccessible(page, "the Portal access panel");
    await noSideways(page, "the Portal access panel");

    await box(page, "Pupil", "Fees and invoices").check();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. It applies to every portal sign-in from now on.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Sue Superadmin" })).toBeVisible();
    await expect(page.getByText("Gave more access")).toBeVisible();
    const row = await db.settingValue.findFirstOrThrow({ where: { key: PORTAL_ACCESS_KEY } });
    expect((row.value as unknown as PortalAccess).pupil.invoices).toBe(true);

    // a reload shows the saved value; the pupil now has the fees section
    await page.reload();
    await page.getByRole("button", { name: "Portal access" }).click();
    await expect(box(page, "Pupil", "Fees and invoices")).toBeChecked();
    await page.context().clearCookies();
    await portalSignIn(page, DOB);
    await expect(tab(page, "Fees & Billing")).toBeVisible();
  });

  test("a combination that leaves someone with nothing is refused in words, the practice choice is kept, and the recommended settings come back with one button", async ({ page }) => {
    await open(page);
    for (const area of ["Overview", "Academic results and report cards", "Fees and invoices", "Coursework and learning materials", "Hand in assignments", "Take quizzes"]) {
      const checkbox = box(page, "Guardian", area);
      if (await checkbox.isChecked()) await checkbox.uncheck();
    }
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "needs at least one section" })).toBeVisible();
    expect(await db.settingValue.count({ where: { key: PORTAL_ACCESS_KEY } })).toBe(0);

    await page.getByLabel("Pupil: question practice").selectOption("NONE");
    await page.getByRole("button", { name: "Use the recommended settings" }).click();
    await expect(box(page, "Guardian", "Overview")).toBeChecked();
    await expect(page.getByLabel("Pupil: question practice")).toHaveValue("FULL");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled(); // back to what is stored
  });

  test("discarding drops unsaved changes", async ({ page }) => {
    await open(page);
    await box(page, "Guardian", "Take quizzes").check();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(box(page, "Guardian", "Take quizzes")).not.toBeChecked();
    expect(DEFAULT_PORTAL_ACCESS.guardian.takeQuizzes).toBe(false);
  });
});
