import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { approvals as ap, cast, pupils, results as r, school } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn } from "./c12-portal";
import { chooseCard, tab as resultsTab } from "./c14-results";

// C15 Approvals (task 0033, section 6.14): the page where requests are decided and the rules for the report cards and the public verification page are set. The branch administrator
// approves the teacher's own scheme for English Language (the request C14 left waiting, with a reason), asks for the public verification page to show initials only (a request, with a reason),
// is refused when they try to decide it themselves, and changes what the report cards show (which takes effect at once, because no superadmin has put it behind approval), then puts it back.
// The superadmin refuses the request with a reason, changes the verification page themselves and reads on a typed address that the public page follows, switches the layout approval on and
// off, and allows an administrator to approve their own marks and withdraws it. A teacher and a member of the non-teaching staff are shown no Approvals entry, and a typed address says the
// page is for administrators.

const chapter = "C15 Approvals";

const sections = (page: Page) => page.getByRole("tablist", { name: "Approvals sections" });
const section = (page: Page, name: string) => sections(page).getByRole("tab", { name, exact: true });
const requestOf = (page: Page, what: string): Locator => page.getByRole("listitem").filter({ hasText: what });
const SCHEME = "A teacher's assessment scheme";
const VERIFICATION = "Public verification page";

/// Opens Approvals from the sidebar, as every signed-in administrator does.
async function openApprovals(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Approvals", "Approvals and rules");
}

/// Opens the first pupil's card on Results as an administrator does (the superadmin chooses the branch first, a branch administrator has only one).
async function openCardAsBranchAdmin(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Results");
  await walk.click(resultsTab(page, "Report cards"));
  await chooseCard(walk, page, pupils.yusuf);
}

