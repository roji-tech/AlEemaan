import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0101 D7 on screen: an administrator turns departments on for the branch, makes a department, adds people, chooses and replaces the head (with the confirmation), and the staff list then
// shows the department labels and filters by department; a teacher only reads; the head of a department manages its members but cannot choose the head. Desktop and phone (the two projects).

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

const KEY = "academics.useDepartments";
const dialog = (page: Page) => page.getByRole("dialog").first();

async function setUp(opts: { departmentsOn?: boolean } = {}) {
  const branch = await seedInstance();
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
      { branchId: branch.id, category: "TEACHING", firstName: "Bala", lastName: "Musa", email: `bala-${Date.now()}@school.example` },
      { branchId: branch.id, category: "NON_TEACHING", firstName: "Chika", lastName: "Obi", designation: "Bursar" },
    ],
  });
  if (opts.departmentsOn) await db.settingValue.create({ data: { scope: "BRANCH", branchId: branch.id, key: KEY, value: true } });
  return branch;
}
/// A branch administrator (sees only the home branch).
const asAdmin = async (page: Page) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Dept Admin" });
  await signInThroughUi(page, admin);
  return admin;
};

test("an administrator turns departments on, makes one, adds people, chooses the head and replaces them; the staff list shows and filters it", async ({
  page,
}) => {
  const branch = await setUp();
  await asAdmin(page);

  await page.goto(`/academics?tab=departments&branch=${branch.id}`);
  await expect(page.getByText("Departments are off for this branch.")).toBeVisible();
  await expectAccessible(page, "departments, off");
  await page.getByRole("button", { name: "Turn on departments" }).click();
  await expect(page.getByText(/Departments are on for/)).toBeVisible();

  await page.getByRole("button", { name: "New department" }).click();
  await dialog(page).getByLabel("Department name").fill("Sciences");
  await dialog(page).getByRole("button", { name: "Create department" }).click();
  await expect(page.getByText("Sciences created.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Departments" }).getByRole("listitem")).toContainText("No head yet");

  await page.getByRole("button", { name: "Open Sciences" }).click();
  const box = page.getByRole("dialog", { name: "Department: Sciences" });
  await box.getByRole("button", { name: "Add people" }).click();
  await box.getByLabel("Mrs Amina Yusuf").check();
  await box.getByLabel("Bala Musa").check();
  await expectAccessible(page, "the department dialog, adding people");
  await box.getByRole("button", { name: "Add 2 people" }).click();
  await expect(page.getByText("2 people added to Sciences.")).toBeVisible();
  await expect(box.getByRole("list", { name: "Members of Sciences" }).getByRole("listitem")).toHaveCount(2);

  await box.getByRole("button", { name: "Make Mrs Amina Yusuf head of Sciences" }).click();
  await expect(page.getByText("Mrs Amina Yusuf is now the head of Sciences.")).toBeVisible();
  await expect(box).toContainText("HOD: Mrs Amina Yusuf");

  // Another head: asks first; keeping the old one changes nothing, replacing does it.
  await box.getByRole("button", { name: "Make Bala Musa head of Sciences" }).click();
  const confirm = box.getByRole("group", { name: "Replace the head" });
  await expect(confirm).toContainText("Replace Mrs Amina Yusuf as head of Sciences?");
  await expectAccessible(page, "the replace-the-head confirmation");
  await confirm.getByRole("button", { name: "Keep Mrs Amina Yusuf" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(box).toContainText("HOD: Mrs Amina Yusuf");
  await box.getByRole("button", { name: "Make Bala Musa head of Sciences" }).click();
  await confirm.getByRole("button", { name: "Replace head" }).click();
  await expect(box).toContainText("HOD: Bala Musa");
  expect(await db.departmentMember.count({ where: { isHead: true } })).toBe(1);
  await box.getByRole("button", { name: "Close" }).click();

  // The staff list now says so, and filters by it.
  await page.goto(`/academics?tab=staff&branch=${branch.id}`);
  const staff = page.getByRole("list", { name: "Staff" });
  await expect(staff.getByRole("listitem").filter({ hasText: "Bala Musa" })).toContainText("Sciences");
  await expect(staff.getByRole("listitem").filter({ hasText: "Bala Musa" })).toContainText("HOD");
  await expect(staff.getByRole("listitem").filter({ hasText: "Amina Yusuf" })).not.toContainText("HOD");
  await expectAccessible(page, "the staff list with departments");
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("combobox", { name: "Department" }).selectOption({ label: "Sciences" });
  await expect(page.getByText("2 staff records match")).toBeVisible();
  await page.getByRole("combobox", { name: "Department" }).selectOption({ label: "No department" });
  await expect(staff.getByRole("listitem")).toHaveCount(1);
  await expect(staff.getByRole("listitem")).toContainText("Chika Obi");
});

test("while departments are off the staff list shows nothing about them", async ({ page }) => {
  const branch = await setUp();
  await asAdmin(page);
  await page.goto(`/academics?tab=staff&branch=${branch.id}`);
  await expect(page.getByRole("list", { name: "Staff" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByRole("combobox", { name: "Department" })).toHaveCount(0);
});

test("a teacher reads departments: no New department, no way to change one", async ({ page }) => {
  const branch = await setUp({ departmentsOn: true });
  const sciences = await db.department.create({ data: { branchId: branch.id, name: "Sciences" } });
  const amina = await db.staffRecord.findFirstOrThrow({ where: { firstName: "Amina" } });
  await db.departmentMember.create({ data: { branchId: branch.id, departmentId: sciences.id, staffRecordId: amina.id, isHead: true } });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false, name: "Plain Teacher" });
  await signInThroughUi(page, teacher);
  await page.goto(`/academics?tab=departments&branch=${branch.id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Departments" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Departments" }).getByRole("listitem")).toContainText("HOD: Mrs Amina Yusuf");
  await expect(page.getByRole("button", { name: "New department" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Turn off departments" })).toHaveCount(0);
  await page.getByRole("button", { name: "View Sciences" }).click();
  const box = page.getByRole("dialog", { name: "Department: Sciences" });
  await expect(box.getByRole("list", { name: "Members of Sciences" })).toContainText("Mrs Amina Yusuf");
  await expect(box.getByRole("button", { name: "Add people" })).toHaveCount(0);
  await expect(box.getByRole("button", { name: /^Make .* head/ })).toHaveCount(0);
});

test("the head of a department manages its members, but cannot choose the head", async ({ page }) => {
  const branch = await setUp({ departmentsOn: true });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false, name: "Head Teacher" });
  const amina = await db.staffRecord.findFirstOrThrow({ where: { firstName: "Amina" } });
  await db.staffRecord.update({ where: { id: amina.id }, data: { userId: teacher.id } });
  const sciences = await db.department.create({ data: { branchId: branch.id, name: "Sciences" } });
  await db.departmentMember.create({ data: { branchId: branch.id, departmentId: sciences.id, staffRecordId: amina.id, isHead: true } });
  await signInThroughUi(page, teacher);
  await page.goto(`/academics?tab=departments&branch=${branch.id}`);
  await page.getByRole("button", { name: "Manage Sciences" }).click();
  const box = page.getByRole("dialog", { name: "Department: Sciences" });
  await box.getByRole("button", { name: "Add people" }).click();
  await box.getByLabel("Bala Musa").check();
  await box.getByRole("button", { name: "Add 1 person" }).click();
  await expect(page.getByText("1 person added to Sciences.")).toBeVisible();
  await expect(box.getByRole("list", { name: "Members of Sciences" }).getByRole("listitem")).toHaveCount(2);
  await expect(box.getByRole("button", { name: "Remove Bala Musa from Sciences" })).toBeVisible();
  await expect(box.getByRole("button", { name: /^Make .* head/ })).toHaveCount(0); // choosing the head is for administrators
  await expect(page.getByRole("button", { name: "New department" })).toHaveCount(0);
});
