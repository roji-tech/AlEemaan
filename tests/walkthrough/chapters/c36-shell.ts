import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, pupils, shell as sh } from "../cast";
import { mainNav, signIn, signOut } from "./shared";

// C36 The shell around every page (task 0033, section 6.36): the Quick Tools drawer (a calculator, a pupil lookup and a scratchpad), the sidebar's sections that fold and stay folded after a reload, and the sidebar that
// folds to icons and opens over the page when an icon is hovered.

const chapter = "C36 Shell";

const drawer = (page: Page) => page.getByRole("dialog", { name: "Quick Tools" });
const section = (page: Page, name: string) => mainNav(page).getByRole("button", { name, exact: true });
const toggle = (page: Page) => page.getByRole("button", { name: /^(Collapse|Expand) sidebar$/ });

export async function c36Shell(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 343,
      chapter,
      role: "Superadmin",
      title: "The Quick Tools drawer has a calculator, a pupil lookup and a scratchpad",
      caption:
        "Quick Tools opens from any page, with a button or the keyboard (Alt+T here). The calculator adds, the lookup finds a pupil by name or admission number, and the scratchpad keeps a note. The drawer closes and the page underneath is as it was.",
      covers: ["SHL-05"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await page.keyboard.press("Alt+T");
      await expect(drawer(page)).toBeVisible();
      for (const key of ["7", "+", "8", "="]) await walk.click(drawer(page).getByRole("button", { name: key, exact: true }));
      await expect(drawer(page).getByTestId("calculator-result")).toHaveText("15");
      await walk.click(drawer(page).getByRole("button", { name: "Student Lookup" }));
      await walk.type(drawer(page).getByRole("searchbox"), pupils.aisha.first);
      await expect(drawer(page).getByRole("button", { name: new RegExp(`${pupils.aisha.first} ${pupils.aisha.last}`) })).toBeVisible();
      await walk.click(drawer(page).getByRole("button", { name: "Scratchpad" }));
      await walk.type(drawer(page).getByRole("textbox"), sh.note);
      await expect(drawer(page).getByRole("textbox")).toHaveValue(sh.note);
    },
  );

  await walk.step(
    {
      id: 344,
      chapter,
      role: "Superadmin",
      title: "The sidebar is in sections, and a section can be folded and stays folded",
      caption:
        "Overview stands on its own and the rest are in sections. Folding Classroom takes its pages off the screen, the others stay, and after the page is loaded again it is still folded. Unfolding brings the pages back.",
      covers: ["SHL-09"],
    },
    async () => {
      await walk.click(drawer(page).getByRole("button", { name: "Close Quick Tools" }));
      for (const name of ["Classroom", "Assessment", "Communication", "Administration"])
        await expect(section(page, name)).toHaveAttribute("aria-expanded", "true");
      await walk.click(section(page, "Classroom"));
      await expect(section(page, "Classroom")).toHaveAttribute("aria-expanded", "false");
      await expect(mainNav(page).getByRole("link", { name: "Students", exact: true })).toBeHidden();
      await expect(mainNav(page).getByRole("link", { name: "Results", exact: true })).toBeVisible();
      await page.reload();
      await expect(section(page, "Classroom")).toHaveAttribute("aria-expanded", "false");
      await walk.click(section(page, "Classroom"));
      await expect(mainNav(page).getByRole("link", { name: "Students", exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 345,
      chapter,
      role: "Superadmin",
      title: "The sidebar folds to icons and opens over the page when an icon is hovered",
      caption:
        "The round arrow on the sidebar's edge folds it to icons, and the page moves over. Pointing at an icon opens the sidebar over the page without moving it; the arrow opens it for good.",
      covers: ["SHL-10"],
    },
    async () => {
      await walk.click(toggle(page));
      await expect(toggle(page)).toHaveAccessibleName("Expand sidebar");
      await expect(page.locator("#app-sidebar")).toHaveAttribute("data-state", "rail");
      await mainNav(page).getByRole("link", { name: "Students", exact: true }).hover();
      await expect(page.locator("#app-sidebar")).toHaveAttribute("data-state", "peek");
      await walk.click(toggle(page));
      await expect(toggle(page)).toHaveAccessibleName("Collapse sidebar");
    },
  );
}
