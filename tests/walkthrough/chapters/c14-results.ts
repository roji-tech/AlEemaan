import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, pupils, results as r, school } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn, findPortal, portalSignIn, portalSignOut, section } from "./c12-portal";

// C14 Results (task 0033, section 6.13): the teacher enters the first term's Mathematics marks for Primary 1 A (a mark over the maximum is refused in words, the marks are saved as drafts,
// still there after leaving the page, then submitted and read-only), writes a scheme of their own for English Language and asks for it to be approved, and is shown no approval queue and no
// preview switch. The branch administrator approves, sends the group back for review and approves again, writes the remarks on a card (in a preview, since nothing is published), downloads
// and prints it, publishes, reads the history, unlocks with a reason (too short first), and publishes again. The card's verification address is typed into fresh tabs (decision D2): the real
// one says the result is genuine, a made-up one is not found. A pupil and then a guardian read the published result in the portal.

const chapter = "C14 Results";

export const tabs = (page: Page) => page.getByRole("tablist", { name: "Results sections" });
export const tab = (page: Page, name: string) => tabs(page).getByRole("tab", { name, exact: true });
const rowOf = (page: Page, name: string): Locator => page.getByRole("row").filter({ hasText: name });

/// Chooses the class and subject on Enter marks, as the teacher does after opening the page.
async function chooseSheet(walk: Walk, page: Page, pair: string): Promise<void> {
  await walk.selectOption(page.getByLabel("Class and subject"), pair);
  await expect(page.getByRole("heading", { level: 2, name: pair })).toBeVisible();
}

/// Chooses the class and the pupil on Report cards (the term is the current one), as the administrator does.
export async function chooseCard(walk: Walk, page: Page, pupil: { first: string; last: string }): Promise<void> {
  await walk.selectOption(page.getByLabel("Class", { exact: true }), r.className);
  await walk.selectOption(page.getByLabel("Student"), `${pupil.first} ${pupil.last}`);
  await expect(page.getByRole("article", { name: `Report card for ${pupil.first} ${pupil.last}` })).toBeVisible();
}

const reviewActions = (page: Page, label: string, count: number, status: string) =>
  page.getByRole("button", { name: `${label} ${count} ${status} results of Primary 1 A Mathematics`, exact: true });

