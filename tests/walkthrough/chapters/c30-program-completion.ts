import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programCompletion as c, programs as p, pupils, school } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C30 Program completion (task 0033, section 6.30): finishing a place and the certificate. The superadministrator sets the certificate's wording and signatory and the rule in Settings (a mistyped placeholder is said
// and cannot be saved); completes a person who does not meet the rule only with a reason, and one who does without; issues the certificates, opens one as a print-ready page with a QR code, and a visitor checks it on the
// public page, which shows only the first name and the initial of the last; withdraws a certificate with a reason (it stays on record and the public page says it was withdrawn); and reopens a completed place with a
// reason. A branch administrator sees the certificates of their own branch and nothing to complete; a teacher has no such tab. (Completing a whole fixed-term program waits for its end date, which has not come.)

const chapter = "C30 Program completion";

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const inner = (page: Page, name: string): Locator =>
  page.getByRole("tablist", { name: "Completion views" }).getByRole("tab", { name, exact: true });
const person = (page: Page, name: string): Locator =>
  page.getByRole("list", { name: "People" }).getByRole("listitem").filter({ hasText: name });
const certRow = (page: Page, name: string): Locator =>
  page.getByRole("list", { name: "Certificates" }).getByRole("listitem").filter({ hasText: name });
const full = (pupil: { first: string; last: string }) => `${pupil.first} ${pupil.last}`;
const aisha = full(pupils.aisha);
const yusuf = full(pupils.yusuf);

async function openProgram(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Programs");
  await walk.click(page.getByRole("link", { name: p.hifz.name }));
}

