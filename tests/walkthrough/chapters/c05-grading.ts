import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, grading as g } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C05 Assessment and grading (task 0033, section 6.6): how a mark is built and how a score becomes a letter. The branch administrator makes an assessment scheme (a slip in its name is
// corrected, a total that does not reach 100 is shown as such), archives a second one, makes a grade scale from the WAEC-style template and the branch's default, archives a second, and
// gives one class a scheme of its own. The superadministrator then makes a school-wide scheme, and sees all the branches the branch administrator could not.

const chapter = "C05 Assessment and grading";

const tab = (page: Page, name: string) => page.getByRole("tab", { name });

async function openGrading(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Academics");
  await walk.click(tab(page, "Assessment and grading"));
  await expect(page.getByRole("heading", { level: 2, name: "Assessment schemes" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Grade scales" })).toBeVisible();
}

export async function c05Grading(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 48,
      chapter,
      role: "Branch administrator",
      title: "Make an assessment scheme: parts that add up to 100",
      caption:
        "A scheme says how a mark is built: continuous-assessment parts plus the exam. The dialog shows the running total, and a total that is not 100 is marked as wrong.",
      covers: ["ACA-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openGrading(walk, page);
      await walk.click(page.getByRole("button", { name: "New scheme", exact: true }));
      const dialog = page.getByRole("dialog", { name: "New assessment scheme" });
      await walk.type(dialog.getByLabel("Scheme name"), g.scheme.slip);
      await walk.type(dialog.getByLabel("Part 1 name"), "CA");
      await walk.type(dialog.getByLabel("Part 1 marks"), "20");
      await walk.click(dialog.getByRole("button", { name: "Add a part", exact: true }));
      await walk.type(dialog.getByLabel("Part 2 name"), "Test 1");
      await walk.type(dialog.getByLabel("Part 2 marks"), "20");
      await walk.type(dialog.getByLabel("Exam marks"), "50");
      await expect(dialog.getByText("Adds up to 90 of 100.")).toBeVisible();
      await walk.type(dialog.getByLabel("Exam marks"), "60");
      await expect(dialog.getByText("Adds up to 100 of 100.")).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Create scheme", exact: true }));
      await expect(page.getByText(`${g.scheme.slip} created.`)).toBeVisible();
      await expect(page.getByText("CA · 20", { exact: true })).toBeVisible();
      await expect(page.getByText("Test 1 · 20", { exact: true })).toBeVisible();
      await expect(page.getByText("Exam · 60", { exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 49,
      chapter,
      role: "Branch administrator",
      title: "Correct the scheme's name",
      caption: "A scheme that no result uses yet can be edited. Once results use it, it is locked and a change makes a new version.",
      covers: ["ACA-08"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Edit ${g.scheme.slip}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Edit ${g.scheme.slip}` });
      await walk.type(dialog.getByLabel("Scheme name"), g.scheme.name);
      await walk.click(dialog.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText(`${g.scheme.name} saved.`)).toBeVisible();
      await expect(page.getByText(g.scheme.slip)).toHaveCount(0);
      await expect(page.getByText("Branch default · out of 100")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 50,
      chapter,
      role: "Branch administrator",
      title: "Make a scheme for one class and archive it",
      caption:
        "A branch has one default scheme, so a second one applies to a class. Archiving takes a scheme out of use; nothing that used it is lost.",
      covers: ["ACA-08"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New scheme", exact: true }));
      const dialog = page.getByRole("dialog", { name: "New assessment scheme" });
      await walk.type(dialog.getByLabel("Scheme name"), g.scheme.trial);
      await walk.selectOption(dialog.getByLabel("Applies to"), a.classes.second);
      await walk.type(dialog.getByLabel("Part 1 name"), "CA");
      await walk.type(dialog.getByLabel("Part 1 marks"), "40");
      await walk.type(dialog.getByLabel("Exam marks"), "60");
      await walk.click(dialog.getByRole("button", { name: "Create scheme", exact: true }));
      await expect(page.getByText(`${g.scheme.trial} created.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Archive ${g.scheme.trial}`, exact: true }));
      await expect(page.getByText(`${g.scheme.trial} archived.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Archive ${g.scheme.trial}`, exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 51,
      chapter,
      role: "Branch administrator",
      title: "Make a grade scale from the WAEC-style template: the branch's first one is its default",
      caption:
        "A grade scale turns a score into a letter. The template fills the bands in; the first scale a branch makes becomes its default, and the default cannot be archived.",
      covers: ["ACA-09"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New grade scale", exact: true }));
      const dialog = page.getByRole("dialog", { name: "New grade scale" });
      await walk.type(dialog.getByLabel("Scale name"), g.scale.name);
      await walk.click(dialog.getByRole("button", { name: "Use the WAEC-style template", exact: true }));
      await expect(dialog.getByLabel("Band 2 grade")).not.toHaveValue("");
      await walk.type(dialog.getByLabel("Band 1 remark"), "Excellent");
      await walk.click(dialog.getByRole("button", { name: "Create scale", exact: true }));
      await expect(page.getByText(`${g.scale.name} created.`)).toBeVisible();
      // the first scale of the branch is made the default by the product itself: it carries the pill, and offers neither "Make default" nor "Archive" (found by the first full run, which
      // expected to press "Make default" here)
      await expect(page.getByText("Default", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Make ${g.scale.name} the default`, exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Archive ${g.scale.name}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole("region", { name: `Bands of ${g.scale.name}` })).toContainText("Excellent");
    },
  );

  await walk.step(
    {
      id: 52,
      chapter,
      role: "Branch administrator",
      title: "Make a second grade scale, change the default and back, and archive it",
      caption:
        "Any scale can be made the default; the default cannot be archived, so the second one is archived once the first is the default again.",
      covers: ["ACA-09"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New grade scale", exact: true }));
      const dialog = page.getByRole("dialog", { name: "New grade scale" });
      await walk.type(dialog.getByLabel("Scale name"), g.scale.trial);
      await walk.click(dialog.getByRole("button", { name: "Use the WAEC-style template", exact: true }));
      await walk.click(dialog.getByRole("button", { name: "Create scale", exact: true }));
      await expect(page.getByText(`${g.scale.trial} created.`)).toBeVisible();
      // the second scale is not the default, so it offers both buttons; making it the default hands the pill over and frees the first scale to be archived
      await walk.click(page.getByRole("button", { name: `Make ${g.scale.trial} the default`, exact: true }));
      await expect(page.getByText(`${g.scale.trial} is now the default.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Archive ${g.scale.name}`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Archive ${g.scale.trial}`, exact: true })).toHaveCount(0);
      // and back: the first scale is the branch's default again, and the second can now be archived
      await walk.click(page.getByRole("button", { name: `Make ${g.scale.name} the default`, exact: true }));
      await expect(page.getByText(`${g.scale.name} is now the default.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Archive ${g.scale.trial}`, exact: true }));
      await expect(page.getByText(`${g.scale.trial} archived.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Archive ${g.scale.name}`, exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 53,
      chapter,
      role: "Branch administrator",
      title: "Give one class a scheme of its own",
      caption: "Marks use the most specific scheme that applies: the class's own before the branch default.",
      covers: ["ACA-10"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Set the scheme for ${a.classes.first}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Scheme for ${a.classes.first}` });
      await walk.type(dialog.getByLabel("Scheme name"), g.classScheme);
      await expect(dialog.getByText("Adds up to 100 of 100.")).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Save scheme", exact: true }));
      await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
      await expect(page.getByText(new RegExp(`^${g.classScheme}:`))).toBeVisible();
      await expect(page.getByRole("button", { name: `Change the scheme for ${a.classes.first}`, exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 54,
      chapter,
      role: "Branch administrator",
      title: "Leave and come back: the schemes and the scale are still there",
      caption: "Persistence is shown by leaving the page and returning to it.",
      covers: ["ACA-08", "ACA-09", "ACA-10"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openGrading(walk, page);
      // the name and its "· version 1" are one paragraph, so an exact match on the name alone finds nothing (the first full run did exactly that)
      await expect(page.getByText(new RegExp(`^${g.scheme.name} · version`))).toBeVisible();
      await expect(page.getByText(g.scheme.trial)).toHaveCount(0);
      await expect(page.getByRole("region", { name: `Bands of ${g.scale.name}` })).toContainText("Excellent");
      await expect(page.getByText(g.scale.trial)).toHaveCount(0);
      await expect(page.getByText("Default", { exact: true })).toBeVisible();
      await expect(page.getByText(new RegExp(`^${g.classScheme}:`))).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 55,
      chapter,
      role: "Superadmin",
      title: "The superadministrator sees every branch and sets a school-wide scheme",
      caption:
        "Only the superadministrator picks the branch and can set a scheme for the whole school; a branch administrator's own scheme still wins in their branch.",
      covers: ["ACA-10", "ACA-13"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openGrading(walk, page);
      await expect(page.getByLabel("Branch").first().locator("option")).toHaveCount(5);
      await expect(page.getByRole("heading", { level: 3, name: "School-wide default" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New school-wide scheme", exact: true }));
      const dialog = page.getByRole("dialog", { name: "New school-wide scheme" });
      await walk.type(dialog.getByLabel("Scheme name"), g.schoolWide);
      await walk.click(dialog.getByText("Make it the default for every branch that has no scheme of its own"));
      await walk.click(dialog.getByRole("button", { name: "Save scheme", exact: true }));
      await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
      await expect(page.getByText(g.schoolWide)).toBeVisible();
    },
  );
}
