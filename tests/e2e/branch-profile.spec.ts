import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { SchoolSettings } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// School details per branch in a real browser (task 0115, task 0101 D4): a superadmin chooses a branch on Settings > School Profile and sees the school's values as "Using the school's"
// until the branch has its own; an administrator sets their own branch's details on Approvals > Report cards and sees only the branches they administer. Desktop and phone (the two
// projects); axe (WCAG 2.2 A/AA) on the card in both themes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

// The school's row is shared test-database state: written here, and put back as it was found.
const SCHOOL = {
  name: "Test Demonstration School",
  principal: "Mrs School",
  motto: "Faith and knowledge",
  address: "12 Example Road",
  phone: "0803 000 0001",
  email: null,
  website: null,
};
let original: SchoolSettings | null = null;
let tag = "";
test.beforeEach(async () => {
  tag = `D${Date.now().toString(36).toUpperCase()}`;
  await seedInstance();
  original = await db.schoolSettings.findUnique({ where: { id: "global" } });
  await db.schoolSettings.upsert({ where: { id: "global" }, update: SCHOOL, create: { id: "global", ...SCHOOL } });
  await db.branchProfile.deleteMany();
});
test.afterEach(async () => {
  await db.branchProfile.deleteMany();
  if (original) {
    const { name, principal, phone, motto, address, email, website } = original;
    await db.schoolSettings.update({ where: { id: "global" }, data: { name, principal, phone, motto, address, email, website } });
  } else await db.schoolSettings.deleteMany();
});

async function branches() {
  const home = await seedInstance(); // Secondary (English)
  const other = await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } });
  return { home, other };
}
const saved = (branchName: string) => `Saved. ${branchName}'s report cards now show these details.`;
const savedRow = (branchId: string) => db.branchProfile.findUnique({ where: { branchId } });

test("Settings > School Profile: a branch uses the school's details until it has its own, and can take them back", async ({ page }) => {
  const { home, other } = await branches();
  const boss = await createUser({ role: Role.ADMIN, name: `${tag} Super` }); // a superadmin
  await signInThroughUi(page, boss);
  await page.goto("/settings");

  // The school-wide form is what it always was, and the default.
  await expect(page.getByRole("heading", { level: 2, name: "School Information" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "School Name", exact: true })).toHaveValue(SCHOOL.name);

  await page.getByRole("combobox", { name: "Edit details for" }).selectOption({ label: other.name });
  await expect(page.getByRole("heading", { level: 2, name: `Details for ${other.name}` })).toBeVisible();
  const form = page.getByRole("form", { name: `Details for ${other.name}` });
  const principal = form.getByRole("textbox", { name: "Principal / Head of School", exact: true });
  await expect(principal).toHaveValue("");
  await expect(form.getByText(`Using the school's: ${SCHOOL.principal}`)).toBeVisible();
  await expect(form).toContainText(`principal ${SCHOOL.principal}`); // what the cards will show now: the school's
  await expect(form.getByRole("button", { name: "Save details" })).toBeDisabled(); // nothing changed yet

  await principal.fill("Mrs Branch Head");
  await expect(form.getByText(`Using the school's: ${SCHOOL.principal}`)).toHaveCount(0);
  await expect(form).toContainText("principal Mrs Branch Head"); // the preview follows what is typed
  await form.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(saved(other.name))).toBeVisible();
  expect((await savedRow(other.id))?.principal).toBe("Mrs Branch Head");
  expect(await savedRow(home.id)).toBeNull(); // another branch is untouched

  // Take it back: the field empties, the school's shows again, and saving clears the branch's own value.
  await form.getByRole("button", { name: "Use the school's Principal / Head of School" }).click();
  await expect(principal).toHaveValue("");
  await expect(form.getByText(`Using the school's: ${SCHOOL.principal}`)).toBeVisible();
  await form.getByRole("button", { name: "Save details" }).click();
  await expect.poll(async () => (await savedRow(other.id))?.principal ?? null).toBeNull();

  // Back to the school-wide form.
  await page.getByRole("combobox", { name: "Edit details for" }).selectOption({ label: "School-wide" });
  await expect(page.getByRole("heading", { level: 2, name: "School Information" })).toBeVisible();
});

