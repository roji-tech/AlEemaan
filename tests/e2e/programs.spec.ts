import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// Programs, slice P1 (task 0043): the screens, driven for real on a desktop and a phone, in both themes. What the API allows is tested in tests/api/programs.spec.ts; here is
// what a person can see and do, that a branch admin is shown nothing they cannot use, and that every state is accessible and fits the width.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FIRST = BRANCH_NAMES[0];

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

/// A program made straight in the database, so a screen test starts where it means to.
async function seedProgram(adminId: string, name = "Quran memorisation") {
  const branch = await db.branch.findFirstOrThrow({ where: { name: FIRST } });
  const program = await db.program.create({
    data: {
      name,
      kind: "ONGOING",
      status: "ACTIVE",
      createdByUserId: adminId,
      branches: { create: [{ branchId: branch.id }] },
      levelLabels: {
        create: [
          { levelIndex: 0, name: "Juz" },
          { levelIndex: 1, name: "Group" },
        ],
      },
    },
  });
  return { program, branch };
}

const groupList = (page: Page) => page.getByRole("list", { name: "Groups of the program" });

test.describe("a super admin", () => {
  test("starts a program, builds its structure, names a program admin and sees the history", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" });
    await signInThroughUi(page, admin);

    // The sidebar (or the phone's More sheet) leads to the page.
    await page.goto("/programs");
    await expect(page.getByRole("heading", { level: 1, name: "Programs" })).toBeVisible();
    await expect(page.getByText("No programs yet")).toBeVisible();

    await page.getByRole("button", { name: "New program" }).click();
    const create = page.getByRole("dialog", { name: "New program" });
    await create.getByRole("button", { name: "Create program" }).click(); // nothing filled in
    await expect(create.getByText("Please check the fields marked below.")).toBeVisible();
    await expect(create.getByText("The program name is required")).toBeVisible();
    await create.getByLabel("Program name").fill("Quran memorisation");
    await create.getByLabel(FIRST).check();
    await create.getByLabel("Level 1", { exact: true }).fill("Juz");
    await create.getByRole("button", { name: "Add a level" }).click();
    await create.getByLabel("Level 2", { exact: true }).fill("Group");
    await create.getByRole("button", { name: "Create program" }).click();

    await expect(page).toHaveURL(/\/programs\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Quran memorisation" })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Never ends", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Branches" })).toBeVisible();
    await expect(page.getByText(FIRST).first()).toBeVisible();

    // Structure: a top-level group, one inside it, a rename, an order change, archive and restore.
    await page.getByRole("tab", { name: "Structure" }).click();
    await expect(page.getByText("No groups yet")).toBeVisible();
    await page.getByRole("button", { name: "Add Juz", exact: true }).click();
    await page.getByRole("dialog", { name: "Add a Juz" }).getByLabel("Juz name").fill("Juz A");
    await page.getByRole("dialog", { name: "Add a Juz" }).getByRole("button", { name: "Add" }).click();
    await expect(groupList(page).getByText("Juz A")).toBeVisible();

    await page.getByRole("button", { name: "Add a Group inside Juz A" }).click();
    await page.getByRole("dialog", { name: "Add a Group inside Juz A" }).getByLabel("Group name").fill("Group 1");
    await page.getByRole("dialog", { name: "Add a Group inside Juz A" }).getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("list", { name: "Inside Juz A" }).getByText("Group 1")).toBeVisible();
    // A group of the last level has nothing below it.
    await expect(page.getByRole("button", { name: /Add a .* inside Group 1/ })).toHaveCount(0);

    // The same name twice is refused in the dialog, which stays open.
    await page.getByRole("button", { name: "Add Juz", exact: true }).click();
    const again = page.getByRole("dialog", { name: "Add a Juz" });
    await again.getByLabel("Juz name").fill("juz a");
    await again.getByRole("button", { name: "Add" }).click();
    await expect(again.getByText("There is already a group with this name here.")).toBeVisible();
    await again.getByLabel("Juz name").fill("Juz B");
    await again.getByRole("button", { name: "Add" }).click();
    const topLevel = groupList(page).locator(":scope > li > div > p");
    await expect(topLevel).toHaveText([/Juz A/, /Juz B/]);
    await page.getByRole("button", { name: "Move Juz B up" }).click();
    await expect(topLevel).toHaveText([/Juz B/, /Juz A/]);

    await page.getByRole("button", { name: "Rename Group 1" }).click();
    await page.getByRole("dialog", { name: "Rename Group 1" }).getByLabel("Group name").fill("Group One");
    await page.getByRole("dialog", { name: "Rename Group 1" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Group One").first()).toBeVisible();

    await page.getByRole("button", { name: "Archive Group One" }).click();
    await expect(groupList(page).getByText("Group One")).toHaveCount(0);
    await page.getByLabel(/Show archived/).check();
    await page.getByRole("button", { name: "Restore Group One" }).click();
    await expect(page.getByRole("button", { name: "Archive Group One" })).toBeVisible();

    // Level names can be changed; a level in use cannot be taken away.
    await page.getByRole("button", { name: "Change level names" }).click();
    const levels = page.getByRole("dialog", { name: "Level names" });
    await levels.getByRole("button", { name: "Remove level 2" }).click();
    await levels.getByRole("button", { name: "Save" }).click();
    await expect(levels.getByRole("alert").filter({ hasText: /groups/i })).toBeVisible();
    await levels.getByRole("button", { name: "Cancel" }).click();

    // Staff: name a member of staff of the program's branch, then end the place.
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByText("No program admin has been named")).toBeVisible();
    await page.getByRole("button", { name: "Name a program admin" }).click();
    const name = page.getByRole("dialog", { name: "Name a program admin" });
    await name.getByLabel("Member of staff").selectOption({ label: `Hassan Teacher (Teaching staff, ${FIRST})` });
    await name.getByRole("button", { name: "Name program admin" }).click();
    await expect(page.getByText("Hassan Teacher now runs the program.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Program admins" }).getByText("Hassan Teacher")).toBeVisible();
    expect(await db.programStaff.count({ where: { userId: teacher.id, status: "ACTIVE" } })).toBe(1);
    await page.getByRole("button", { name: "End Hassan Teacher's place as program admin" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "End place" }).click();
    await expect(page.getByText("No program admin has been named")).toBeVisible();

    // The history says who did what, in words.
    await page.getByRole("tab", { name: "Overview" }).click();
    const history = page.getByRole("region", { name: "History" });
    await expect(history.getByText("Amina Yusuf created the program")).toBeVisible();
    await expect(history.getByText("Amina Yusuf named a program admin")).toBeVisible();
    await expect(history.getByText("Amina Yusuf renamed a group")).toBeVisible();
  });

  test("activates, archives (the page turns read only) and restores a program", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    const { program } = await seedProgram(admin.id);
    await db.program.update({ where: { id: program.id }, data: { status: "DRAFT" } });
    await signInThroughUi(page, admin);
    await page.goto(`/programs/${program.id}`);

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("The program is active.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Activate" })).toHaveCount(0);

    await page.getByRole("button", { name: "Archive", exact: true }).click();
    const sure = page.getByRole("dialog", { name: "Archive this program?" });
    await sure.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("This program is archived")).toHaveCount(0);
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await sure.getByRole("button", { name: "Archive program" }).click();
    await expect(page.getByText("This program is archived and can only be read.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Structure" }).click();
    await expect(page.getByRole("button", { name: "Add Juz", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("The program is back as a draft.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Activate" })).toBeVisible();
  });

  test("edits the details; a bad date is explained next to the field", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    const { program } = await seedProgram(admin.id);
    await db.program.update({
      where: { id: program.id },
      data: { kind: "FIXED_TERM", startsOn: new Date("2026-11-03"), endsOn: new Date("2027-05-02") },
    });
    await signInThroughUi(page, admin);
    await page.goto(`/programs/${program.id}`);
    await expect(page.getByText("3 Nov 2026 to 2 May 2027").first()).toBeVisible();

    await page.getByRole("button", { name: "Edit details" }).click();
    const edit = page.getByRole("dialog", { name: "Edit details" });
    await edit.getByLabel("Ends on (the last day)").fill("2026-11-03");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit.getByText("The end date must be after the start date.")).toBeVisible();
    await edit.getByLabel("Ends on (the last day)").fill("2027-06-30");
    await edit.getByLabel("Program name").fill("Quran memorisation (evening)");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Quran memorisation (evening)" })).toBeVisible();
    await expect(page.getByText("3 Nov 2026 to 30 Jun 2027").first()).toBeVisible();
  });

  test("a branch can be added and removed; the program's own branch cannot be removed", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    const { program, branch } = await seedProgram(admin.id);
    const own = await db.branch.create({ data: { name: "Daarul-Hadeeth" } });
    await db.program.update({ where: { id: program.id }, data: { ownBranchId: own.id, branches: { create: [{ branchId: own.id }] } } });
    await signInThroughUi(page, admin);
    await page.goto(`/programs/${program.id}`);
    await expect(page.getByText("Its own branch")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Daarul-Hadeeth from the program" })).toHaveCount(0);

    await page.getByRole("button", { name: "Add a branch" }).click();
    await page.getByRole("dialog", { name: "Add a branch" }).getByLabel("Branch").selectOption({ label: BRANCH_NAMES[1] });
    await page.getByRole("dialog", { name: "Add a branch" }).getByRole("button", { name: "Add branch" }).click();
    await expect(page.getByText("The branch was added.")).toBeVisible();
    await page.getByRole("button", { name: `Remove ${BRANCH_NAMES[1]} from the program` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove branch" }).click();
    await expect(page.getByText("The branch was removed.")).toBeVisible();
    expect(await db.programBranch.count({ where: { programId: program.id, branchId: branch.id } })).toBe(1);
  });
});