export async function c15Approvals(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 136,
      chapter,
      role: "Branch administrator",
      title: "Approve the teacher's own scheme, with a reason",
      caption:
        "A request waits for a decision under Requests: who asked, when, and why. Approve and Reject both need a reason, which is recorded with the decision; the button stays off until one is typed. The administrator cannot decide a request they made themselves, and a branch administrator has no Self-approval section.",
      covers: ["APR-01"],
    },
    async () => {
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openApprovals(walk, page);
      await expect(
        page.getByText("Your requests and the decisions on them, and the rules for your branch. A superadmin decides what needs approval."),
      ).toBeVisible();
      await expect(sections(page).getByRole("tab")).toHaveCount(3);
      await expect(section(page, "Self-approval")).toHaveCount(0);
      await expect(section(page, "Requests")).toHaveAttribute("aria-selected", "true");
      const request = requestOf(page, SCHEME);
      await expect(request).toContainText(`Asked by ${cast.teacher.name}`);
      await expect(request).toContainText("waiting");
      await expect(request).toContainText(`Reason: ${r.teacherScheme.reasonEdited}`);
      await walk.click(page.getByRole("button", { name: `Approve ${SCHEME} from ${cast.teacher.name}` }));
      const dialog = page.getByRole("dialog", { name: "Approve this request" });
      await expect(dialog).toContainText(`${SCHEME} from ${cast.teacher.name}.`);
      await expect(dialog.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
      await walk.type(dialog.getByLabel("Your reason (recorded with the decision)"), ap.approveReason);
      await walk.click(dialog.getByRole("button", { name: "Approve", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText("Approved.", { exact: true })).toBeVisible();
      await expect(page.getByText("Nothing here.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Show", { exact: true }), "Approved");
      const decided = requestOf(page, SCHEME);
      await expect(decided).toContainText(`approved by ${cast.branchAdmin.name}`);
      await expect(decided).toContainText(`Decision: ${ap.approveReason}`);
    },
  );

  await walk.step(
    {
      id: 137,
      chapter,
      role: "Branch administrator",
      title: "Ask for the public verification page to show initials only",
      caption:
        "An administrator can propose a change to what the public verification page shows for their branch. It needs a reason, goes to a superadmin and does not change the page until it is approved. The administrator is told so, sees the request waiting, and is refused in words when they try to decide it themselves: the refusal is on the screen at the end of this step.",
      covers: ["APR-04", "APR-01"],
    },
    async () => {
      await walk.click(section(page, "Verification page"));
      await expect(
        page.getByText(
          "Always shown, whatever you choose: the school, the branch, the class, the term, the date published, and that the card is genuine.",
        ),
      ).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Show the pupil's name" })).toBeChecked();
      await walk.selectOption(page.getByLabel("How the name is written"), ap.nameFormat.initials);
      await expect(page.getByRole("button", { name: "Send for approval" })).toBeDisabled();
      await walk.type(page.getByLabel("Why is this change needed? (a superadmin decides)"), ap.proposalReason);
      await walk.click(page.getByRole("button", { name: "Send for approval" }));
      await expect(page.getByText("Sent to a superadmin for approval. The public page stays as it is until it is approved.")).toBeVisible();
      await walk.click(section(page, "Requests"));
      const request = requestOf(page, VERIFICATION);
      await expect(request).toContainText(`Asked by ${cast.branchAdmin.name}`);
      await expect(request).toContainText("waiting");
      await expect(request).toContainText(`Reason: ${ap.proposalReason}`);
      await walk.click(page.getByRole("button", { name: `Approve ${VERIFICATION} from ${cast.branchAdmin.name}` }));
      const dialog = page.getByRole("dialog", { name: "Approve this request" });
      await walk.type(dialog.getByLabel("Your reason (recorded with the decision)"), ap.selfDecideReason);
      await walk.click(dialog.getByRole("button", { name: "Approve", exact: true }));
      await expect(dialog.getByText("Only a superadmin can decide this request")).toBeVisible();
      await expect(requestOf(page, VERIFICATION)).toContainText("waiting");
    },
  );

  await walk.step(
    {
      id: 138,
      chapter,
      role: "Branch administrator",
      title: "Choose what the report cards show, and read a card",
      caption:
        "The layout of a branch's report cards can be changed by its administrator: the school logo, the signature lines and the next-term date can each be shown or hidden. With no superadmin approval switched on, Save takes effect at once, and the next card opened shows it.",
      covers: ["APR-02"],
    },
    async () => {
      const refusal = page.getByRole("dialog", { name: "Approve this request" });
      await walk.click(refusal.getByRole("button", { name: "Cancel", exact: true }));
      await expect(refusal).toBeHidden();
      await expect(requestOf(page, VERIFICATION)).toContainText("waiting");
      await walk.click(section(page, "Report cards"));
      await expect(page.getByRole("group", { name: `Layout for ${school.branches.englishPrimary}` })).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Signature line" })).toBeChecked();
      await walk.click(page.getByRole("checkbox", { name: "Signature line" }));
      await expect(page.getByRole("checkbox", { name: "Signature line" })).not.toBeChecked();
      await walk.click(page.getByRole("button", { name: "Save layout" }));
      await expect(page.getByText(`Saved. ${school.branches.englishPrimary} report cards now use this layout.`)).toBeVisible();
      await openCardAsBranchAdmin(walk, page);
      const card = page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` });
      await expect(card.getByText("Next Term")).toBeVisible();
      await expect(card.getByRole("region", { name: "Signatures" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 139,
      chapter,
      role: "Branch administrator",
      title: "Put the signature lines back",
      caption: "A change to the layout is undone the same way it was made. The next card opened has the signature lines again.",
      covers: ["APR-02"],
    },
    async () => {
      await openApprovals(walk, page);
      await walk.click(section(page, "Report cards"));
      await expect(page.getByRole("checkbox", { name: "Signature line" })).not.toBeChecked();
      await walk.click(page.getByRole("checkbox", { name: "Signature line" }));
      await walk.click(page.getByRole("button", { name: "Save layout" }));
      await expect(page.getByText(`Saved. ${school.branches.englishPrimary} report cards now use this layout.`)).toBeVisible();
      await openCardAsBranchAdmin(walk, page);
      const card = page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` });
      await expect(card.getByRole("region", { name: "Signatures" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 140,
      chapter,
      role: "Superadmin",
      title: "Reject a request, with a reason",
      caption:
        "A change to the public verification page is decided by a superadmin only. Reject needs a reason; the request leaves the waiting list and is found under Rejected with who decided it and why. The superadmin has a fourth section, Self-approval, and chooses the branch first.",
      covers: ["APR-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openApprovals(walk, page);
      await expect(
        page.getByText(
          "Decide requests, choose what every branch's report cards and public verification page show, and say who may approve their own marks.",
        ),
      ).toBeVisible();
      await expect(sections(page).getByRole("tab")).toHaveCount(4);
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      const request = requestOf(page, VERIFICATION);
      await expect(request).toContainText(`Asked by ${cast.branchAdmin.name}`);
      await expect(request).toContainText(`Reason: ${ap.proposalReason}`);
      await expect(request).toContainText("Proposed:");
      await walk.click(page.getByRole("button", { name: `Reject ${VERIFICATION} from ${cast.branchAdmin.name}` }));
      const dialog = page.getByRole("dialog", { name: "Reject this request" });
      await expect(dialog.getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
      await walk.type(dialog.getByLabel("Your reason (recorded with the decision)"), ap.rejectReason);
      await walk.click(dialog.getByRole("button", { name: "Reject", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText("Rejected.", { exact: true })).toBeVisible();
      await expect(page.getByText("Nothing here.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Show", { exact: true }), "Rejected");
      const decided = requestOf(page, VERIFICATION);
      await expect(decided).toContainText(`rejected by ${cast.superadmin.name}`);
      await expect(decided).toContainText(`Decision: ${ap.rejectReason}`);
      await walk.selectOption(page.getByLabel("Show", { exact: true }), "Approved");
      await expect(requestOf(page, SCHEME)).toContainText(`approved by ${cast.branchAdmin.name}`);
    },
  );

  await walk.step(
    {
      id: 141,
      chapter,
      role: "Superadmin",
      title: "Choose what the public verification page shows, and read that the page follows",
      caption:
        "A superadmin sets what anyone holding a card's address sees, for every branch or for one, with no request and no reason. A fixed minimum is always shown. The pupil's name is written in full here; a fresh tab with the card's address shows it, and the next step puts the setting back.",
      covers: ["APR-04", "VER-01"],
    },
    async () => {
      await walk.click(section(page, "Verification page"));
      await expect(page.getByLabel("Applies to")).toHaveValue("__all__");
      await expect(page.getByLabel("Why is this change needed? (a superadmin decides)")).toHaveCount(0);
      await walk.selectOption(page.getByLabel("How the name is written"), ap.nameFormat.full);
      await walk.click(page.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
      await openPage(walk, page, "Results");
      await walk.click(resultsTab(page, "Report cards"));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await chooseCard(walk, page, pupils.yusuf);
      const card = page.getByRole("article", { name: `Report card for ${pupils.yusuf.first} ${pupils.yusuf.last}` });
      const listing = card.getByRole("region", { name: "Verification" });
      const address = ((await listing.textContent()) ?? "").match(/https?:\/\/\S+\/verify\/[\w-]+/)![0];
      const verify = await walk.typedAddress(address);
      const details = verify.getByRole("status").filter({ hasText: "This result is genuine." });
      await expect(details).toBeVisible();
      await expect(details).toContainText(`${pupils.yusuf.first} ${pupils.yusuf.last}`);
      await expect(details).toContainText(`${school.profile.name} · ${school.branches.englishPrimary}`);
      await expect(details).not.toContainText(pupils.yusuf.admissionNo);
      await expect(details).not.toContainText(r.yusuf.total);
    },
  );

  await walk.step(
    {
      id: 142,
      chapter,
      role: "Superadmin",
      title: "Put the verification page back as it was",
      caption:
        "The setting is changed back the same way. A superadmin's change needs no request, so it is saved at once and the next card address shows the first name and the first letter of the last name again.",
      covers: ["APR-04"],
    },
    async () => {
      await walk.closeTypedAddress();
      await openApprovals(walk, page);
      await walk.click(section(page, "Verification page"));
      await expect(page.getByLabel("How the name is written")).toHaveValue("FULL");
      await walk.selectOption(page.getByLabel("How the name is written"), ap.nameFormat.standard);
      await walk.click(page.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
      await expect(page.getByLabel("How the name is written")).toHaveValue("FIRST_LAST_INITIAL");
    },
  );

  await walk.step(
    {
      id: 143,
      chapter,
      role: "Superadmin",
      title: "Put administrators' layout changes behind approval, and take them off again",
      caption:
        "One tick makes every administrator's change to the report-card layout a request with a reason, which the superadmin decides under Requests; the cards keep their layout until it is approved. Taking the tick off lets administrators change the layout without approval again.",
      covers: ["APR-02"],
    },
    async () => {
      await walk.click(section(page, "Report cards"));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      const needsApproval = page.getByRole("checkbox", { name: /An administrator's layout change needs my approval/ });
      await expect(needsApproval).not.toBeChecked();
      await walk.click(needsApproval);
      await expect(page.getByText("Administrators' layout changes now need your approval.")).toBeVisible();
      await expect(needsApproval).toBeChecked();
      await walk.click(needsApproval);
      await expect(page.getByText("Administrators can change the layout without approval.")).toBeVisible();
      await expect(needsApproval).not.toBeChecked();
    },
  );

  await walk.step(
    {
      id: 144,
      chapter,
      role: "Superadmin",
      title: "Allow an administrator to approve their own marks, and withdraw it",
      caption:
        "By default an administrator who enters marks needs someone other than themselves to approve them. Only a superadmin can make an exception, and the page says plainly that nobody checks those marks before parents see them. The permission is withdrawn with one button.",
      covers: ["APR-03"],
    },
    async () => {
      await walk.click(section(page, "Self-approval"));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await expect(page.getByText("The trade-off.")).toBeVisible();
      const person = requestOf(page, cast.branchAdmin.name);
      await expect(person).toContainText(/Needs someone \w+ to approve their marks/);
      await walk.click(page.getByRole("button", { name: `Allow ${cast.branchAdmin.name} to approve their own marks` }));
      await expect(page.getByText(`${cast.branchAdmin.name} may now approve their own marks.`)).toBeVisible();
      await expect(person).toContainText("May approve their own marks");
      await walk.click(page.getByRole("button", { name: `Withdraw ${cast.branchAdmin.name}'s permission` }));
      await expect(page.getByText(`${cast.branchAdmin.name} can no longer approve their own marks.`)).toBeVisible();
      await expect(person).toContainText(/Needs someone \w+ to approve their marks/);
    },
  );

  await walk.step(
    {
      id: 145,
      chapter,
      role: "Teacher",
      title: "A teacher is not offered Approvals, and a typed address says the page is for administrators",
      caption:
        "The sidebar of a teacher has no Approvals entry. A teacher who types the address anyway is told, in a sentence, that only administrators can open the page, and sees nothing of it.",
      covers: ["APR-05"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await expect(mainNav(page).getByRole("link", { name: "Approvals", exact: true })).toHaveCount(0);
      const verify = await walk.typedAddress(`${new URL(page.url()).origin}/approvals`);
      await expect(verify.getByRole("heading", { level: 1, name: "Approvals and rules" })).toBeVisible();
      await expect(verify.getByRole("alert").filter({ hasText: "Only administrators can open this page." })).toBeVisible();
      await expect(verify.getByRole("tablist", { name: "Approvals sections" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 146,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff is not offered Approvals either",
      caption: "The same sentence is shown to the non-teaching staff, who are offered even fewer pages.",
      covers: ["APR-05"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await expect(mainNav(page).getByRole("link", { name: "Approvals", exact: true })).toHaveCount(0);
      const verify = await walk.typedAddress(`${new URL(page.url()).origin}/approvals`);
      await expect(verify.getByRole("alert").filter({ hasText: "Only administrators can open this page." })).toBeVisible();
      await expect(verify.getByRole("tablist", { name: "Approvals sections" })).toHaveCount(0);
    },
  );

  // the last step ends in its typed-address tab, so that the screenshot shows the sentence; the first tab comes back here, before the next chapter starts
  await walk.closeTypedAddress();
}
