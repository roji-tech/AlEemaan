import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance, uniqueEmail } from "../support/db";
import { mailAfterGrace, waitForMail } from "../support/outbox";
import { hashInvitationToken, newInvitationToken } from "@/lib/invitations/token";
import { signInThroughUi, rowAction, hasRowAction, openInvitationsTab } from "./helpers";

// Attaching one person to more than one branch (task 0092), in a real browser, desktop and phone: the "Add to another branch" action of a row (the invite dialog opened for that person, with
// the address fixed and only the branches they are not in), several branches ticked at once, and "Invite someone" with several branches. Every test starts from an empty school.

let branches: { id: string; name: string }[];

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
});

const row = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });
const dialog = (page: Page) => page.getByRole("dialog");
const notice = (page: Page) => page.getByRole("status").filter({ hasText: /\S/ });
const box = (page: Page, branch: number) => dialog(page).getByRole("checkbox", { name: BRANCH_NAMES[branch], exact: true });
const tokensIn = (text: string) => [...text.matchAll(/#token=([A-Za-z0-9_-]{43})/g)].map((m) => m[1]);

async function openUsers(page: Page, user: { email: string; password: string }) {
  await signInThroughUi(page, user);
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
  await expect(page.getByText(/^\d+ (person|people)/)).toBeVisible(); // the list has loaded
}
/// A superadmin (an ADMIN with the school-wide flag, as the migration made every administrator).
async function signedInSuperadmin(page: Page) {
  const admin = await createUser({ name: "Amina Yusuf", role: Role.ADMIN });
  await openUsers(page, admin);
  return admin;
}
/// An administrator of the first `count` branches only.
async function signedInBranchAdmin(page: Page, count: number) {
  const admin = await createUser({ name: "Bola Branchadmin", role: Role.ADMIN, superAdmin: false });
  for (let i = 1; i < count; i++) await db.membership.create({ data: { userId: admin.id, branchId: branches[i].id, role: Role.ADMIN } });
  await openUsers(page, admin);
  return admin;
}
async function member(role: Role, name: string, branch = 0) {
  const user = await createUser({ name });
  const m = await db.membership.create({ data: { userId: user.id, branchId: branches[branch].id, role } });
  return { ...user, membershipId: m.id };
}

// WCAG 2.2 A/AA on the open dialog, in both themes, and no sideways scrolling: the states this task adds (the several-branches checkboxes, the person's dialog, its messages).
async function accessible(page: Page, what: string) {
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a instanceof CSSTransition)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    );
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.help}`),
      `${what} [${theme}]`,
    ).toEqual([]);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `${what}: horizontal overflow [${theme}]`).toBeLessThanOrEqual(innerWidth);
  }
}

test.describe("Add to another branch (a row action)", () => {
  test("opens the invite dialog for that person: their address is fixed, the branch they hold is not offered, the others are", async ({
    page,
  }) => {
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    await signedInSuperadmin(page);
    await rowAction(page, "Add Tola Teacher to another branch");

    const d = dialog(page);
    await expect(d.getByRole("heading", { name: "Add Tola Teacher to another branch" })).toBeVisible();
    await expect(d.getByLabel("Email address")).toHaveValue(tola.email);
    await expect(d.getByLabel("Email address")).toHaveAttribute("readonly", ""); // the person's address, not a field to retype
    await expect(d.getByLabel("Role")).toHaveValue("TEACHING_STAFF"); // what they are already, offered as the default
    await expect(d.getByLabel("Role")).toBeFocused(); // the first thing to decide: the address is fixed
    await expect(d.getByRole("checkbox")).toHaveCount(3);
    for (const at of [1, 2, 3]) await expect(box(page, at)).not.toBeChecked();
    await expect(box(page, 0)).toHaveCount(0); // they are already in it
    await expect(d.getByText(`Not offered: ${BRANCH_NAMES[0]} (already a member).`)).toBeVisible();
    await accessible(page, "the Add to another branch dialog");

    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    expect(await db.invitation.count()).toBe(0);
  });

  test("Select all ticks every branch offered and Clear selection takes them off; ticking nothing is explained; two ticked and sent are listed as pending and ONE e-mail is sent", async ({
    page,
  }) => {
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    await signedInSuperadmin(page);
    await rowAction(page, "Add Tola Teacher to another branch");
    const d = dialog(page);
    await expect(d.getByRole("checkbox")).toHaveCount(3);

    await d.getByRole("button", { name: "Select all" }).click();
    for (const at of [1, 2, 3]) await expect(box(page, at)).toBeChecked();
    await d.getByRole("button", { name: "Clear selection" }).click();
    for (const at of [1, 2, 3]) await expect(box(page, at)).not.toBeChecked();

    await d.getByRole("button", { name: "Send invitations" }).click();
    await expect(d.getByText("Choose at least one branch.")).toBeVisible();
    await accessible(page, "the Add to another branch dialog with its error");
    expect(await db.invitation.count()).toBe(0);

    await d.getByLabel("Role").selectOption("NON_TEACHING_STAFF"); // the same role in each branch
    await box(page, 1).check();
    await box(page, 3).check();
    await expect(d.getByText("Choose at least one branch.")).toHaveCount(0); // ticking a branch takes the message away
    await d.getByRole("button", { name: "Send invitations" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(notice(page)).toContainText(`2 invitations created for ${tola.email}: ${BRANCH_NAMES[1]}, ${BRANCH_NAMES[3]}`);

    await openInvitationsTab(page); // pending invitations are their own tab
    await expect(page.getByRole("tab", { name: "Pending invitations (2)" })).toBeVisible();
    const pending = row(page, tola.email);
    await expect(pending).toHaveCount(2);
    await expect(pending.filter({ hasText: BRANCH_NAMES[1] })).toContainText("Non-teaching staff");
    await expect(pending.filter({ hasText: BRANCH_NAMES[3] })).toContainText("Non-teaching staff");
    await expect(pending.filter({ hasText: BRANCH_NAMES[2] })).toHaveCount(0);

    const [mail] = await waitForMail(tola.email);
    expect(await mailAfterGrace(tola.email, 600)).toHaveLength(1); // one message for both branches
    expect(mail.text).toContain(`For ${BRANCH_NAMES[1]}:`);
    expect(mail.text).toContain(`For ${BRANCH_NAMES[3]}:`);
    expect(tokensIn(mail.text)).toHaveLength(2);
    expect(
      await db.invitation.count({ where: { email: tola.email, role: Role.NON_TEACHING_STAFF, acceptedAt: null, revokedAt: null } }),
    ).toBe(2);
    expect(await db.membership.count({ where: { userId: tola.id } })).toBe(1); // nothing is attached until they accept
  });

  test("a branch that already has a link waiting is not offered, and says why", async ({ page }) => {
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    await db.invitation.create({
      data: {
        email: tola.email,
        role: Role.PARENT,
        branchId: branches[2].id,
        tokenHash: hashInvitationToken(newInvitationToken()),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await signedInSuperadmin(page);
    await expect(page.getByRole("tab", { name: "Pending invitations (1)" })).toBeVisible(); // the page holds the waiting link before the dialog asks it
    await rowAction(page, "Add Tola Teacher to another branch");
    const d = dialog(page);
    await expect(d.getByRole("checkbox")).toHaveCount(2);
    await expect(box(page, 1)).toBeVisible();
    await expect(box(page, 3)).toBeVisible();
    await expect(box(page, 2)).toHaveCount(0);
    await expect(d.getByText(`${BRANCH_NAMES[2]} (an invitation is already waiting)`)).toBeVisible();
  });

  test("a person already in every branch there is to offer: the dialog says so in a sentence and nothing can be sent", async ({ page }) => {
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    for (const at of [1, 2, 3])
      await db.membership.create({ data: { userId: tola.id, branchId: branches[at].id, role: Role.TEACHING_STAFF } });
    await signedInSuperadmin(page);
    await expect(page.getByText("5 people")).toBeVisible(); // one row per membership
    // (four rows carry her name, so the action is opened from the row of one branch)
    await row(page, "Tola Teacher").filter({ hasText: BRANCH_NAMES[0] }).getByRole("button", { name: "Actions for Tola Teacher" }).click();
    await page.getByRole("button", { name: "Add Tola Teacher to another branch", exact: true }).click();

    const d = dialog(page);
    await expect(d.getByText("There is no other branch you can add Tola Teacher to", { exact: false })).toBeVisible();
    await expect(d.getByRole("checkbox")).toHaveCount(0);
    await expect(d.getByRole("button", { name: "Send invitations" })).toBeDisabled();
    await accessible(page, "the Add to another branch dialog with nothing to offer");
    expect(await db.invitation.count()).toBe(0);
  });

  test("a branch administrator of ONE branch is not offered the action, and has no several-branches switch (there is nothing to choose among)", async ({
    page,
  }) => {
    await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    await signedInBranchAdmin(page, 1);
    expect(await hasRowAction(page, "Deactivate Tola Teacher")).toBe(true); // the list is there …
    expect(await hasRowAction(page, "Add Tola Teacher to another branch")).toBe(false); // … and holds nothing to add them to
    await page.getByRole("button", { name: "Invite someone" }).click();
    await expect(dialog(page).getByRole("heading", { name: "Invite someone" })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Invite to several branches" })).toHaveCount(0);
    await expect(dialog(page).getByLabel("Branch").locator("option")).toHaveCount(2); // "Choose a branch" + their own
  });

  test("an administrator of TWO branches is offered only those two, never names the others, and one branch sent is the ordinary invitation", async ({
    page,
  }) => {
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    await signedInBranchAdmin(page, 2);
    await rowAction(page, "Add Tola Teacher to another branch");
    const d = dialog(page);
    await expect(d.getByRole("checkbox")).toHaveCount(1);
    await expect(box(page, 1)).toBeVisible();
    for (const hidden of [BRANCH_NAMES[2], BRANCH_NAMES[3]]) await expect(d.getByText(hidden)).toHaveCount(0); // not even named
    await box(page, 1).check();
    await d.getByRole("button", { name: "Send invitations" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(notice(page)).toContainText(`Invitation sent to ${tola.email}. The link works for 7 days.`); // one branch: the original sentence
    const [mail] = await waitForMail(tola.email);
    expect(mail.text).toContain(`invited you to join AlEemaan (${BRANCH_NAMES[1]}) as Teaching staff`);
    expect(await mailAfterGrace(tola.email, 400)).toHaveLength(1);
  });
});

test.describe("Invite someone, to several branches", () => {
  test("a button switches the Branch list to checkboxes; Select all, the same role in each, one e-mail; switching back keeps the branch picked", async ({
    page,
  }) => {
    await signedInSuperadmin(page);
    await page.getByRole("button", { name: "Invite someone" }).click();
    const d = dialog(page);
    await expect(d.getByLabel("Branch")).toBeVisible(); // the usual single choice first, as before
    await d.getByLabel("Branch").selectOption({ label: BRANCH_NAMES[2] });

    await d.getByRole("button", { name: "Invite to several branches" }).click();
    await expect(d.getByRole("group", { name: "Branches" })).toBeVisible();
    await expect(d.getByRole("checkbox")).toHaveCount(4);
    await expect(box(page, 2)).toBeChecked(); // the pick carried over
    await expect(box(page, 0)).not.toBeChecked();
    await accessible(page, "the Invite dialog with several branches");

    await d.getByRole("button", { name: "Invite to one branch only" }).click();
    await expect(d.getByLabel("Branch")).toHaveValue(branches[2].id); // and back again, nothing lost
    await d.getByRole("button", { name: "Invite to several branches" }).click();

    const to = uniqueEmail("several");
    await d.getByLabel("Email address").fill(to);
    await d.getByLabel("Role").selectOption("PARENT");
    await d.getByRole("button", { name: "Select all" }).click();
    for (const at of [0, 1, 2, 3]) await expect(box(page, at)).toBeChecked();
    await d.getByRole("button", { name: "Clear selection" }).click();
    await box(page, 0).check();
    await box(page, 1).check();
    await d.getByRole("button", { name: "Send invitations" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(notice(page)).toContainText(`2 invitations created for ${to}`);

    await openInvitationsTab(page);
    await expect(page.getByRole("tab", { name: "Pending invitations (2)" })).toBeVisible();
    await expect(row(page, to)).toHaveCount(2);
    await expect(row(page, to).filter({ hasText: BRANCH_NAMES[0] })).toContainText("Parent");
    await expect(row(page, to).filter({ hasText: BRANCH_NAMES[1] })).toContainText("Parent");
    const [mail] = await waitForMail(to);
    expect(await mailAfterGrace(to, 600)).toHaveLength(1);
    expect(mail.text).toContain("as Parent in 2 branches");
    expect(tokensIn(mail.text)).toHaveLength(2);
  });

  test("a branch that cannot take the person is named where you are looking, the dialog stays open, nothing is sent; leaving it out makes it work", async ({
    page,
  }) => {
    const tola = await member(Role.TEACHING_STAFF, "Tola Teacher", 0);
    await signedInSuperadmin(page);
    await page.getByRole("button", { name: "Invite someone" }).click();
    const d = dialog(page);
    await d.getByRole("button", { name: "Invite to several branches" }).click();
    await d.getByLabel("Email address").fill(tola.email);
    await box(page, 0).check(); // the branch Tola is already in …
    await box(page, 1).check(); // … with one that would have worked
    await d.getByRole("button", { name: "Send invitations" }).click();
    await expect(d.getByText(`That person is already a member of ${BRANCH_NAMES[0]}. Nothing was sent.`)).toBeVisible();
    await expect(dialog(page)).toBeVisible();
    expect(await db.invitation.count()).toBe(0); // all or none: not even the branch that would have worked
    expect(await mailAfterGrace(tola.email, 400)).toEqual([]);
    await accessible(page, "the Invite dialog with a refused branch");

    await box(page, 0).uncheck();
    await d.getByRole("button", { name: "Send invitations" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(notice(page)).toContainText(`Invitation sent to ${tola.email}. The link works for 7 days.`); // one branch ticked: the original sentence
    expect(await db.invitation.count({ where: { email: tola.email, branchId: branches[1].id } })).toBe(1);
  });
});