test.describe("everyone else", () => {
  test("a branch administrator sees the programs of their branch and no button to change anything", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN });
    const adminA = await createUser({ role: Role.ADMIN, superAdmin: false });
    const { program } = await seedProgram(sa.id);
    const juz = await db.programGroup.create({ data: { programId: program.id, levelIndex: 0, name: "Juz A" } });
    expect(juz.id).toBeTruthy();
    await signInThroughUi(page, adminA);

    await page.goto("/programs");
    await expect(page.getByRole("button", { name: "New program" })).toHaveCount(0);
    await page.getByRole("link", { name: "Quran memorisation" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Quran memorisation" })).toBeVisible();
    for (const name of ["Edit details", "Activate", "Archive", "Add a branch", "Restore"])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "History" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Structure" }).click();
    await expect(groupList(page).getByText("Juz A")).toBeVisible();
    for (const name of ["Add Juz", "Change level names"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Rename|Archive|Move)/ })).toHaveCount(0);
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByRole("button", { name: "Name a program admin" })).toHaveCount(0);
  });

  test("a teacher with no place sees an empty list, and a program's address says only that it could not be found", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN });
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    const { program } = await seedProgram(sa.id);
    await signInThroughUi(page, teacher);
    await page.goto("/programs");
    await expect(page.getByText("You are not part of any program yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Quran memorisation" })).toHaveCount(0);

    // A real program they have no place in and an address that does not exist read exactly the same: nothing says which is which.
    await page.goto(`/programs/${program.id}`);
    const hidden = await page.getByRole("main").innerText();
    await expect(page.getByText("We could not find that program.")).toBeVisible();
    await expect(page.getByText("Quran memorisation")).toHaveCount(0);
    await page.goto("/programs/does-not-exist");
    await expect(page.getByText("We could not find that program.")).toBeVisible();
    expect(await page.getByRole("main").innerText()).toBe(hidden);
    await page.getByRole("link", { name: "All programs" }).click();
    await expect(page).toHaveURL(/\/programs$/);
  });

  test("a named program admin finds the program through the sidebar page and can change its structure", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN });
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" });
    const { program, branch } = await seedProgram(sa.id);
    await db.programStaff.create({
      data: { programId: program.id, userId: teacher.id, branchId: branch.id, role: "ADMIN", createdByUserId: sa.id },
    });
    await signInThroughUi(page, teacher);
    await page.goto("/programs");
    await page.getByRole("link", { name: "Quran memorisation" }).click();
    await page.getByRole("tab", { name: "Structure" }).click();
    await page.getByRole("button", { name: "Add Juz", exact: true }).click();
    await page.getByRole("dialog", { name: "Add a Juz" }).getByLabel("Juz name").fill("Juz C");
    await page.getByRole("dialog", { name: "Add a Juz" }).getByRole("button", { name: "Add" }).click();
    await expect(groupList(page).getByText("Juz C")).toBeVisible();
    // but not the things only a super admin does
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByRole("button", { name: "Name a program admin" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByRole("button", { name: "Add a branch" })).toHaveCount(0);
  });
});