export async function c14Results(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 122,
      chapter,
      role: "Teacher",
      title: "The teacher enters marks and saves them as drafts",
      caption:
        "A teacher enters marks only for the class and subject assigned to them. Each mark has its own maximum, so a mark over it is marked as needing attention and Save drafts stays off until it is corrected. The total and the grade shown are a preview; the record is made when the marks are saved.",
      covers: ["RES-01"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Results");
      await expect(tab(page, "Enter marks")).toHaveAttribute("aria-selected", "true");
      await chooseSheet(walk, page, r.pair.maths);
      await expect(page.getByText(new RegExp(`${r.scheme}: CA 40, exam 60`))).toBeVisible();
      await walk.type(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} CA`), r.aisha.caTooHigh);
      await walk.type(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} Exam`), r.aisha.exam);
      await walk.type(page.getByLabel(`${pupils.yusuf.first} ${pupils.yusuf.last} CA`), r.yusuf.ca);
      await walk.type(page.getByLabel(`${pupils.yusuf.first} ${pupils.yusuf.last} Exam`), r.yusuf.exam);
      await expect(page.getByRole("status").filter({ hasText: "missing or out-of-range marks" })).toContainText(
        `${pupils.aisha.first} ${pupils.aisha.last}`,
      );
      await expect(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} CA`)).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByRole("button", { name: "Save drafts" })).toBeDisabled();
      await walk.type(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} CA`), r.aisha.ca);
      await expect(rowOf(page, pupils.aisha.first)).toContainText(r.aisha.total);
      await expect(rowOf(page, pupils.yusuf.first)).toContainText(r.yusuf.total);
      await walk.click(page.getByRole("button", { name: "Save drafts" }));
      await expect(page.getByText("Saved: 2 added, 0 changed, 0 removed.")).toBeVisible();
      await expect(rowOf(page, pupils.aisha.first)).toContainText("Draft");
      await expect(rowOf(page, pupils.yusuf.first)).toContainText("Draft");
    },
  );

  await walk.step(
    {
      id: 123,
      chapter,
      role: "Teacher",
      title: "Leave the page and come back: the drafts are still there",
      caption:
        "Persistence is shown by leaving the page and returning to it. The class and subject are chosen again, and the saved marks fill the sheet.",
      covers: ["RES-01"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Results");
      await chooseSheet(walk, page, r.pair.maths);
      await expect(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} CA`)).toHaveValue(r.aisha.ca);
      await expect(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} Exam`)).toHaveValue(r.aisha.exam);
      await expect(page.getByLabel(`${pupils.yusuf.first} ${pupils.yusuf.last} CA`)).toHaveValue(r.yusuf.ca);
      await expect(rowOf(page, pupils.yusuf.first)).toContainText("Draft");
    },
  );

  await walk.step(
    {
      id: 124,
      chapter,
      role: "Teacher",
      title: "Write a scheme of their own for English Language and ask for it to be approved",
      caption:
        "If a subject needs different marks from the class's scheme, the teacher writes one and says why. It is kept as a draft, can be edited, and is sent to an administrator to decide; marks under it cannot be published until it is approved.",
      covers: ["RES-02"],
    },
    async () => {
      await chooseSheet(walk, page, r.pair.english);
      await expect(page.getByText("You have no scheme of your own for this subject; the class scheme applies.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New scheme for English Language" }));
      const dialog = page.getByRole("dialog", { name: "New scheme for English Language" });
      await walk.type(dialog.getByLabel("Scheme name"), r.teacherScheme.name);
      await walk.type(dialog.getByLabel("Part 1 marks"), r.teacherScheme.caMarks);
      await walk.type(dialog.getByLabel("Exam marks"), r.teacherScheme.examMarks);
      await expect(dialog.getByText("Adds up to 100 of 100.")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Ask for approval" })).toBeDisabled();
      await walk.type(dialog.getByLabel("Why does this subject need its own scheme?"), r.teacherScheme.reason);
      await walk.click(dialog.getByRole("button", { name: "Save as a draft" }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(r.teacherScheme.shown)).toBeVisible();
      await expect(page.getByText(`Reason: ${r.teacherScheme.reason}`)).toBeVisible();
      await expect(page.getByText("Draft", { exact: true }).last()).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Edit ${r.teacherScheme.name}` }));
      const edit = page.getByRole("dialog", { name: `Edit ${r.teacherScheme.name}` });
      await expect(edit.getByLabel("Scheme name")).toHaveValue(r.teacherScheme.name);
      await walk.type(edit.getByLabel("Why does this subject need its own scheme?"), r.teacherScheme.reasonEdited);
      await walk.click(edit.getByRole("button", { name: "Save as a draft" }));
      await expect(edit).toBeHidden();
      await expect(page.getByText(`Reason: ${r.teacherScheme.reasonEdited}`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Ask for approval of ${r.teacherScheme.name}` }));
      await expect(page.getByText(`${r.teacherScheme.name} sent for approval.`)).toBeVisible();
      await expect(page.getByText("Waiting for approval")).toBeVisible();
      await expect(page.getByRole("button", { name: `Ask for approval of ${r.teacherScheme.name}` })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 125,
      chapter,
      role: "Teacher",
      title: "Submit the marks for review",
      caption:
        "Submitting hands the marks to an administrator. They become read-only on the teacher's sheet and say Submitted; from here the teacher can neither change them nor publish them.",
      covers: ["RES-03"],
    },
    async () => {
      await chooseSheet(walk, page, r.pair.maths);
      await expect(page.getByRole("button", { name: "Submit 2 for review" })).toBeEnabled();
      await walk.click(page.getByRole("button", { name: "Submit 2 for review" }));
      await expect(page.getByText("2 results submitted for review.")).toBeVisible();
      await expect(rowOf(page, pupils.aisha.first)).toContainText("Submitted");
      await expect(rowOf(page, pupils.yusuf.first)).toContainText("Submitted");
      await expect(page.getByLabel(`${pupils.aisha.first} ${pupils.aisha.last} CA`)).not.toBeEditable();
      await expect(page.getByLabel(`${pupils.yusuf.first} ${pupils.yusuf.last} Exam`)).not.toBeEditable();
      await expect(page.getByRole("button", { name: "Save drafts" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    },
  );

  await walk.step(
    {
      id: 126,
      chapter,
      role: "Teacher",
      title: "A teacher is not shown the approval queue or the preview of unpublished results",
      caption:
        "Approving is for administrators and the people they appoint, so the teacher has no Review section, and so cannot approve their own marks. A report card shows only published results: there is no preview switch for a teacher, and the card says so.",
      covers: ["RES-09", "RES-10"],
    },
    async () => {
      await expect(tabs(page).getByRole("tab")).toHaveCount(2);
      await expect(tab(page, "Review")).toHaveCount(0);
      await expect(page.getByText("Results waiting for you")).toHaveCount(0);
      await walk.click(tab(page, "Report cards"));
      await walk.selectOption(page.getByLabel("Class", { exact: true }), r.className);
      await walk.selectOption(page.getByLabel("Student"), `${pupils.yusuf.first} ${pupils.yusuf.last}`);
      await expect(page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` })).toBeVisible();
      await expect(page.getByText("No published results for this term yet.")).toBeVisible();
      await expect(page.getByLabel("Preview with results that are not published yet")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 127,
      chapter,
      role: "Branch administrator",
      title: "Approve the submitted marks",
      caption:
        "Results waiting for you lists each class and subject with how many results are in each state. Approve moves the whole group on; the next action, Publish, is what makes the results visible to families.",
      covers: ["RES-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Results");
      await expect(tabs(page).getByRole("tab")).toHaveCount(3);
      await walk.click(tab(page, "Review"));
      await expect(page.getByRole("heading", { level: 2, name: "Results waiting for you" })).toBeVisible();
      await expect(page.getByText(r.group, { exact: true })).toBeVisible();
      await expect(page.getByText("Submitted · 2")).toBeVisible();
      await walk.click(reviewActions(page, "Approve", 2, "submitted"));
      await expect(page.getByText(`${r.group}: 2 results — approve done.`)).toBeVisible();
      await expect(page.getByText("Approved · 2")).toBeVisible();
      await expect(page.getByText("Submitted · 2")).toHaveCount(0);
      await expect(reviewActions(page, "Publish", 2, "approved")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 128,
      chapter,
      role: "Branch administrator",
      title: "Send the group back for review, and approve it again",
      caption:
        "An administrator who has second thoughts sends an approved group back for review before it is published; Return to teacher, for a submitted group, hands the marks back to be changed. Here the group is sent back and approved again.",
      covers: ["RES-04"],
    },
    async () => {
      await walk.click(reviewActions(page, "Send back for review", 2, "approved"));
      await expect(page.getByText(`${r.group}: 2 results — revert done.`)).toBeVisible();
      await expect(page.getByText("Submitted · 2")).toBeVisible();
      await expect(page.getByText("Approved · 2")).toHaveCount(0);
      await expect(reviewActions(page, "Return to teacher", 2, "submitted")).toBeVisible();
      await walk.click(reviewActions(page, "Approve", 2, "submitted"));
      await expect(page.getByText("Approved · 2")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 129,
      chapter,
      role: "Branch administrator",
      title: "Read a report card before it is published, write the remarks, download and print it",
      caption:
        "Nothing is published yet, so the card is empty for everyone but the school: an administrator turns on the preview to see it, and is told it is not the card families will see. The teacher's and the principal's remarks are saved now, because they can no longer change once the results are published. The card can be printed or downloaded.",
      covers: ["RES-07"],
    },
    async () => {
      await walk.click(tab(page, "Report cards"));
      await walk.selectOption(page.getByLabel("Class", { exact: true }), r.className);
      await walk.selectOption(page.getByLabel("Student"), `${pupils.yusuf.first} ${pupils.yusuf.last}`);
      await expect(page.getByText("No published results for this term yet.")).toBeVisible();
      await walk.click(page.getByLabel("Preview with results that are not published yet"));
      await expect(page.getByRole("note")).toContainText("Preview: some of these results are not published yet");
      const card = page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` });
      await expect(card).toContainText(a.subjects.maths);
      await expect(card).toContainText(school.profile.name);
      await expect(
        card.getByRole("row", { name: new RegExp(`${a.subjects.maths}.*${r.yusuf.ca}.*${r.yusuf.exam}.*${r.yusuf.total}`) }),
      ).toBeVisible();
      await walk.type(page.getByLabel("Teacher's remark"), r.remarks.teacher);
      await walk.type(page.getByLabel("Principal's remark"), r.remarks.principal);
      await walk.click(page.getByRole("button", { name: "Save remarks" }));
      await expect(page.getByText("Remarks saved.")).toBeVisible();
      await expect(card).toContainText(r.remarks.teacher);
      await expect(card).toContainText(r.remarks.principal);
      const downloading = page.waitForEvent("download");
      await walk.click(page.getByRole("button", { name: "Download report card" }));
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^ReportCard_.+\.html$/);
      await walk.click(page.getByRole("button", { name: "Print this report card" }));
      await expect(card).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 130,
      chapter,
      role: "Branch administrator",
      title: "Publish the results and read a result's history",
      caption:
        "Publish makes the results visible to the pupils and their guardians, and gives each a verification code. The history of a result lists every step, who took it, when, and the reason where one was given.",
      covers: ["RES-04", "RES-05"],
    },
    async () => {
      await walk.click(tab(page, "Review"));
      await expect(page.getByText("Approved · 2")).toBeVisible();
      await walk.click(reviewActions(page, "Publish", 2, "approved"));
      await expect(page.getByText(`${r.group}: 2 results — publish done.`)).toBeVisible();
      await expect(page.getByText("Published · 2")).toBeVisible();
      await expect(reviewActions(page, "Lock", 2, "published")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "View audit history for Primary 1 A Mathematics" }));
      const dialog = page.getByRole("dialog", { name: `Audit History: ${r.group}` });
      await expect(dialog.getByText("Audit Trail")).toBeVisible();
      await expect(dialog).toContainText("Current status: Published");
      for (const event of ["Entered", "Submitted", "Approved", "Reverted", "Published"])
        await expect(dialog.getByText(event, { exact: true }).first()).toBeVisible();
      await expect(dialog).toContainText(`By: ${cast.teacher.name}`);
      await expect(dialog).toContainText(`By: ${cast.branchAdmin.name}`);
      await walk.click(dialog.getByRole("button", { name: "Close", exact: true }).last());
      await expect(dialog).toBeHidden();
    },
  );

  await walk.step(
    {
      id: 131,
      chapter,
      role: "Branch administrator",
      title: "Unlock published results with a reason, and publish them again",
      caption:
        "Unlock takes published results back to approved when a mistake is found: their verification codes stop working until they are published again, and the reason, at least five characters, is kept in the history. A reason that is too short is refused.",
      covers: ["RES-06"],
    },
    async () => {
      await walk.click(reviewActions(page, "Unlock", 2, "published"));
      const dialog = page.getByRole("dialog", { name: "Unlock results" });
      await expect(dialog).toContainText("go back to approved");
      await walk.type(dialog.getByLabel("Reason"), r.unlockTooShort);
      await walk.click(dialog.getByRole("button", { name: "Unlock", exact: true }));
      await expect(dialog.getByText("Give a reason of at least 5 characters.")).toBeVisible();
      await walk.type(dialog.getByLabel("Reason"), r.unlockReason);
      await walk.click(dialog.getByRole("button", { name: "Unlock", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${r.group}: 2 results — unlock done.`)).toBeVisible();
      await expect(page.getByText("Approved · 2")).toBeVisible();
      await expect(page.getByText("Published · 2")).toHaveCount(0);
      await walk.click(reviewActions(page, "Publish", 2, "approved"));
      await expect(page.getByText("Published · 2")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "View audit history for Primary 1 A Mathematics" }));
      const history = page.getByRole("dialog", { name: `Audit History: ${r.group}` });
      await expect(history).toContainText("Unlocked");
      await expect(history).toContainText(r.unlockReason);
      await walk.click(history.getByRole("button", { name: "Close", exact: true }).last());
      await expect(history).toBeHidden();
    },
  );

  // the verification address of the card, read off the screen; steps 132 and 133 type it into fresh tabs
  const verification = { address: "" };

  await walk.step(
    {
      id: 132,
      chapter,
      role: "Visitor",
      title: "Check a result with its verification address",
      caption:
        "A published card prints one address for each subject: anyone with the card can type it into a browser. The public page says the result is genuine, for which school, pupil, class and term and subject, and shows no marks and no admission number. It needs no sign-in.",
      covers: ["RES-08", "VER-01"],
    },
    async () => {
      await walk.click(tab(page, "Report cards"));
      await chooseCard(walk, page, pupils.yusuf);
      const card = page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` });
      await expect(card.getByRole("row", { name: new RegExp(a.subjects.maths) })).toBeVisible();
      await expect(page.getByText("Preview: some of these results are not published yet")).toHaveCount(0);
      await expect(page.getByText("This student's results are published, so the remarks can no longer change.")).toBeVisible();
      const listing = card.getByRole("region", { name: "Verification" });
      await expect(listing.getByRole("heading", { name: "Verify these results" })).toBeVisible();
      await expect(listing.getByRole("link")).toHaveCount(0);
      verification.address = ((await listing.textContent()) ?? "").match(/https?:\/\/\S+\/verify\/[\w-]+/)![0];
      const verify = await walk.typedAddress(verification.address);
      await expect(verify.getByRole("heading", { level: 1, name: "Verify a result" })).toBeVisible();
      await expect(verify.getByText("This result is genuine.")).toBeVisible();
      const details = verify.getByRole("status").filter({ hasText: "This result is genuine." });
      await expect(details).toContainText(`${school.profile.name} · ${school.branches.englishPrimary}`);
      await expect(details).toContainText(`${pupils.yusuf.first} ${pupils.yusuf.last[0]}`);
      await expect(details).toContainText(r.className);
      await expect(details).toContainText(a.subjects.maths);
      await expect(details).not.toContainText(pupils.yusuf.admissionNo);
      await expect(details).not.toContainText(r.yusuf.total);
    },
  );

  await walk.step(
    {
      id: 133,
      chapter,
      role: "Visitor",
      title: "A made-up verification code is not found",
      caption:
        "A code that was never issued gets a sentence that says it was not found and what to do next. The page says nothing about how the codes are made, and does not say which part was wrong.",
      covers: ["VER-02"],
    },
    async () => {
      await walk.closeTypedAddress();
      const madeUp = verification.address.replace(/\/verify\/[\w-]+$/, `/verify/${r.madeUpCode}`);
      expect(madeUp).not.toBe(verification.address);
      const verify = await walk.typedAddress(madeUp);
      await expect(verify.getByRole("heading", { level: 1, name: "Verify a result" })).toBeVisible();
      await expect(verify.getByText("This verification code was not found.")).toBeVisible();
      await expect(verify.getByText("genuine")).toHaveCount(0);
      await expect(verify.getByText(school.profile.name)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 134,
      chapter,
      role: "Pupil",
      title: "A pupil reads the published results and takes the card",
      caption:
        "Once published, the results are in the portal's Academic Results, on the same report card the school's staff read: the school's name and motto, the class, each subject's marks and grade, the average, position and remarks, and the grading legend. The card can be printed or downloaded. Before publishing, this section said there were none.",
      covers: ["POR-05"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Academic Results"));
      await expect(page.getByRole("heading", { name: "No Published Results Found" })).toHaveCount(0);
      await expect(page.getByLabel("Select Academic Term:")).toContainText(r.className);
      const card = page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` });
      await expect(card).toContainText(school.profile.name);
      await expect(card).toContainText(school.profile.motto);
      await expect(card.getByText(r.className, { exact: true })).toBeVisible();
      await expect(card.getByText("Position", { exact: true })).toBeVisible();
      await expect(
        card.getByRole("row", { name: new RegExp(`${a.subjects.maths}.*${r.yusuf.ca}.*${r.yusuf.exam}.*${r.yusuf.total}`) }),
      ).toBeVisible();
      await expect(card.getByText(`${r.yusuf.total}%`).first()).toBeVisible();
      await expect(page.getByText(r.remarks.teacher)).toBeVisible();
      const downloading = page.waitForEvent("download");
      await walk.click(page.getByRole("button", { name: "Download Card" }));
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^ReportCard_.+\.html$/);
      await walk.click(page.getByRole("button", { name: "Print Card" }));
      await expect(page.getByRole("button", { name: "Print Card" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 135,
      chapter,
      role: "Guardian",
      title: "A guardian reads the same published results",
      caption:
        "The guardian signs in with the admission number and their own phone number, and reads the same card. English Language has no marks yet, so it is not listed.",
      covers: ["POR-05"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.phone);
      await walk.click(section(page, "Academic Results"));
      await expect(page.getByRole("row", { name: new RegExp(`${a.subjects.maths}.*${r.yusuf.total}`) })).toBeVisible();
      await expect(page.getByText(r.remarks.principal)).toBeVisible();
      await expect(page.getByRole("row", { name: new RegExp(a.subjects.english) })).toHaveCount(0);
      await portalSignOut(walk, page);
    },
  );
}