test("Settings > School Profile: a value the school's rules refuse is shown next to its field and nothing is saved", async ({ page }) => {
  const { other } = await branches();
  const boss = await createUser({ role: Role.ADMIN, name: `${tag} Super` });
  await signInThroughUi(page, boss);
  await page.goto("/settings");
  await page.getByRole("combobox", { name: "Edit details for" }).selectOption({ label: other.name });
  const form = page.getByRole("form", { name: `Details for ${other.name}` });
  await form.getByRole("textbox", { name: "Official Email", exact: true }).fill("not-an-email");
  await form.getByRole("button", { name: "Save details" }).click();
  await expect(form.getByText("Invalid email address")).toBeVisible();
  expect(await savedRow(other.id)).toBeNull();
});

for (const theme of ["dark", "light"] as const) {
  test(`Approvals > Report cards: an administrator sets their branch's details and sees only their own branch (${theme} theme)`, async ({
    page,
    baseURL,
  }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const { home, other } = await branches();
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: `${tag} Admin` }); // administers the first branch only
    await signInThroughUi(page, admin);
    await page.goto("/approvals?tab=layout");

    await expect(page.getByRole("heading", { level: 2, name: `Details printed on ${home.name}'s report cards` })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Show details for" })).toHaveCount(0); // one branch: nothing to choose
    await expect(page.getByText(other.name)).toHaveCount(0);
    const form = page.getByRole("form", { name: `Details for ${home.name}` });
    await expect(form.getByText(`Using the school's: ${SCHOOL.motto}`)).toBeVisible();

    await form.getByRole("textbox", { name: "Motto / Slogan", exact: true }).fill("Our own motto");
    await form.getByRole("textbox", { name: "Address", exact: true }).fill("5 Branch Lane");
    await expect(form).toContainText('motto "Our own motto"; 5 Branch Lane · 0803 000 0001; principal Mrs School');
    await expectAccessible(page, `the details card with two own values (${theme})`);
    await form.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText(saved(home.name))).toBeVisible();

    const row = await savedRow(home.id);
    expect(row).toMatchObject({ motto: "Our own motto", address: "5 Branch Lane", principal: null, phone: null });
    expect(await savedRow(other.id)).toBeNull();

    // After a reload the saved values are the field's own, and the others still say they use the school's.
    await page.reload();
    await expect(form.getByRole("textbox", { name: "Motto / Slogan", exact: true })).toHaveValue("Our own motto");
    await expect(form.getByText(`Using the school's: ${SCHOOL.principal}`)).toBeVisible();
    await expect(form.getByRole("button", { name: "Use the school's Motto / Slogan" })).toBeVisible();
  });
}

test("Approvals > Report cards: an administrator of two branches chooses between exactly those two", async ({ page }) => {
  const { home, other } = await branches();
  const admin = await createUser({ superAdmin: false, name: `${tag} Admin` });
  for (const branch of [home, other]) await db.membership.create({ data: { userId: admin.id, branchId: branch.id, role: Role.ADMIN } });
  await signInThroughUi(page, admin);
  await page.goto("/approvals?tab=layout");

  const picker = page.getByRole("combobox", { name: "Show details for" });
  await expect(picker.locator("option")).toHaveText([other.name, home.name]); // Primary (English), Secondary (English): the other two branches are not offered
  await picker.selectOption({ label: home.name });
  await expect(page.getByRole("heading", { level: 2, name: `Details printed on ${home.name}'s report cards` })).toBeVisible();
  const form = page.getByRole("form", { name: `Details for ${home.name}` });
  await form.getByRole("textbox", { name: "Phone Number", exact: true }).fill("0900 111 2222");
  await form.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(saved(home.name))).toBeVisible();
  expect((await savedRow(home.id))?.phone).toBe("0900 111 2222");
  expect(await savedRow(other.id)).toBeNull();
});
