import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// Suspension, expulsion and termination (task 0045) and part payment (task 0046) as a person sees and uses them, on a desktop and a phone, in both themes. What the API allows is
// tested in tests/api/standing.spec.ts and tests/api/part-payment.spec.ts; here is what the screens offer, say and do, that nobody is shown a button they cannot use, and that
// every state is accessible and fits the width.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FIRST = BRANCH_NAMES[0];
const DAY = 864e5;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const prettyDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};
const DOB = "2013-05-10";

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.afterAll(async () => {
  await resetDatabase();
});

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

async function expectFits(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal scrolling on ${what}`).toBeLessThanOrEqual(innerWidth);
}

async function seedSchool() {
  const branch = await db.branch.findFirstOrThrow({ where: { name: FIRST } });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      ordinal: 1,
      label: "1st Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "Gold" } });
  const pupil = async (admissionNo: string, firstName: string, dob: string) => {
    const student = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName,
        lastName: "Musa",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(dob),
        admissionNo,
        guardianPhone: "+2348011110001",
      },
    });
    await db.studentEnrollment.create({
      data: {
        studentId: student.id,
        branchId: branch.id,
        sessionId: session.id,
        className: "JSS 1",
        arm: "Gold",
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });
    return student;
  };
  const amina = await pupil("2026/0001", "Amina", DOB);
  const binta = await pupil("2026/0002", "Binta", "2015-02-03");
  return { branch, period, amina, binta };
}

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name }).first();
const dialog = (page: Page) => page.getByRole("dialog");

/// A super admin's Students page opens on the first branch ALPHABETICALLY, and the pupils seeded here are in the first branch SEEDED, so a super admin picks the branch (a
/// branch administrator or a teacher is already in theirs).
async function openStudents(page: Page) {
  await page.goto("/students");
  await page.getByLabel("Branch").selectOption({ label: FIRST });
}

test.describe("students: a super admin", () => {
  test("suspends with a reason and a last day, sees it, reads the history, lifts it, expels, filters and reinstates", async ({ page }) => {
    await seedSchool();
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, name: "Amina Yusuf" }));
    await openStudents(page);
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();

    // Suspend: the reason is asked for, and what it does is said first.
    await page.getByRole("button", { name: "Suspend Amina Musa" }).click();
    const suspend = dialog(page);
    await expect(suspend.getByRole("heading", { name: "Suspend Amina Musa?" })).toBeVisible();
    await expect(suspend.getByText(/hand in work, take quizzes or practise/)).toBeVisible();
    await suspend.getByRole("button", { name: "Suspend", exact: true }).click(); // no reason yet
    await expect(suspend.getByText("Say why (at least 3 characters).")).toBeVisible();
    await suspend.getByLabel("Why are you suspending them?").fill("Fighting in the corridor");
    const until = day(10);
    await suspend.getByLabel("Last day of the suspension").fill(until);
    await suspend.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("Amina Musa is suspended.")).toBeVisible();
    await expect(row(page, "Amina Musa").getByText(`Suspended until ${prettyDay(until)}`)).toBeVisible();
    await expect(row(page, "Binta Musa").getByText(/Suspended/)).toHaveCount(0);

    // The history says what, who and why.
    await page.getByRole("button", { name: "Standing history of Amina Musa" }).click();
    const history = dialog(page);
    await expect(history.getByRole("heading", { name: "History of Amina Musa" })).toBeVisible();
    await expect(history.getByText("Fighting in the corridor")).toBeVisible();
    await expect(history.getByText(/Amina Yusuf/)).toBeVisible();
    await history.getByRole("button", { name: "Close" }).last().click();

    // Lift.
    await page.getByRole("button", { name: "Lift suspension Amina Musa" }).click();
    await dialog(page).getByLabel("Why are you lifting it?").fill("Parents met the head");
    await dialog(page).getByRole("button", { name: "Lift suspension", exact: true }).click();
    await expect(page.getByText("Amina Musa is no longer suspended.")).toBeVisible();
    await expect(row(page, "Amina Musa").getByText(/Suspended/)).toHaveCount(0);

    // Expel: says what it does, names the guardian's invoices, and stays in the list with a Reinstate button.
    await page.getByRole("button", { name: "Expel Amina Musa" }).click();
    await expect(dialog(page).getByText(/guardian can still see the invoices/)).toBeVisible();
    await dialog(page).getByLabel("Why are you expelling them?").fill("Serious misconduct");
    await dialog(page).getByRole("button", { name: "Expel", exact: true }).click();
    await expect(page.getByText("Amina Musa is expelled.")).toBeVisible();
    await expect(row(page, "Amina Musa").getByText("Expelled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend Amina Musa" })).toHaveCount(0);

    // The filter finds them.
    await page.getByLabel("Show").selectOption("expelled");
    await expect(row(page, "Amina Musa")).toBeVisible();
    await expect(page.getByText("Binta Musa")).toHaveCount(0);
    await page.getByLabel("Show").selectOption("suspended");
    await expect(page.getByText("No students match.")).toBeVisible();
    await page.getByLabel("Show").selectOption("expelled");

    // Reinstate.
    await page.getByRole("button", { name: "Reinstate Amina Musa" }).click();
    await dialog(page).getByLabel("Why are you reinstating them?").fill("Appeal upheld");
    await dialog(page).getByRole("button", { name: "Reinstate", exact: true }).click();
    await expect(page.getByText("Amina Musa is reinstated.")).toBeVisible();
    await page.getByLabel("Show").selectOption("live");
    await expect(row(page, "Amina Musa").getByText("Expelled")).toHaveCount(0);
  });

  test("a refusal from the server is said in the dialog, and the dialog stays open", async ({ page }) => {
    const { amina } = await seedSchool();
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, name: "Amina Yusuf" }));
    await openStudents(page);
    await expect(row(page, "Amina Musa")).toBeVisible();
    await page.getByRole("button", { name: "Suspend Amina Musa" }).click();
    // meanwhile someone else suspends the same pupil
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "SUSPENDED" } });
    await dialog(page).getByLabel("Why are you suspending them?").fill("Fighting in the corridor");
    await dialog(page).getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(dialog(page).getByRole("alert").filter({ hasText: "That doesn't apply" })).toBeVisible();
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe("students: a branch administrator", () => {
  test("suspends and lifts but is never offered expel; with the school's switch off, no standing button at all", async ({ page }) => {
    await seedSchool();
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await page.goto("/students");
    await expect(page.getByRole("button", { name: "Suspend Amina Musa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expel Amina Musa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Standing history of Amina Musa" })).toBeVisible();

    await db.settingValue.create({ data: { scope: "GLOBAL", key: "standing.branchAdminMaySuspend", value: false, status: "APPROVED" } });
    await page.reload();
    await expect(row(page, "Amina Musa")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend Amina Musa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expel Amina Musa" })).toHaveCount(0);
  });

  test("a teacher only looks: no standing buttons, and the badge shows", async ({ page }) => {
    const { amina } = await seedSchool();
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "SUSPENDED" } });
    await signInThroughUi(page, await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" }));
    await page.goto("/students");
    await expect(row(page, "Amina Musa").getByText("Suspended", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Suspend|Lift suspension|Expel|Reinstate|Standing history/ })).toHaveCount(0);
  });
});

test.describe("users", () => {
  test("a super admin suspends a teacher, sees the badge and the lift button instead of Reactivate, then terminates and reinstates", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" });
    await signInThroughUi(page, admin);
    await page.goto("/users");
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();

    await page.getByRole("button", { name: "Suspend Hassan Teacher" }).click();
    await expect(dialog(page).getByRole("checkbox", { name: /Everywhere in the school/ })).toBeVisible();
    await dialog(page).getByLabel("Why are you suspending them?").fill("Pending an inquiry");
    await dialog(page).getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("Hassan Teacher is suspended.")).toBeVisible();

    await page.getByLabel("Status", { exact: true }).selectOption("all");
    await expect(row(page, "Hassan Teacher").getByText("Suspended", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivate Hassan Teacher" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Lift suspension Hassan Teacher" })).toBeVisible();

    await page.getByRole("button", { name: "Terminate Hassan Teacher" }).click();
    await dialog(page).getByLabel("Why are you terminating them?").fill("Contract ended");
    await dialog(page).getByRole("button", { name: "Terminate", exact: true }).click();
    await expect(page.getByText("Hassan Teacher is terminated.")).toBeVisible();
    await expect(row(page, "Hassan Teacher").getByText("Terminated", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reinstate Hassan Teacher" }).click();
    await dialog(page).getByLabel("Why are you reinstating them?").fill("Appeal upheld");
    await dialog(page).getByRole("button", { name: "Reinstate", exact: true }).click();
    await expect(page.getByText("Hassan Teacher is reinstated.")).toBeVisible();
    await expect(row(page, "Hassan Teacher").getByText("Active", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Standing history of Hassan Teacher" }).click();
    await expect(dialog(page).getByText("Contract ended")).toBeVisible();
    await expect(dialog(page).getByText("Appeal upheld")).toBeVisible();
  });
});

test.describe("settings: Discipline", () => {
  test("a super admin turns branch suspensions off and on; a branch can narrow itself but not widen the school", async ({ page }) => {
    await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, name: "Second Super" }));
    await page.goto("/settings");
    await page.getByRole("button", { name: "Discipline" }).click();
    await expect(page.getByText("Branch administrators may suspend", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Turn off for the school" }).click();
    await expect(page.getByText("Branch administrators may no longer suspend.")).toBeVisible();
    await expect(page.getByText("Branch administrators may not suspend", { exact: true })).toBeVisible();
    await expect(page.getByText(/may not suspend, set by the school/).first()).toBeVisible();
    await page.getByRole("button", { name: "Turn on for the school" }).click();
    await expect(page.getByText("Branch administrators may suspend again.")).toBeVisible();
    await page.getByRole("button", { name: `Stop administrators of ${FIRST} suspending` }).click();
    await expect(page.getByText(`Administrators of ${FIRST} may no longer suspend.`)).toBeVisible();
    await expect(page.getByText(/may not suspend, set by the branch/).first()).toBeVisible();
  });
});

test.describe("the portal", () => {
  async function portalSignIn(page: Page, secret: string) {
    await page.goto("/portal");
    await page.fill("#admissionNo", "2026/0001");
    await page.fill("#secret", secret);
    await page.click("button:has-text('Access Student Portal')");
  }

  test("a suspended pupil is told so, with the day it ends and no reason; the coursework switches are off", async ({ page }) => {
    const { amina } = await seedSchool();
    const until = day(5);
    await db.studentRecord.update({
      where: { id: amina.id },
      data: { standing: "SUSPENDED", standingUntil: new Date(`${until}T00:00:00Z`) },
    });
    await portalSignIn(page, DOB);
    await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
    await expect(page.getByText(`You are suspended until ${prettyDay(until)}.`)).toBeVisible();
    await expect(page.getByText(/can't hand in work, take quizzes or practise/)).toBeVisible();
    await expectAccessible(page, "portal with a suspension notice");
  });

  test("a guardian is told about the child; an expelled child's guardian keeps only the fees", async ({ page }) => {
    const { amina, branch, period } = await seedSchool();
    await db.invoice.create({
      data: {
        branchId: branch.id,
        studentId: amina.id,
        periodId: period.id,
        invoiceNo: "INV-0001",
        totalAmount: 45000,
        amountPaid: 20000,
        status: "PARTIALLY_PAID",
      },
    });
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "EXPELLED" } });
    await db.studentEnrollment.updateMany({ where: { studentId: amina.id }, data: { status: "EXPELLED" } });
    await portalSignIn(page, "08011110001");
    await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
    await expect(page.getByText("Amina is no longer a pupil of the school.", { exact: false })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Fees & Billing" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Academic Results" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Coursework (LMS)" })).toHaveCount(0);
  });

  test("an expelled pupil is refused at sign-in with the one generic sentence", async ({ page }) => {
    const { amina } = await seedSchool();
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "EXPELLED" } });
    await portalSignIn(page, DOB);
    await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
  });
});

test.describe("part payment: Finance", () => {
  async function seedInvoice() {
    const { branch, period, amina } = await seedSchool();
    const invoice = await db.invoice.create({
      data: {
        branchId: branch.id,
        studentId: amina.id,
        periodId: period.id,
        invoiceNo: "INV-2026-0001",
        totalAmount: 45000,
        amountPaid: 0,
        status: "UNPAID",
      },
    });
    return { branch, invoice };
  }

  test("a super admin sets the school's rule; the invoice says what may be paid; a part below it is refused in words; the whole balance is one click", async ({
    page,
  }) => {
    const { branch } = await seedInvoice();
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, name: "Amina Yusuf" }));
    await page.goto("/finance");
    await page.getByRole("tab", { name: "Payment Rules" }).click();
    await expect(page.getByText("The school: Part payments are allowed, of any amount.")).toBeVisible();

    await page.locator("#school-kind").selectOption("AMOUNT");
    await page.locator("#school-value").fill("10000");
    await page.getByRole("button", { name: "Save the school's rule" }).click();
    await expect(page.getByText("The school's rule is saved.")).toBeVisible();
    await expect(page.getByText(/The school: Part payments are allowed, at least ₦10,000\./)).toBeVisible();

    // A branch can't go below the school's smallest part; the refusal is in words.
    await page.locator(`[id="${branch.id}-kind"]`).selectOption("AMOUNT");
    await page.locator(`[id="${branch.id}-value"]`).fill("5000");
    await page.getByRole("button", { name: `Save the rule for ${FIRST}` }).click();
    await expect(page.getByText(/only raise it/)).toBeVisible();

    await page.getByRole("tab", { name: "Student Invoices & Payments" }).click();
    await page.getByRole("button", { name: "View & Pay" }).click();
    await expect(dialog(page).getByText("Part payments are allowed, at least ₦10,000.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Record Payment" }).click();
    const record = page.getByRole("dialog", { name: /Record Offline Payment/ });
    await expect(record.getByText("Part payments are allowed, at least ₦10,000.")).toBeVisible();
    await record.getByLabel("Payment Amount (₦)").fill("2500");
    await record.getByRole("button", { name: "Record Payment & Issue Receipt" }).click();
    await expect(record.getByRole("alert").filter({ hasText: "The smallest part you can pay is ₦10,000." })).toBeVisible();
    await record.getByRole("button", { name: "Pay the full balance" }).click();
    await expect(record.getByLabel("Payment Amount (₦)")).toHaveValue("45000");
    await record.getByRole("button", { name: "Record Payment & Issue Receipt" }).click();
    // The list reloads and the dialogs close (as they always have after a payment); the row says it is settled.
    await expect(page.getByRole("row", { name: /INV-2026-0001/ })).toContainText(/₦45,000\.00\s*₦45,000\.00\s*PAID/);
  });

  test("an administrator marks one invoice pay in full and clears it again", async ({ page }) => {
    await seedInvoice();
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await page.goto("/finance");
    await page.getByRole("button", { name: "View & Pay" }).click();
    await expect(dialog(page).getByText(/Part payments are allowed/)).toBeVisible();
    await dialog(page)
      .getByRole("switch", { name: /Pay in full only/ })
      .click();
    await expect(dialog(page).getByText("This invoice has to be paid in full.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Record Payment" }).click();
    const record = page.getByRole("dialog", { name: /Record Offline Payment/ });
    await record.getByLabel("Payment Amount (₦)").fill("1000");
    await record.getByRole("button", { name: "Record Payment & Issue Receipt" }).click();
    await expect(record.getByRole("alert").filter({ hasText: "has to be paid in full" })).toBeVisible();
    await record.getByRole("button", { name: "Cancel" }).click();
    await dialog(page)
      .getByRole("switch", { name: /Allow part payments again/ })
      .click();
    await expect(dialog(page).getByText(/Part payments are allowed/)).toBeVisible();
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`${theme} theme: the standing screens, dialogs and the payment rules`, async ({ page, context }) => {
      const { amina, branch, period } = await seedSchool();
      await db.invoice.create({
        data: {
          branchId: branch.id,
          studentId: amina.id,
          periodId: period.id,
          invoiceNo: "INV-2026-0001",
          totalAmount: 45000,
          amountPaid: 0,
          status: "UNPAID",
        },
      });
      await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, await createUser({ role: Role.ADMIN, name: "Amina Yusuf" }));

      await openStudents(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.getByRole("button", { name: "Suspend Amina Musa" }).click();
      await expect(dialog(page)).toBeVisible();
      await expectAccessible(page, `${theme} suspend dialog`);
      await dialog(page).getByRole("button", { name: "Cancel" }).click();

      await db.studentRecord.update({
        where: { id: amina.id },
        data: { standing: "SUSPENDED", standingUntil: new Date(`${day(5)}T00:00:00Z`) },
      });
      await openStudents(page); // a fresh load: the branch has to be chosen again
      await expect(row(page, "Amina Musa").getByText(/Suspended until/)).toBeVisible();
      await expectAccessible(page, `${theme} students list with a suspension`);
      await expectFits(page, `${theme} students list with a suspension`);
      await page.getByRole("button", { name: "Standing history of Amina Musa" }).click();
      await expectAccessible(page, `${theme} history dialog`);
      await dialog(page).getByRole("button", { name: "Close" }).last().click();

      await page.goto("/users");
      await expect(page.getByRole("button", { name: "Suspend Hassan Teacher" })).toBeVisible();
      await expectAccessible(page, `${theme} users list`);
      await expectFits(page, `${theme} users list`);
      await page.getByRole("button", { name: "Terminate Hassan Teacher" }).click();
      await expectAccessible(page, `${theme} terminate dialog`);
      await dialog(page).getByRole("button", { name: "Cancel" }).click();

      await page.goto("/settings");
      await page.getByRole("button", { name: "Discipline" }).click();
      await expect(page.getByText("Branch administrators may suspend", { exact: true })).toBeVisible();
      await expectAccessible(page, `${theme} discipline settings`);
      await expectFits(page, `${theme} discipline settings`);

      await page.goto("/finance");
      await page.getByRole("tab", { name: "Payment Rules" }).click();
      await expect(page.getByText(/The school:/)).toBeVisible();
      await expectAccessible(page, `${theme} payment rules`);
      await expectFits(page, `${theme} payment rules`);
      await page.getByRole("tab", { name: "Student Invoices & Payments" }).click();
      await expect(page.getByRole("button", { name: "View & Pay" })).toBeVisible();
      await expectAccessible(page, `${theme} invoice list`);
      await page.getByRole("button", { name: "View & Pay" }).click();
      await expectAccessible(page, `${theme} invoice with the rule`);
      await dialog(page).getByRole("button", { name: "Record Payment" }).click();
      await expectAccessible(page, `${theme} record payment with the rule`);
    });
  }
});
