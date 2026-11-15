import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, academics as a, cast, school, sections as s } from "../cast";
import { mainNav, signIn, signOut } from "./shared";
import { openEdit, saveEdit } from "./c16-users";

// C38 Settings, results approval (task 0033, section 6.38): the superadministrator groups classes into sections, says where each approver approves, and every change asks for their password again in the "Confirm it's
// you" dialog: a wrong password changes nothing and says so. Sections can be renamed and archived.

const chapter = "C38 Approval settings";

const confirmDialog = (page: Page) => page.getByRole("dialog", { name: "Confirm it's you" });

async function confirm(walk: Walk, page: Page): Promise<void> {
  await expect(confirmDialog(page)).toBeVisible();
  await walk.type(confirmDialog(page).getByLabel("Your password"), PASSWORD);
  await walk.click(confirmDialog(page).getByRole("button", { name: "Confirm and save" }));
  await expect(confirmDialog(page)).toBeHidden();
}

export async function c38ApprovalSettings(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 351,
      chapter,
      role: "Superadmin",
      title: "A section is added; a wrong password in the confirmation dialog changes nothing",
      caption:
        "Results approval groups classes into sections. A section with no name is refused on the screen. Every change then asks the superadministrator to confirm it is them: a wrong password is told in the dialog and nothing is saved; the right one adds the section.",
      covers: ["STG-05", "STG-07"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await walk.click(page.getByRole("button", { name: "Results approval", exact: true }));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add section" }));
      await expect(page.getByText("Give the section a name.")).toBeVisible();
      await walk.type(page.getByLabel("New section"), s.name);
      await walk.click(page.getByRole("button", { name: "Add section" }));
      await walk.type(confirmDialog(page).getByLabel("Your password"), s.wrongPassword);
      await walk.click(confirmDialog(page).getByRole("button", { name: "Confirm and save" }));
      await expect(confirmDialog(page)).toContainText("That password isn't right.");
      await walk.type(confirmDialog(page).getByLabel("Your password"), PASSWORD);
      await walk.click(confirmDialog(page).getByRole("button", { name: "Confirm and save" }));
      await expect(confirmDialog(page)).toBeHidden();
      await expect(page.getByText(`Added the section ${s.name}.`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 352,
      chapter,
      role: "Superadmin",
      title: "A class is put in the section; the section is renamed, archived and restored",
      caption: "A class is placed in the section, again after confirming. The section can be renamed, archived and brought back.",
      covers: ["STG-05"],
    },
    async () => {
      await walk.selectOption(page.getByLabel(`Section for ${a.classes.first}`), s.name);
      await walk.click(page.getByRole("button", { name: `Place ${a.classes.first}` }));
      await confirm(walk, page);
      await expect(page.getByText(`Put ${a.classes.first} in ${s.name}.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Rename ${s.name}` }));
      await walk.type(page.getByLabel(`New name for ${s.name}`), s.renamed);
      await walk.click(page.getByRole("button", { name: "Save name" }));
      await confirm(walk, page);
      await walk.click(page.getByRole("button", { name: `Archive ${s.renamed}` }));
      await confirm(walk, page);
      await walk.click(page.getByRole("button", { name: `Restore ${s.renamed}` }));
      await confirm(walk, page);
      await expect(page.getByRole("button", { name: `Archive ${s.renamed}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 353,
      chapter,
      role: "Superadmin",
      title: "A teacher is given the permission to approve results, confirmed with the password",
      caption:
        "A person can approve results only when the superadministrator gives them the permission. It is a school-wide decision, so the Users page asks for the superadministrator's own password.",
      covers: ["STG-06"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Users", exact: true }));
      await walk.selectOption(page.getByLabel("Status"), "Active");
      const teacher = await openEdit(walk, page, cast.teacher.name);
      await walk.click(teacher.getByRole("checkbox", { name: "May approve results" }));
      await walk.type(teacher.getByLabel("Your password", { exact: true }), PASSWORD);
      await saveEdit(walk, teacher);
      await expect(page.getByRole("listitem").filter({ hasText: cast.teacher.name })).toContainText("Approves results");
    },
  );

  await walk.step(
    {
      id: 354,
      chapter,
      role: "Superadmin",
      title: "The approver is given a section to approve in, confirmed with the password, and it is listed",
      caption:
        "Results approval lists the people who may approve. A new approver starts with everything; the superadministrator takes that away and chooses a whole section instead. The change is reviewed, confirmed with the password and then listed under their name.",
      covers: ["STG-06"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await walk.click(page.getByRole("button", { name: "Results approval", exact: true }));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await walk.click(page.getByRole("button", { name: `Change where ${cast.teacher.name} approves` }));
      await walk.click(page.getByLabel("Everything (General)"));
      await walk.click(page.getByLabel(s.renamed, { exact: true }));
      await walk.click(page.getByRole("button", { name: "Review & save" }));
      await confirm(walk, page);
      await expect(page.getByRole("list", { name: `Where ${cast.teacher.name} approves` })).toContainText(`Section: ${s.renamed}`);
    },
  );

  await walk.step(
    {
      id: 355,
      chapter,
      role: "Superadmin",
      title: "The permission is taken back",
      caption: "The permission is taken back the same way it was given, with the password, and the teacher is no longer an approver.",
      covers: ["STG-06"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Users", exact: true }));
      await walk.selectOption(page.getByLabel("Status"), "Active");
      const teacher = await openEdit(walk, page, cast.teacher.name);
      await walk.click(teacher.getByRole("checkbox", { name: "May approve results" }));
      await walk.type(teacher.getByLabel("Your password", { exact: true }), PASSWORD);
      await saveEdit(walk, teacher);
      await expect(page.getByRole("listitem").filter({ hasText: cast.teacher.name })).not.toContainText("Approves results");
    },
  );
}
