import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, notices, pupils } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C08 Announcements (task 0033, section 6.6): the branch administrator posts an announcement to one arm, saves another as a draft, edits and publishes it with a pin, searches and filters the
// feed, and deletes a draft (the browser asks first). Non-teaching staff then open the page: they read the notice for the whole branch, do not see the one aimed at a class they are not in, and are not offered the button to post.

const chapter = "C08 Announcements";

type Notice = (typeof notices)[keyof typeof notices];
// The header row of one announcement's card: its title, its badges and its Edit button.
const card = (page: Page, notice: Notice) =>
  page
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 3, name: notice.title }) })
    .filter({ has: page.getByRole("button", { name: "Edit", exact: true }) })
    .last();
const cards = (page: Page) => page.getByRole("heading", { level: 3 });

async function openComposer(walk: Walk, page: Page, notice: Notice) {
  await walk.click(page.getByRole("button", { name: "Post Announcement" }));
  const dialog = page.getByRole("dialog", { name: "Create New Broadcast Announcement" });
  await walk.type(dialog.getByLabel("Title *"), notice.title);
  await walk.type(dialog.getByLabel("Announcement Message Body *"), notice.body);
  return dialog;
}

export async function c08Announcements(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 69,
      chapter,
      role: "Branch administrator",
      title: "Post an announcement to one arm of the branch",
      caption: "An announcement has a title, a message, a branch and, if wanted, one class arm. Publish Broadcast puts it in the feed.",
      covers: ["ANN-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Announcements", "Announcements & Broadcasts");
      await expect(page.getByText("No announcements found")).toBeVisible();
      const dialog = await openComposer(walk, page, notices.resumption);
      // the options are "<class> <arm>" (found by the first full run, which chose "A")
      await walk.selectOption(dialog.getByLabel("Class Arm (Optional)"), `${a.classes.first} ${pupils.aisha.arm}`);
      await walk.click(dialog.getByRole("button", { name: "Publish Broadcast", exact: true }));
      await expect(card(page, notices.resumption)).toBeVisible();
      await expect(card(page, notices.resumption)).toContainText(new RegExp(`Class: (${a.classes.first} )?${pupils.aisha.arm}`));
      await expect(card(page, notices.resumption)).not.toContainText("Draft");
      await expect(page.getByText(notices.resumption.body)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 70,
      chapter,
      role: "Branch administrator",
      title: "Save a draft, edit it and publish it with a pin",
      caption:
        "A draft is kept but not shown to its readers. Editing it and publishing it puts it in the feed, and a pinned announcement stays at the top.",
      covers: ["ANN-02"],
    },
    async () => {
      const dialog = await openComposer(walk, page, notices.sports);
      await walk.click(dialog.getByRole("button", { name: "Save as Draft", exact: true }));
      await expect(card(page, notices.sports)).toContainText("Draft");
      await walk.click(card(page, notices.sports).getByRole("button", { name: "Edit", exact: true }));
      const edit = page.getByRole("dialog", { name: "Edit Broadcast Announcement" });
      await walk.click(edit.getByText("Pin to Top of Feed"));
      await walk.click(edit.getByRole("button", { name: "Publish Broadcast", exact: true }));
      await expect(card(page, notices.sports)).not.toContainText("Draft");
      await expect(card(page, notices.sports)).toContainText("Pinned");
      await expect(cards(page).first()).toHaveText(notices.sports.title);
    },
  );

  await walk.step(
    {
      id: 71,
      chapter,
      role: "Branch administrator",
      title: "Search and filter the feed",
      caption: "Search matches the title or the message. The status filter shows published announcements, drafts or archived ones.",
      covers: ["ANN-03"],
    },
    async () => {
      const dialog = await openComposer(walk, page, notices.scrap);
      await walk.click(dialog.getByRole("button", { name: "Save as Draft", exact: true }));
      await expect(cards(page)).toHaveCount(3);
      await walk.type(page.getByPlaceholder("Search announcements..."), "Sports");
      await expect(cards(page)).toHaveCount(1);
      await walk.type(page.getByPlaceholder("Search announcements..."), "");
      await walk.selectOption(page.getByLabel("Filter by Status"), "Drafts");
      await expect(cards(page)).toHaveCount(1);
      await expect(card(page, notices.scrap)).toBeVisible();
      await walk.selectOption(page.getByLabel("Filter by Status"), "Published");
      await expect(cards(page)).toHaveCount(2);
      await walk.selectOption(page.getByLabel("Filter by Status"), "Archived");
      await expect(page.getByText("No announcements found")).toBeVisible();
      await walk.selectOption(page.getByLabel("Filter by Status"), "All Statuses");
      await expect(cards(page)).toHaveCount(3);
    },
  );

  await walk.step(
    {
      id: 72,
      chapter,
      role: "Branch administrator",
      title: "Delete a draft: the browser asks first",
      caption: "Delete asks for confirmation before it removes the announcement.",
      covers: ["ANN-04"],
    },
    async () => {
      await walk.click(card(page, notices.scrap).getByRole("button", { name: "Edit", exact: true }));
      const edit = page.getByRole("dialog", { name: "Edit Broadcast Announcement" });
      await walk.acceptNextConfirm("Are you sure you want to delete this announcement?");
      await walk.click(edit.getByRole("button", { name: "Delete", exact: true }));
      await expect(cards(page)).toHaveCount(2);
      await expect(page.getByRole("heading", { level: 3, name: notices.scrap.title })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 73,
      chapter,
      role: "Non-teaching staff",
      title: "Non-teaching staff read what is meant for them and cannot post",
      caption:
        "The feed shows them the notice for the whole branch. An announcement aimed at one class arm is not shown to someone who is not in that class. The button to post is not shown either.",
      covers: ["ANN-05"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Announcements", "Announcements & Broadcasts");
      await expect(page.getByRole("heading", { level: 3, name: notices.sports.title })).toBeVisible();
      // the resumption notice was posted to one arm: a member of staff who is in no class does not see it (matchesAudience; the first full run expected to, and the product was right)
      await expect(page.getByRole("heading", { level: 3, name: notices.resumption.title })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Post Announcement" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    },
  );
}
