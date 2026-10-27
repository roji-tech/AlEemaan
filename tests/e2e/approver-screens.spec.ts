import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Permission } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { signInThroughUi } from "./helpers";

// Approvers in a real browser, desktop and phone (task 0039 slice 1): a superadmin says on the Users page who may approve results (with a fresh proof), and that person
// then finds the Review tab on the Results page, sees the classes in their scope, approves them, and is not offered Unlock. Axe (WCAG 2.2 A/AA) on the dialog and the
// review screen in both themes.

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
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
      `accessibility violations on ${what} (${theme})`,
    ).toEqual([]);
  }
  await page.evaluate(() => void (document.documentElement.dataset.theme = "dark"));
}

const dialog = (page: Page) => page.getByRole("dialog");
const row = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });

let branches: { id: string; name: string }[];
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
});

async function member(role: Role, name: string, branch = 0) {
  const user = await createUser({ name });
  const m = await db.membership.create({ data: { userId: user.id, branchId: branches[branch].id, role } });
  return { ...user, membershipId: m.id };
}
async function openUsers(page: Page, who: TestUser) {
  await signInThroughUi(page, who);
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
  await expect(page.getByText(/^\d+ (person|people)/)).toBeVisible();
}

test.describe("the Users page", () => {
  test("a superadmin turns on 'May approve results' with their password; the list says so and the database holds the permission and a General scope", async ({
    page,
  }) => {
    const superAdmin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher");
    await openUsers(page, superAdmin);
    await row(page, "Tola Teacher").getByRole("button", { name: "Change role or branch for Tola Teacher" }).click();
    await expect(dialog(page)).toBeVisible();
    const box = dialog(page).getByRole("checkbox", { name: "May approve results" });
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(dialog(page).getByLabel("Your password")).toBeVisible(); // the proof field appears only once the choice changed
    await expectAccessible(page, "the edit dialog with the approval choice and the password field");

    // nothing typed: stopped on the screen; a wrong password: refused in the dialog, which stays
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog(page).getByText("Enter your password to confirm.")).toBeVisible();
    await dialog(page).getByLabel("Your password").fill("not-the-password-1");
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog(page).getByText("That password isn't right.")).toBeVisible();
    expect((await db.membership.findUniqueOrThrow({ where: { id: tola.membershipId } })).permissions).toEqual([]);

    await dialog(page).getByLabel("Your password").fill(superAdmin.password);
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(row(page, "Tola Teacher")).toContainText("Approves results");
    expect((await db.membership.findUniqueOrThrow({ where: { id: tola.membershipId } })).permissions).toEqual([
      Permission.CAN_APPROVE_RESULTS,
    ]);
    expect((await db.resultApprovalScope.findMany({ where: { userId: tola.id } })).map((s) => s.kind)).toEqual(["GENERAL"]);

    // leaving and coming back shows the same; turning it off needs the proof again and removes the scope
    await page.goto("/users");
    await expect(row(page, "Tola Teacher")).toContainText("Approves results");
    await row(page, "Tola Teacher").getByRole("button", { name: "Change role or branch for Tola Teacher" }).click();
    await dialog(page).getByRole("checkbox", { name: "May approve results" }).uncheck();
    await dialog(page).getByLabel("Your password").fill(superAdmin.password);
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(row(page, "Tola Teacher")).not.toContainText("Approves results");
    expect(await db.resultApprovalScope.count({ where: { userId: tola.id } })).toBe(0);
  });

  test("the choice is not offered to a branch administrator, nor for a role that cannot hold it", async ({ page }) => {
    const branchAdmin = await createUser({ name: "Bola Branch", superAdmin: false });
    await db.membership.create({ data: { userId: branchAdmin.id, branchId: branches[0].id, role: Role.ADMIN } });
    await member(Role.TEACHING_STAFF, "Tola Teacher");
    await member(Role.PARENT, "Pat Parent");
    await openUsers(page, branchAdmin);
    await row(page, "Tola Teacher").getByRole("button", { name: "Change role or branch for Tola Teacher" }).click();
    await expect(dialog(page).getByLabel("Role")).toBeVisible();
    await expect(dialog(page).getByRole("checkbox", { name: "May approve results" })).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    // a superadmin, but a parent: nothing to tick
    const superAdmin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
    await page.context().clearCookies();
    await openUsers(page, superAdmin);
    await row(page, "Pat Parent").getByRole("button", { name: "Change role or branch for Pat Parent" }).click();
    await expect(dialog(page).getByRole("checkbox", { name: "May approve results" })).toHaveCount(0);
    await dialog(page).getByLabel("Role").selectOption("TEACHING_STAFF");
    await expect(dialog(page).getByRole("checkbox", { name: "May approve results" })).toBeVisible(); // it follows the role chosen
  });
});

