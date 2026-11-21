import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, uniqueEmail } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0126 (the follow-up of task 0118 D): a head of department who is not an administrator of the branch ticks people in the staff list and adds them to the department THEY head, from the
// selection bar. They are offered no other department and no invitation button; a teacher who heads nothing can tick nobody. Desktop and phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp() {
  const home = await seedInstance();
  await db.settingValue.create({
    data: { scope: "BRANCH", branchId: home.id, key: "academics.useDepartments", value: true, status: "APPROVED" },
  });
  const sciences = await db.department.create({ data: { branchId: home.id, name: "Sciences" } });
  await db.department.create({ data: { branchId: home.id, name: "Arts" } });
  await db.staffRecord.createMany({
    data: [
      { branchId: home.id, category: "TEACHING", firstName: "Bala", lastName: "Musa", email: uniqueEmail("bala") },
      { branchId: home.id, category: "TEACHING", firstName: "Chidi", lastName: "Okoro", email: uniqueEmail("chidi") },
    ],
  });
  return { home, sciences };
}
const makeHead = async (home: { id: string }, departmentId: string | null) => {
  const user = await createUser({ role: Role.TEACHING_STAFF, name: "Hadiza Head" });
  const record = await db.staffRecord.create({
    data: { branchId: home.id, userId: user.id, category: "TEACHING", firstName: "Hadiza", lastName: "Head" },
  });
  if (departmentId) await db.departmentMember.create({ data: { branchId: home.id, departmentId, staffRecordId: record.id, isHead: true } });
  return user;
};

test("a head ticks people and adds them to their own department only; no invitation button", async ({ page }) => {
  const { home, sciences } = await setUp();
  const head = await makeHead(home, sciences.id);
  await signInThroughUi(page, head);
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  await expect(page.getByRole("button", { name: "Select everyone who can be invited" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select Bala Musa to add to a department" }).check();
  const bar = page.getByRole("region", { name: "Selected staff" });
  await expect(bar).toContainText("1 selected");
  await expect(bar.getByRole("button", { name: "Invite to sign in" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Add to department" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Bala Musa");
  const options = await dialog.getByLabel("Department").locator("option").allTextContents();
  expect(options.filter((o) => o === "Arts")).toEqual([]); // not the department they head
  expect(options).toContain("Sciences");
  const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await dialog.getByLabel("Department").selectOption({ label: "Sciences" });
  await dialog.getByRole("button", { name: "Add to department" }).click();
  await expect(page.getByText("1 added to Sciences.")).toBeVisible();
  const members = await db.departmentMember.findMany({
    where: { departmentId: sciences.id, isHead: false },
    include: { staffRecord: true },
  });
  expect(members.map((m) => m.staffRecord.firstName)).toEqual(["Bala"]);
});

test("a teacher who heads no department can tick nobody", async ({ page }) => {
  const { home } = await setUp();
  const teacher = await makeHead(home, null);
  await signInThroughUi(page, teacher);
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  await expect(page.getByRole("list", { name: "Staff" })).toContainText("Bala Musa");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