export async function c30ProgramCompletion(walk: Walk, page: Page): Promise<void> {
  let verifyPath = "";

  await walk.step(
    {
      id: 298,
      chapter,
      role: "Superadmin",
      title: "The certificate's wording, its signatory and the completion rule are set; a mistyped placeholder is said and cannot be saved",
      caption:
        "The program's Settings hold what a certificate says and who signs it, and the rule for completing: an average of at least a number. The wording has placeholders in braces; one that does not exist is named and the save stays disabled.",
      covers: ["PCM-08"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openProgram(walk, page);
      await walk.click(tab(page, "Settings"));
      await walk.type(page.getByLabel("Certificate title"), c.title);
      await walk.type(page.getByLabel("Certificate wording"), c.badWording);
      await expect(page.getByText(/\{nme\} is not a placeholder/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
      await walk.type(page.getByLabel("Certificate wording"), c.wording);
      await walk.click(page.getByRole("button", { name: "Add a signatory" }));
      await walk.type(page.getByLabel("Signatory 1 name"), c.signatory.name);
      await walk.type(page.getByLabel("Signatory 1 title"), c.signatory.title);
      await walk.type(page.getByLabel("Average of at least (%)"), c.minAverage);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 299,
      chapter,
      role: "Superadmin",
      title: "A person who does not meet the completion rule is completed only with a reason, which is kept",
      caption:
        "The Completion tab says what the rule is and who does not meet it. Completing such a person is possible, but the dialog says so, and the button stays disabled until a reason is given; the reason is kept on the person.",
      covers: ["PCM-02"],
    },
    async () => {
      await walk.click(tab(page, "Completion"));
      await expect(
        page.getByText(new RegExp(`To be completed without an override a person needs an average of at least ${c.minAverage}%`)),
      ).toBeVisible();
      await expect(person(page, aisha)).toContainText("Does not meet the rule");
      await walk.click(page.getByRole("button", { name: `Complete ${aisha}` }));
      const ask = dialog(page, `Complete ${aisha}`);
      await expect(ask).toContainText("does not meet the completion rule");
      await expect(ask.getByRole("button", { name: "Complete place" })).toBeDisabled();
      await walk.type(ask.getByLabel("Why complete them anyway?"), c.override);
      await walk.click(ask.getByRole("button", { name: "Complete place" }));
      await expect(page.getByText(`${aisha} is completed.`)).toBeVisible();
      await expect(person(page, aisha)).toContainText(`Completed anyway: ${c.override}`);
    },
  );

  await walk.step(
    {
      id: 300,
      chapter,
      role: "Superadmin",
      title: "A person's place is completed at any time, and says when",
      caption:
        "A person who meets the rule is completed with one confirmation and no reason. Their line then says when they completed, and the Complete button goes.",
      covers: ["PCM-01"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Complete ${yusuf}` }));
      await walk.click(dialog(page, `Complete ${yusuf}`).getByRole("button", { name: "Complete place" }));
      await expect(page.getByText(`${yusuf} is completed.`)).toBeVisible();
      await expect(person(page, yusuf)).toContainText(/completed \d+ \w+ \d{4}/);
      await expect(page.getByRole("button", { name: `Complete ${yusuf}` })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 301,
      chapter,
      role: "Superadmin",
      title: "Certificates are issued, and one opens as a print-ready page with a QR code",
      caption:
        "One button issues a certificate for everyone completed, each with a number. A certificate opens as a page ready to print: the title and wording set in Settings, the signatory, a QR code to check it, and the public address to check it at.",
      covers: ["PCM-04"],
    },
    async () => {
      await walk.click(inner(page, "Certificates"));
      await expect(page.getByText("No certificate has been issued yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Issue certificates for everyone completed" }));
      await expect(page.getByText(/\d+ certificates? (was|were) issued\./)).toBeVisible();
      await expect(certRow(page, yusuf)).toContainText(/CERT-\d{4}-\d{4}/);
      await expect(certRow(page, yusuf)).toContainText("in force");
      await walk.click(certRow(page, yusuf).getByRole("link", { name: `Open the certificate of ${yusuf}` }));
      await expect(page.getByRole("heading", { name: c.title })).toBeVisible();
      await expect(page.getByText(new RegExp(`${yusuf} memorised a portion in ${p.hifz.name} at ${school.profile.name}`))).toBeVisible();
      await expect(page.getByText(c.signatory.name)).toBeVisible();
      await expect(page.getByRole("img", { name: /Scan to check certificate CERT-/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
      const line = await page
        .getByText(/Check it at /)
        .first()
        .innerText();
      verifyPath = `/verify/${line.split("/verify/")[1].trim()}`;
    },
  );

  await walk.step(
    {
      id: 302,
      chapter,
      role: "Visitor",
      title: "Anyone with the code can check a certificate, and sees only the first name and the initial of the last",
      caption:
        "The public page needs no sign-in. It says that the certificate is genuine, names the program and shows the person as a first name and an initial, never the whole name.",
      covers: ["PCM-05"],
    },
    async () => {
      const visitor = await walk.typedAddress(`${new URL(page.url()).origin}${verifyPath}`);
      await expect(visitor.getByText("This certificate is genuine.")).toBeVisible();
      await expect(visitor.getByText(`${pupils.yusuf.first} ${pupils.yusuf.last[0]}.`)).toBeVisible();
      await expect(visitor.getByText(yusuf)).toHaveCount(0);
      await expect(visitor.getByText(p.hifz.name)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 303,
      chapter,
      role: "Superadmin",
      title: "A certificate is withdrawn with a reason; it stays on record, and the public page says it was withdrawn",
      caption:
        "Withdrawing asks why and stays disabled until it is said. The certificate stays in the list as withdrawn, with no link. The public page now says the school withdrew it, and never says why.",
      covers: ["PCM-06"],
    },
    async () => {
      await walk.closeTypedAddress();
      await walk.click(page.getByRole("link", { name: "Back to the program" }).first());
      await walk.click(tab(page, "Completion"));
      await walk.click(inner(page, "Certificates"));
      await walk.click(certRow(page, yusuf).getByRole("button", { name: `Withdraw the certificate of ${yusuf}` }));
      const ask = dialog(page, /^Withdraw CERT-/);
      await expect(ask.getByRole("button", { name: "Withdraw certificate" })).toBeDisabled();
      await walk.type(ask.getByLabel("Why is it withdrawn?"), c.withdraw);
      await walk.click(ask.getByRole("button", { name: "Withdraw certificate" }));
      await expect(page.getByText("The certificate was withdrawn.")).toBeVisible();
      await expect(certRow(page, yusuf)).toContainText("withdrawn");
      await expect(certRow(page, yusuf).getByRole("link")).toHaveCount(0);
      const visitor = await walk.typedAddress(`${new URL(page.url()).origin}${verifyPath}`);
      await expect(visitor.getByText("This certificate was withdrawn by the school")).toBeVisible();
      await expect(visitor.getByText("This certificate is genuine.")).toHaveCount(0);
      await expect(visitor.getByText(c.withdraw)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 304,
      chapter,
      role: "Superadmin",
      title: "A completed place is reopened with a reason",
      caption:
        "A place that was completed by mistake can be reopened, once any certificate for it has been withdrawn (while one is in force, the place stays completed; Aisha's still is). Reopening asks why, and stays disabled until it is said; the person then shows as taking part again, with Complete offered once more.",
      covers: ["PCM-07"],
    },
    async () => {
      await walk.closeTypedAddress();
      await walk.click(inner(page, "Completion"));
      await walk.click(page.getByRole("button", { name: `Reopen the place of ${yusuf}` }));
      const ask = dialog(page, `Reopen ${yusuf}'s place`);
      await expect(ask.getByRole("button", { name: "Reopen place" })).toBeDisabled();
      await walk.type(ask.getByLabel("Why reopen it?"), c.reopen);
      await walk.click(ask.getByRole("button", { name: "Reopen place" }));
      await expect(page.getByText(`${yusuf}'s place is open again.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Complete ${yusuf}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 305,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator sees the certificates of their own branch and nothing to complete; a teacher has no tab",
      caption:
        "The branch administrator has a Certificates tab with the certificates of their own branch, and no way to issue or withdraw one. A teacher has neither tab: certificates are not their business.",
      covers: ["PCM-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openProgram(walk, page);
      await walk.click(tab(page, "Certificates"));
      await expect(inner(page, "Completion")).toHaveCount(0);
      await expect(certRow(page, yusuf)).toBeVisible();
      await expect(page.getByRole("button", { name: "Issue certificates for everyone completed" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Withdraw/ })).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openProgram(walk, page);
      await expect(tab(page, "Overview")).toBeVisible();
      await expect(tab(page, "Completion")).toHaveCount(0);
      await expect(tab(page, "Certificates")).toHaveCount(0);
    },
  );
}
