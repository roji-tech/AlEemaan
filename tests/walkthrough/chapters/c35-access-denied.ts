import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast } from "../cast";
import { mainNav, signIn, signOut } from "./shared";

// C35 What each kind of staff member is not offered (task 0033, section 6.35): a teacher, a member of the non-teaching staff and a branch administrator each look at their sidebar and then type the address of a page it
// does not offer. The pages that are for administrators say so in a sentence; the pages that are open to read (Academics, Students) say that only an administrator of a branch can change them. The sidebar is display: the
// server decides, and each typed address shows what the person is given.

const chapter = "C35 Access denied";

const entry = (page: Page, name: string) => mainNav(page).getByRole("link", { name, exact: true });

/// Types the address of a page in a new tab, as a person would, and returns that tab.
async function typed(walk: Walk, page: Page, path: string): Promise<Page> {
  return walk.typedAddress(`${new URL(page.url()).origin}${path}`);
}

export async function c35AccessDenied(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 340,
      chapter,
      role: "Teacher",
      title: "A teacher is offered no Academics, Communication, Finance, Branches or Settings, and typed addresses say who may open them",
      caption:
        "A teacher's sidebar has the classroom's pages and none of the administration's. Typing the address of Communication, Finance, Branches or Settings shows a sentence that says who may open it. Academics opens to read, and says that only an administrator of a branch can change it.",
      covers: ["COM-05", "FIN-09", "BRN-04", "STG-08", "ACA-14"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      for (const name of ["Academics", "Communication", "Finance", "Branches", "Settings"]) await expect(entry(page, name)).toHaveCount(0);
      const communication = await typed(walk, page, "/communication");
      await expect(communication.getByText("Only administrators can open this page.")).toBeVisible();
      await walk.closeTypedAddress();
      const finance = await typed(walk, page, "/finance");
      await expect(finance.getByText(/^Only administrators can view and manage financial fee structures/)).toBeVisible();
      await walk.closeTypedAddress();
      const branches = await typed(walk, page, "/branches");
      await expect(branches.getByText(/^Only superadmins can view and manage branches/)).toBeVisible();
      await walk.closeTypedAddress();
      const settings = await typed(walk, page, "/settings");
      await expect(settings.getByText(/^Only superadmins can view and manage school settings/)).toBeVisible();
      await walk.closeTypedAddress();
      const academics = await typed(walk, page, "/academics");
      await expect(academics.getByRole("heading", { level: 1, name: "Academics" })).toBeVisible();
      await expect(academics.getByText("Only an administrator of a branch can change them.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 341,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff has no Students entry, and the same pages say who may open them",
      caption:
        "The non-teaching staff are offered the program, question bank, forms and announcements they work in, and no Students, Academics, Communication or Finance. The pages for administrators say so when their address is typed.",
      covers: ["STU-08", "COM-05", "FIN-09"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      for (const name of ["Students", "Academics", "Communication", "Finance"]) await expect(entry(page, name)).toHaveCount(0);
      const communication = await typed(walk, page, "/communication");
      await expect(communication.getByText("Only administrators can open this page.")).toBeVisible();
      await walk.closeTypedAddress();
      const finance = await typed(walk, page, "/finance");
      await expect(finance.getByText(/^Only administrators can view and manage financial fee structures/)).toBeVisible();
      await walk.closeTypedAddress();
      const students = await typed(walk, page, "/students");
      await expect(students.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 342,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator is offered no Branches or Settings",
      caption:
        "Branches and Settings are for the superadministrator. The branch administrator's sidebar leaves them out, and a typed address says that only superadmins can view and manage them, and Back to overview leads home.",
      covers: ["BRN-04", "STG-08", "SHL-08"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      for (const name of ["Branches", "Settings"]) await expect(entry(page, name)).toHaveCount(0);
      const branches = await typed(walk, page, "/branches");
      await expect(branches.getByText(/^Only superadmins can view and manage branches/)).toBeVisible();
      await walk.click(branches.getByRole("link", { name: "Back to overview" }));
      await expect(branches).toHaveURL(/\/dashboard$/);
      await walk.closeTypedAddress();
      const settings = await typed(walk, page, "/settings");
      await expect(settings.getByText(/^Only superadmins can view and manage school settings/)).toBeVisible();
    },
  );
}