test.describe("the Review tab", () => {
  async function submittedWorld() {
    const w = await resultsWorld(branches[0].id, "AP");
    const author = await createUser({ name: "Ada Author", role: Role.TEACHING_STAFF });
    const staff = await db.staffRecord.create({
      data: { branchId: branches[0].id, userId: author.id, category: "TEACHING", firstName: "Ada", lastName: "Author" },
    });
    await db.staffSubjectAssignment.create({
      data: { branchId: branches[0].id, staffRecordId: staff.id, subjectId: w.subject.id, classArmId: w.arm.id },
    });
    const result = await db.result.create({
      data: {
        branchId: branches[0].id,
        studentId: w.student.id,
        subjectId: w.subject.id,
        periodId: w.period.id,
        classArmId: w.arm.id,
        schemeId: w.scheme.id,
        scaleId: w.scale.id,
        componentScores: [
          { name: "Test 1", max: 20, score: 15 },
          { name: "Test 2", max: 20, score: 10 },
        ],
        examScore: 40,
        examMax: 60,
        caTotal: 25,
        total: 65,
        maxScore: 100,
        gradeLetter: "C",
        gradeRemark: "Credit",
        enteredByUserId: author.id,
      },
    });
    return { w, result, author };
  }

  test("an approver sees the Review tab, the classes in their scope, approves them, and is not offered Unlock; a teacher with no permission sees no Review tab", async ({
    page,
  }) => {
    const { w, result } = await submittedWorld();
    await db.result.update({
      where: { id: result.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), submittedByUserId: result.enteredByUserId },
    });
    const approver = await createUser({ name: "Wale Approver" });
    await db.membership.create({
      data: { userId: approver.id, branchId: branches[0].id, role: Role.NON_TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
    });
    await db.resultApprovalScope.create({
      data: { branchId: branches[0].id, userId: approver.id, kind: "CLASS", classGroupId: w.group.id },
    });

    await signInThroughUi(page, approver);
    await page.goto("/results");
    await expect(page.getByRole("heading", { level: 1, name: "Results" })).toBeVisible();
    await page.getByRole("tab", { name: "Review" }).click();
    const queue = page.getByRole("region").or(page.locator("section[aria-labelledby=queue-heading]")).first();
    await expect(page.getByText(`${w.group.name} A · ${w.subject.name}`)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve 1 submitted results of/ })).toBeVisible();
    await expect(queue).toBeVisible();
    await expectAccessible(page, "the review tab of an approver");

    await page.getByRole("button", { name: /^Approve 1 submitted results of/ }).click();
    await expect(page.getByText(/approve done\./)).toBeVisible();
    expect((await db.result.findUniqueOrThrow({ where: { id: result.id } })).status).toBe("APPROVED");
    await page.getByRole("button", { name: /^Publish 1 approved results of/ }).click();
    await expect(page.getByText(/publish done\./)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Lock 1 published results of/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Unlock/ })).toHaveCount(0); // an administrator's alone
    expect((await db.result.findUniqueOrThrow({ where: { id: result.id } })).status).toBe("PUBLISHED");
  });

  test("an approver whose scope is another class sees an empty queue; the same teacher without the permission sees no Review tab; an administrator is offered Unlock", async ({
    page,
  }) => {
    const { w, result } = await submittedWorld();
    await db.result.update({
      where: { id: result.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), submittedByUserId: result.enteredByUserId },
    });
    const elsewhere = await db.classGroup.create({ data: { branchId: branches[0].id, name: "SSS 3 elsewhere" } });
    const approver = await createUser({ name: "Wale Approver" });
    await db.membership.create({
      data: { userId: approver.id, branchId: branches[0].id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
    });
    await db.resultApprovalScope.create({
      data: { branchId: branches[0].id, userId: approver.id, kind: "CLASS", classGroupId: elsewhere.id },
    });
    await signInThroughUi(page, approver);
    await page.goto("/results");
    await page.getByRole("tab", { name: "Review" }).click();
    await expect(page.getByText("No results have been entered for this term yet.")).toBeVisible();
    await expect(page.getByText(`${w.group.name} A`)).toHaveCount(0);

    // the same person without the permission: no tab at all
    await db.membership.update({
      where: { userId_branchId: { userId: approver.id, branchId: branches[0].id } },
      data: { permissions: [] },
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Results" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Review" })).toHaveCount(0);
  });
});
