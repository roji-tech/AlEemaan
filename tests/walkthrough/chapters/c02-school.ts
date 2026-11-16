import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, cast, school } from "../cast";

// C02 The school (task 0033, section 6.6): the superadministrator signs in to a school whose first-run wizard has made the four branches, reads the overview, follows its own link to
// Branches, adds a branch, fills in the school's profile, makes an academic session for an English branch (three terms) and one for an Arabic branch (two), and makes a term the current one.
// After each change the chapter leaves the page by clicking and comes back by clicking, and reads it again: "it rendered" is not evidence.

const chapter = "C02 The school";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const branchList = (page: Page) => page.getByRole("list", { name: "Branches" }).getByRole("listitem");

export async function c02School(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 8,
      chapter,
      role: "Superadmin",
      title: "Sign in and read the overview",
      caption: "The overview shows the school at a glance: its branches, the people with a role, and the role of whoever is signed in.",
      covers: ["DSH-01"],
    },
    async () => {
      await walk.type(page.getByLabel("Email address"), cast.superadmin.email);
      await walk.type(page.getByLabel("Password", { exact: true }), PASSWORD);
      await walk.click(page.getByRole("button", { name: "Sign in" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("region", { name: "Totals" })).toContainText(new RegExp(`Branches\\s*${school.branches.seededCount}`));
      await expect(page.getByRole("region", { name: "Totals" })).toContainText(/People with a role\s*1/);
      await expect(page.getByRole("region", { name: "Totals" })).toContainText(/Your role\s*Administrator/);
      await expect(page.getByText(school.branches.englishPrimary)).toBeVisible();
      await expect(page.getByText(school.branches.arabicPrimary)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 9,
      chapter,
      role: "Superadmin",
      title: "Follow the link to Branches",
      caption: "Manage branches opens the full list, with the same four branches and their member counts.",
      covers: ["DSH-01"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "Manage branches" }));
      await expect(page.getByRole("heading", { level: 1, name: "Branches" })).toBeVisible();
      await expect(branchList(page)).toHaveCount(school.branches.seededCount);
      await expect(branchList(page).filter({ hasText: school.branches.englishPrimary })).toContainText("No members yet");
    },
  );

  await walk.step(
    {
      id: 10,
      chapter,
      role: "Superadmin",
      title: "Add a branch",
      caption: "New branch, a name, Create: the branch is announced and listed.",
      covers: ["BRN-01"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New branch" }));
      await walk.type(page.getByLabel("Branch name"), school.branches.added);
      await walk.click(page.getByRole("button", { name: "Create", exact: true }));
      await expect(page.getByRole("status")).toContainText(`“${school.branches.added}” was created.`);
      await expect(branchList(page)).toHaveCount(school.branches.seededCount + 1);
      await expect(branchList(page).filter({ hasText: school.branches.added })).toContainText("No members yet");
    },
  );

  await walk.step(
    {
      id: 11,
      chapter,
      role: "Superadmin",
      title: "Leave and come back: the new branch is still there",
      caption: "Persistence is shown by leaving the page and returning to it.",
      covers: ["BRN-02"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("region", { name: "Totals" })).toContainText(
        new RegExp(`Branches\\s*${school.branches.seededCount + 1}`),
      );
      await walk.click(mainNav(page).getByRole("link", { name: "Branches" }));
      await expect(branchList(page)).toHaveCount(school.branches.seededCount + 1);
      await expect(page.getByText(school.branches.added)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 12,
      chapter,
      role: "Superadmin",
      title: "Fill in the school's profile",
      caption: "The profile appears on report cards, invoices and official messages.",
      covers: ["STG-01"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Settings" }));
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await walk.type(page.getByLabel("School Name"), school.profile.name);
      await walk.type(page.getByLabel("Principal / Head of School"), school.profile.principal);
      await walk.type(page.getByLabel("Phone Number"), school.profile.phone);
      await walk.type(page.getByLabel("Motto / Slogan"), school.profile.motto);
      await walk.type(page.getByLabel("Address"), school.profile.address);
      await walk.type(page.getByLabel("Official Email"), school.profile.email);
      await walk.type(page.getByLabel("Website URL"), school.profile.website);
      await walk.click(page.getByRole("button", { name: "Save Profile" }));
      await expect(page.getByText("School profile updated successfully.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 13,
      chapter,
      role: "Superadmin",
      title: "Leave and come back: the profile is still there",
      caption: "The details were saved, not just shown.",
      covers: ["STG-01"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await walk.click(mainNav(page).getByRole("link", { name: "Settings" }));
      await expect(page.getByLabel("School Name")).toHaveValue(school.profile.name);
      await expect(page.getByLabel("Principal / Head of School")).toHaveValue(school.profile.principal);
      await expect(page.getByLabel("Motto / Slogan")).toHaveValue(school.profile.motto);
      await expect(page.getByLabel("Official Email")).toHaveValue(school.profile.email);
    },
  );

  await walk.step(
    {
      id: 14,
      chapter,
      role: "Superadmin",
      title: "Make an academic session for an English branch",
      caption: "A session belongs to one branch. Its terms are made for you: three for an English branch.",
      covers: ["STG-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Academic Sessions & Terms" }));
      await expect(page.getByText("No academic sessions configured for this branch.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New Academic Session" }));
      const dialog = page.getByRole("dialog", { name: "Create Academic Session" });
      await walk.selectOption(dialog.getByLabel("Branch"), school.branches.englishPrimary);
      await walk.type(dialog.getByLabel("Session Label (e.g. 2026/2027)"), school.session.label);
      await walk.type(dialog.getByLabel("Session Start Date"), school.session.startTyped);
      await walk.type(dialog.getByLabel("Session End Date"), school.session.endTyped);
      await walk.click(dialog.getByRole("button", { name: "Create Session" }));
      const card = page.getByRole("heading", { level: 3, name: school.session.label }).locator("..");
      await expect(card.locator("span").first()).toHaveText(school.branches.englishPrimary);
      await expect(card).toContainText(school.session.shownDates);
      await expect(page.getByText("Terms & Calendars")).toBeVisible();
      await expect(page.getByText("1st Term")).toBeVisible();
      await expect(page.getByText("3rd Term")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 15,
      chapter,
      role: "Superadmin",
      title: "Make an academic session for an Arabic branch",
      caption: "An Arabic branch has two terms a year, not three.",
      covers: ["STG-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New Academic Session" }));
      const dialog = page.getByRole("dialog", { name: "Create Academic Session" });
      await walk.selectOption(dialog.getByLabel("Branch"), school.branches.arabicPrimary);
      await walk.type(dialog.getByLabel("Session Label (e.g. 2026/2027)"), school.session.label);
      await walk.type(dialog.getByLabel("Session Start Date"), school.session.startTyped);
      await walk.type(dialog.getByLabel("Session End Date"), school.session.endTyped);
      await walk.click(dialog.getByRole("button", { name: "Create Session" }));
      await expect(page.getByRole("heading", { level: 3, name: school.session.label })).toHaveCount(2);
      await walk.selectOption(page.getByLabel("Filter by Branch"), school.branches.arabicPrimary);
      await expect(page.getByText("2nd Term")).toBeVisible();
      await expect(page.getByText("3rd Term")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 16,
      chapter,
      role: "Superadmin",
      title: "Make a term the current term",
      caption: "Set Current marks the term the branch is in; the results screens offer it from now on.",
      covers: ["STG-03"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Filter by Branch"), school.branches.englishPrimary);
      await walk.click(page.getByRole("button", { name: "Set Current" }).first());
      await expect(page.getByText("CURRENT TERM", { exact: true })).toHaveCount(1);
    },
  );

  await walk.step(
    {
      id: 17,
      chapter,
      role: "Superadmin",
      title: "Leave and come back: the current term is still the current term",
      caption: "Persistence is shown by leaving the page and returning to it.",
      covers: ["STG-03"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await walk.click(mainNav(page).getByRole("link", { name: "Settings" }));
      await walk.click(page.getByRole("button", { name: "Academic Sessions & Terms" }));
      await walk.selectOption(page.getByLabel("Filter by Branch"), school.branches.englishPrimary);
      await expect(page.getByRole("heading", { level: 3, name: school.session.label })).toBeVisible();
      await expect(page.getByText("CURRENT TERM", { exact: true })).toHaveCount(1);
    },
  );
}
