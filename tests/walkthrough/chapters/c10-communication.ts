import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, messages as m } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C10 Communication (task 0033, section 6.6): the branch administrator composes a broadcast to the guardians by Email (on the walkthrough's development server the message is kept in memory
// instead of leaving the machine, so it is listed as sent; real delivery is not demonstrable: COM-04; the In-App channel no longer exists, task 0055), reads the dispatch log and opens one dispatch,
// and makes a message template, previews it, edits it and deletes it (the browser asks first).

const chapter = "C10 Communication";

const tab = (page: Page, name: string) => page.getByRole("tab", { name });

export async function c10Communication(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 81,
      chapter,
      role: "Branch administrator",
      title: "Compose a broadcast to the guardians",
      caption:
        "Choose the channel and the audience, write the message and insert personalisation tags, which are filled in for each pupil. Clear empties the form. Send Broadcast sends it, and the page moves to the dispatch log, where the sends are listed.",
      covers: ["COM-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Communication");
      await walk.click(page.getByRole("button", { name: "Email", exact: true }));
      await walk.selectOption(page.getByLabel("Target Audience"), "All Guardians / Parents");
      await walk.type(page.getByLabel("Email / Message Subject"), m.broadcast.subject);
      await walk.type(page.getByLabel("Message Content"), m.broadcast.opening);
      await walk.click(page.getByRole("button", { name: "+ Student Name", exact: true }));
      await expect(page.getByLabel("Message Content")).toHaveValue(/\{\{student_name\}\}/);
      await expect(page.getByText("Live Preview (EMAIL)")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Clear", exact: true }));
      await expect(page.getByLabel("Message Content")).toHaveValue("");
      await expect(page.getByLabel("Email / Message Subject")).toHaveValue("");
      await walk.type(page.getByLabel("Email / Message Subject"), m.broadcast.subject);
      await walk.type(page.getByLabel("Message Content"), `${m.broadcast.opening}${m.broadcast.closing}`);
      await walk.click(page.getByRole("button", { name: "Send Broadcast", exact: true }));
      await expect(tab(page, "Message Logs & Dispatches")).toHaveAttribute("aria-selected", "true");
    },
  );

  await walk.step(
    {
      id: 82,
      chapter,
      role: "Branch administrator",
      title: "Read the dispatch log and open one dispatch",
      caption:
        "Every message sent is logged with its channel and status. View shows the recipient, the channel, the subject and the content.",
      covers: ["COM-03"],
    },
    async () => {
      await walk.click(tab(page, "Message Logs & Dispatches"));
      await walk.selectOption(page.getByLabel("Filter by channel"), "Email");
      await expect(page.getByRole("table", { name: "Dispatches table" }).getByRole("row")).not.toHaveCount(1);
      await walk.selectOption(page.getByLabel("Filter by status"), "Failed");
      await expect(page.getByText("No notification dispatches found for this filter.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Filter by status"), "All Statuses");
      await walk.click(page.getByRole("button", { name: "View", exact: true }).first());
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Dispatch Details")).toBeVisible();
      await expect(dialog).toContainText(m.broadcast.subject);
      await expect(dialog).toContainText(m.broadcast.closing);
      await walk.click(dialog.getByRole("button", { name: "Close", exact: true }));
      await expect(page.getByRole("dialog")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 83,
      chapter,
      role: "Branch administrator",
      title: "Make a message template and preview it",
      caption: "A template is a reusable message with {{tags}} in it. Preview shows it as it was saved.",
      covers: ["COM-02"],
    },
    async () => {
      await walk.click(tab(page, "Notification Templates"));
      await walk.click(page.getByRole("button", { name: "+ New Template", exact: true }));
      await walk.type(page.getByLabel("Template Name"), m.template.name);
      await walk.type(page.getByLabel("Template Code (UPPERCASE)"), m.template.code);
      await walk.selectOption(page.getByLabel("Channel", { exact: true }).last(), "Email");
      await walk.type(page.getByLabel("Subject Template"), m.template.subject);
      await walk.type(page.getByLabel("Body Template"), m.template.body);
      await walk.type(page.getByLabel("Expected Variables (comma-separated)"), m.template.variables);
      await walk.click(page.getByRole("button", { name: "Create Template", exact: true }));
      await expect(page.getByRole("heading", { level: 3, name: m.template.name })).toBeVisible();
      await walk.selectOption(page.getByLabel("Channel:"), "Email");
      await expect(page.getByRole("heading", { level: 3, name: m.template.name })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Preview", exact: true }).last());
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(m.template.code);
      await expect(dialog).toContainText(m.template.body);
      await walk.click(dialog.getByRole("button", { name: "✕" }));
    },
  );

  await walk.step(
    {
      id: 84,
      chapter,
      role: "Branch administrator",
      title: "Edit a template and delete it",
      caption:
        "Edit changes the name or the text. Delete asks for confirmation first. Templates the system supplies cannot be edited or deleted.",
      covers: ["COM-02"],
    },
    async () => {
      const card = page
        .getByRole("heading", { level: 3, name: m.template.name })
        .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      await walk.click(card.getByRole("button", { name: "Edit", exact: true }));
      await walk.type(page.getByLabel("Template Name"), m.template.nameEdited);
      await walk.click(page.getByRole("button", { name: "Save Changes", exact: true }));
      await expect(page.getByRole("heading", { level: 3, name: m.template.nameEdited })).toBeVisible();
      const edited = page
        .getByRole("heading", { level: 3, name: m.template.nameEdited })
        .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      await walk.acceptNextConfirm("Are you sure you want to delete this template?");
      await walk.click(edited.getByRole("button", { name: "Delete", exact: true }));
      await expect(page.getByRole("heading", { level: 3, name: m.template.nameEdited })).toHaveCount(0);
    },
  );
}