test.describe("the programs switch in Settings", () => {
  test("a super admin turns programs off for the school and back on; a branch can be turned off but not on over the school", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await seedProgram(admin.id);
    await signInThroughUi(page, admin);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Programs", exact: true }).click();
    await expect(page.getByText("On for the school", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Turn off programs for ${FIRST}` }).click();
    await expect(page.getByText(`${FIRST} no longer takes part in programs.`)).toBeVisible();
    await expect(page.getByText(/off, set by the branch/)).toBeVisible();
    await page.getByRole("button", { name: `Turn programs back on for ${FIRST}` }).click();
    await expect(page.getByText(`${FIRST} takes part in programs again.`)).toBeVisible();

    await page.getByRole("button", { name: "Turn off for the school" }).click();
    await expect(page.getByText("Off for the school", { exact: true })).toBeVisible();
    await expect(page.getByText(/off, set by the school/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Turn (off programs for|programs back on for)/ })).toHaveCount(0); // the school decides; a branch cannot widen it

    await page.goto("/programs");
    await expect(page.getByText("Programs are switched off for the school.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New program" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Quran memorisation" })).toBeVisible(); // a super admin can still read what exists
    await page.getByRole("link", { name: /Switch them on in Settings/ }).click();
    await page.getByRole("button", { name: "Programs", exact: true }).click();
    await page.getByRole("button", { name: "Turn on for the school" }).click();
    await expect(page.getByText("Programs are on for the school.")).toBeVisible();
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`${theme} theme: the list, the new-program dialog and every tab of a program`, async ({ page, context }) => {
      const admin = await createUser({ role: Role.ADMIN });
      const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" });
      const { program, branch } = await seedProgram(admin.id);
      const juz = await db.programGroup.create({ data: { programId: program.id, levelIndex: 0, name: "Juz A" } });
      await db.programGroup.create({ data: { programId: program.id, parentId: juz.id, levelIndex: 1, name: "Group 1" } });
      await db.programStaff.create({
        data: { programId: program.id, userId: teacher.id, branchId: branch.id, role: "ADMIN", createdByUserId: admin.id },
      });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, admin);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      await page.goto("/programs");
      await expect(page.getByRole("link", { name: "Quran memorisation" })).toBeVisible();
      await expectAccessible(page, `${theme} list`);
      await expectFits(page, `${theme} list`);

      await page.getByRole("button", { name: "New program" }).click();
      await page.getByRole("dialog", { name: "New program" }).getByLabel("Give it a branch of its own").check();
      await page.getByRole("dialog", { name: "New program" }).getByLabel("Kind").selectOption("FIXED_TERM");
      await expectAccessible(page, `${theme} new-program dialog`);
      await page.keyboard.press("Escape");

      await page.getByRole("link", { name: "Quran memorisation" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Quran memorisation" })).toBeVisible();
      for (const tab of ["Overview", "Structure", "Staff"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
        await expectAccessible(page, `${theme} ${tab}`);
        await expectFits(page, `${theme} ${tab}`);
      }
      await page.getByRole("tab", { name: "Structure" }).click();
      await page.getByRole("button", { name: "Rename Juz A" }).click();
      await expectAccessible(page, `${theme} rename dialog`);
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: "Staff" }).click();
      await page.getByRole("button", { name: "Name a program admin" }).click();
      await expectAccessible(page, `${theme} name-admin dialog`);
    });
  }

  test("the Settings tab for programs", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Programs", exact: true }).click();
    await expect(page.getByText("On for the school", { exact: true })).toBeVisible();
    await expectAccessible(page, "settings programs");
    await expectFits(page, "settings programs");
  });
});
