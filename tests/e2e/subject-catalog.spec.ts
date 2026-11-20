import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { openRowActions, signInThroughUi } from "./helpers";

// The shared subject catalogue on screen (task 0119): a superadmin sees every subject with the branches offering it, chooses the ones with a tag and adds them to branches; the administrator of a
// branch takes subjects from the catalogue into their own branch and can filter their subjects by tag; a teacher sees neither. Desktop and phone (the two projects).

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

const dialog = (page: Page) => page.getByRole("dialog").first();

async function setUp() {
  const home = await seedInstance();
  const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
  const english = await db.subjectCatalog.create({ data: { name: "English Language", code: "ENG", tags: ["core", "basic"] } });
  const maths = await db.subjectCatalog.create({ data: { name: "Mathematics", code: "MTH", tags: ["core"] } });
  const arabic = await db.subjectCatalog.create({ data: { name: "Arabic", code: "ARB", tags: ["arabic"] } });
  return { home, branches, english, maths, arabic };
}

test("a superadmin sees every subject with the branches offering it, chooses those tagged core and adds them to two branches", async ({
  page,
}) => {
  const { branches, english } = await setUp();
  const [first, second] = branches;
  await db.subject.create({ data: { branchId: first!.id, name: "English Language", catalogId: english.id } });
  const boss = await createUser({ role: Role.ADMIN, superAdmin: true, name: "School Boss" });
  await signInThroughUi(page, boss);

  await page.goto("/academics?tab=catalogue");
  await expect(page.getByRole("heading", { name: "Subject catalogue" })).toBeVisible();
  const list = page.getByRole("list", { name: "Catalogue subjects" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  // the branch that offers English is a chip on its row
  await expect(page.getByRole("list", { name: "Branches offering English Language" })).toContainText(first!.name);
  await expectAccessible(page, "the subject catalogue");

  // filter by tag, choose them all in one click, add to two branches
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("Tag", { exact: true }).selectOption("core");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await page.getByLabel("Choose all tagged core").check();
  await page.getByRole("button", { name: "Add chosen to branches" }).click();
  const box = dialog(page);
  await expect(box).toContainText("Add 2 subjects to branches");
  await box.getByLabel(first!.name, { exact: true }).check();
  await box.getByLabel(second!.name, { exact: true }).check();
  await expectAccessible(page, "adding to branches");
  await box.getByRole("button", { name: "Add to 2 branches" }).click();
  await expect(page.getByText(/Added 3/)).toBeVisible(); // English was already in the first branch: 3 of the 4 pairs are new
  expect(await db.subject.count({ where: { catalogId: { not: null }, archivedAt: null } })).toBe(4);
  await expect(page.getByRole("list", { name: "Branches offering Mathematics" })).toContainText(second!.name);
});

test("a superadmin makes a subject with tags, renames it in every branch, and archives it", async ({ page }) => {
  const { branches, english } = await setUp();
  await db.subject.create({ data: { branchId: branches[0]!.id, name: "English Language", catalogId: english.id } });
  const boss = await createUser({ role: Role.ADMIN, superAdmin: true });
  await signInThroughUi(page, boss);
  await page.goto("/academics?tab=catalogue");

  await page.getByRole("button", { name: "New subject" }).click();
  await dialog(page).getByLabel("Subject name").fill("Phonics");
  await dialog(page).getByLabel("Tags").fill("Pre-school, Basic");
  await dialog(page).getByRole("button", { name: "Add subject" }).click();
  await expect(page.getByText("Phonics added to the catalogue.")).toBeVisible();
  expect((await db.subjectCatalog.findFirstOrThrow({ where: { name: "Phonics" } })).tags).toEqual(["pre-school", "basic"]);

  expect(await openRowActions(page, "English Language")).toBe(true);
  await page.getByRole("button", { name: "Edit English Language", exact: true }).click();
  await dialog(page).getByLabel("Subject name").fill("English Studies");
  await dialog(page)
    .getByLabel(/Also rename it in the 1 branch/)
    .check();
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/English Studies saved and renamed in 1 branch/)).toBeVisible();
  expect(await db.subject.count({ where: { catalogId: english.id, name: "English Studies" } })).toBe(1);

  expect(await openRowActions(page, "Arabic")).toBe(true);
  await page.getByRole("button", { name: "Archive Arabic", exact: true }).click();
  await expect(page.getByText(/Arabic archived/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Catalogue subjects" }).getByRole("listitem").filter({ hasText: "Arabic" })).toHaveCount(0);
});

test("the administrator of a branch takes the subjects tagged core from the catalogue and filters their subjects by tag; no catalogue tab", async ({
  page,
}) => {
  const { home } = await setUp();
  await db.subject.create({ data: { branchId: home.id, name: "Handwriting" } });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" });
  await signInThroughUi(page, admin);

  await page.goto(`/academics?tab=subjects&branch=${home.id}`);
  await expect(page.getByRole("tab", { name: "Subject catalogue" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add from catalogue" }).click();
  const box = dialog(page);
  await expect(box.getByLabel("Arabic (ARB)")).toBeVisible();
  await box.getByLabel("Tag", { exact: true }).selectOption("core");
  await expect(box.getByLabel("Arabic (ARB)")).toHaveCount(0);
  await box.getByRole("button", { name: "Choose all tagged core" }).click();
  await expectAccessible(page, "adding from the catalogue");
  await box.getByRole("button", { name: new RegExp(`^Add 2 to ${home.name}`) }).click();
  await expect(page.getByText(/Added 2/)).toBeVisible();

  const subjects = page.getByRole("list", { name: "Subjects" });
  await expect(subjects.getByRole("listitem")).toHaveCount(3);
  await expect(subjects.getByRole("listitem").filter({ hasText: "English Language" }).getByRole("group", { name: "Tags" })).toContainText(
    "core",
  );
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("Tag", { exact: true }).selectOption("basic");
  await expect(subjects.getByRole("listitem")).toHaveCount(1);
  await expect(subjects.getByRole("listitem")).toContainText("English Language");
});

test("a teacher has no Add from catalogue and no catalogue tab; the catalogue's own page falls back to Classes", async ({ page }) => {
  const { home } = await setUp();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tola Teacher" });
  await signInThroughUi(page, teacher);
  await page.goto(`/academics?tab=subjects&branch=${home.id}`);
  await expect(page.getByRole("heading", { name: "Subjects", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add from catalogue" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Subject catalogue" })).toHaveCount(0);
  await page.goto("/academics?tab=catalogue");
  await expect(page.getByRole("tab", { name: "Classes", selected: true })).toBeVisible();
});
