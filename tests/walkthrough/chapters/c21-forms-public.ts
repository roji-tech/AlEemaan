import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, forms as f } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C21 Forms, the public questionnaire (task 0033, section 6.21): a teacher reads the public questionnaire's address off the Forms page, signs out, and a visitor types it into a fresh tab: the
// page says the answers are sent without a name, sending nothing is refused on the screen, a rating is chosen and sent, and the same browser is told it has answered. The teacher closes the
// questionnaire, a visitor is told the link is closed, and the teacher reads the results, where an anonymous questionnaire with very few answers shows only the count.

const chapter = "C21 Forms (public questionnaire)";

const dialog = (page: Page) => page.getByRole("dialog");
const item = (page: Page, text: string): Locator => page.getByRole("listitem").filter({ hasText: text });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/// The address of the public questionnaire, read off the Forms page as a person reads it to share it.
const link = { address: "" };
/// The fresh tab the visitor typed the address into (step 215), which step 216 goes on in.
const tabs = { visitor: null as Page | null };

export async function c21FormsPublic(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 214,
      chapter,
      role: "Teacher",
      title: "Read the public questionnaire's address",
      caption: "The address of a published public questionnaire is on its row, ready to be copied and shared.",
      covers: ["FRM-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      await walk.click(tab(page, "Questionnaires"));
      const shown =
        (await item(page, f.lunch.title)
          .getByText(/\/q\/[\w-]+/)
          .textContent()) ?? "";
      link.address = shown.match(/https?:\/\/\S+\/q\/[\w-]+/)![0];
      await expect(item(page, f.lunch.title)).toContainText("Published");
    },
  );

  await walk.step(
    {
      id: 215,
      chapter,
      role: "Visitor",
      title: "Open the public link in a fresh tab, signed out; sending nothing is refused",
      caption:
        "Anyone with the address can open it without signing in. The page shows the title and says the answers are sent without a name. Pressing Send my answers with nothing answered says so on the screen and sends nothing.",
      covers: ["FRM-23", "FRM-24"],
    },
    async () => {
      await signOut(walk, page);
      const visitor = await walk.typedAddress(link.address);
      tabs.visitor = visitor;
      await expect(visitor.getByRole("heading", { level: 1, name: f.lunch.title })).toBeVisible();
      await expect(visitor.getByText("Your answers are sent without your name.")).toBeVisible();
      await walk.click(visitor.getByRole("button", { name: "Send my answers" }));
      await expect(visitor.getByText("Answer at least one question.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 216,
      chapter,
      role: "Visitor",
      title: "Choose a rating and send it",
      caption:
        "A rating from 1 to 5 is chosen and sent, and the page thanks the visitor. The visitor is not asked who they are, and nothing in what is sent says.",
      covers: ["FRM-23"],
    },
    async () => {
      const visitor = tabs.visitor!;
      await walk.click(visitor.getByRole("radio", { name: "4" }));
      await walk.click(visitor.getByRole("button", { name: "Send my answers" }));
      await expect(visitor.getByText("Thank you. Your answers were sent.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 217,
      chapter,
      role: "Teacher",
      title: "Close the questionnaire, after a confirmation",
      caption: "Closing a form asks first. A closed questionnaire stops taking answers, and its list row says Closed.",
      covers: ["FRM-08"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      await walk.click(tab(page, "Questionnaires"));
      await walk.click(item(page, f.lunch.title).getByRole("button", { name: "Close" }));
      await expect(dialog(page).getByRole("heading", { name: /^Close this/ })).toBeVisible();
      await walk.click(dialog(page).getByRole("button", { name: "Close it" }));
      await expect(item(page, f.lunch.title)).toContainText("Closed");
    },
  );

  await walk.step(
    {
      id: 218,
      chapter,
      role: "Visitor",
      title: "A closed questionnaire's link says why it cannot be answered",
      caption: "The same address now says, in a sentence, that the questionnaire is closed, with no form to fill.",
      covers: ["FRM-25"],
    },
    async () => {
      await signOut(walk, page);
      const visitor = await walk.typedAddress(link.address);
      await expect(visitor.getByText("This questionnaire is closed.")).toBeVisible();
      await expect(visitor.getByRole("button", { name: "Send my answers" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 219,
      chapter,
      role: "Teacher",
      title: "Read a questionnaire's results: an anonymous one with few answers shows only the count",
      caption:
        "Results count the answers. A questionnaire that is anonymous, with very few answers, shows only how many answered and says why the breakdown waits: it could point at one person.",
      covers: ["FRM-14"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      await walk.click(tab(page, "Questionnaires"));
      await walk.click(item(page, f.lunch.title).getByRole("link", { name: f.lunch.title }));
      await walk.click(tab(page, "Results"));
      await expect(page.getByText("1 answered · anonymous: names are not recorded")).toBeVisible();
      await expect(page.getByText(/a breakdown of very few answers could point at one person/)).toBeVisible();
    },
  );
}
