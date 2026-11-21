import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SettingScope, SettingStatus } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { resultFootprint } from "../support/result-footprint";
import { signInThroughUi } from "./helpers";

// Task 0101 F on screen (the follow-up of task 0118: the tab had only been covered over HTTP): the head of a department opens Results > Department review, sees the SUBMITTED results of their
// department's subjects grouped by arm and subject, passes one group and returns another with a reason. Desktop and phone, axe on the tab.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp(page: Page) {
  const branch = await seedInstance();
  const w = await resultsWorld(branch.id);
  const department = await db.department.create({ data: { branchId: branch.id, name: "Sciences" } });
  await db.subject.update({ where: { id: w.subject.id }, data: { departmentId: department.id } });
  const second = await db.subject.create({ data: { branchId: branch.id, name: "Biology", departmentId: department.id } });
  await db.subjectOffering.create({ data: { branchId: branch.id, classGroupId: w.group.id, subjectId: second.id } });
  await db.settingValue.create({
    data: {
      scope: SettingScope.BRANCH,
      branchId: branch.id,
      key: "results.departmentHeadReview",
      value: true,
      status: SettingStatus.APPROVED,
    },
  });
  // The teacher who entered the marks, and the head who reviews them (a different person: nobody reviews their own marks).
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tola Teacher" });
  const head = await createUser({ role: Role.TEACHING_STAFF, name: "Hadiza Head" });
  const headRecord = await db.staffRecord.create({
    data: { branchId: branch.id, userId: head.id, category: "TEACHING", firstName: "Hadiza", lastName: "Head" },
  });
  await db.departmentMember.create({
    data: { branchId: branch.id, departmentId: department.id, staffRecordId: headRecord.id, isHead: true },
  });
  const submitted = (subjectId: string) =>
    db.result.create({
      data: {
        branchId: branch.id,
        studentId: w.student.id,
        subjectId,
        periodId: w.period.id,
        classArmId: w.arm.id,
        schemeId: w.scheme.id,
        scaleId: w.scale.id,
        componentScores: [{ name: "Test 1", max: 40, score: 30 }],
        examScore: 40,
        examMax: 60,
        caTotal: 30,
        total: 70,
        maxScore: 100,
        gradeLetter: "A",
        gradeRemark: "Excellent",
        enteredByUserId: teacher.id,
        ...resultFootprint("SUBMITTED", teacher.id),
      },
    });
  const maths = await submitted(w.subject.id);
  const biology = await submitted(second.id);
  await signInThroughUi(page, head);
  return { branch, w, maths, biology, second };
}

test("the head sees the waiting groups, passes one (a review is recorded, nothing is approved) and returns the other with a reason (the marks go back to draft)", async ({
  page,
}) => {
  const { w, maths, biology, second } = await setUp(page);
  const arm = `${w.group.name} A`; // the screen names the arm with its class
  await page.goto("/results");
  await page.getByRole("tab", { name: "Department review" }).click();
  const list = page.getByRole("list", { name: "Results to review" });
  await expect(page.getByText("2 results are waiting.")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText(`${w.subject.name} · ${arm}`);
  await expect(list).toContainText("Sciences: 1 waiting");
  const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: `Pass 1 results of ${w.subject.name} in ${arm}` }).click();
  await expect(page.getByText(`1 result of ${w.subject.name} in ${arm} passed. They can now be approved.`)).toBeVisible();
  expect(await db.resultDepartmentReview.count({ where: { resultId: maths.id } })).toBe(1);
  expect((await db.result.findUniqueOrThrow({ where: { id: maths.id } })).status).toBe("SUBMITTED"); // passing approves and publishes nothing
  await expect(page.getByText("1 result is waiting.")).toBeVisible();
  await expect(list).toContainText("1 already passed");

  await page.getByRole("button", { name: `Return the results of ${second.name} in ${arm} to the teacher` }).click();
  const dialog = page.getByRole("dialog", { name: `Return ${second.name} in ${arm}` });
  const send = dialog.getByRole("button", { name: "Return to teacher" });
  await expect(send).toBeDisabled(); // a reason of at least 5 characters
  await dialog.getByLabel("Reason").fill("Check the exam marks again");
  await send.click();
  await expect(page.getByText(`1 result of ${second.name} in ${arm} sent back to the teacher.`)).toBeVisible();
  expect((await db.result.findUniqueOrThrow({ where: { id: biology.id } })).status).toBe("DRAFT");
  await expect(page.getByText("Nothing is waiting for your review.")).toBeVisible();
});
