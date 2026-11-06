import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { seedProgram, day } from "../support/programs-seed";
import { expectAccessible, expectFits, openProgramTab, programTab } from "./program-helpers";
import { signInThroughUi } from "./helpers";

// Programs, slice P5 (task 0043, section 12): completing people and programs, and certificates, as a person sees and uses them, on a desktop and a phone, in both themes. What the API
// allows is tested in tests/api/program-completion.spec.ts; here is what the screens offer, say and do.

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.afterAll(async () => {
  await resetDatabase();
});

async function world(options: { ended?: boolean } = {}) {
  const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
  const seed = await seedProgram(sa.id, { both: true });
  const amina = await seed.join(seed.amina, seed.first.id, seed.group1.id);
  const binta = await seed.join(seed.binta, seed.first.id, seed.group1.id);
  const cara = await seed.join(seed.cara, seed.second.id, seed.group1.id);
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
  await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
  if (options.ended)
    await db.program.update({
      where: { id: seed.program.id },
      data: { kind: "FIXED_TERM", startsOn: new Date(`${day(-60)}T00:00:00Z`), endsOn: new Date(`${day(-1)}T00:00:00Z`) },
    });
  return { sa, seed, amina, binta, cara, teacher };
}

const inner = (page: Page, name: string) => page.getByRole("tablist", { name: "Completion views" }).getByRole("tab", { name, exact: true });
const person = (page: Page, name: string) => page.getByRole("list", { name: "People" }).getByRole("listitem").filter({ hasText: name });
const certRow = (page: Page, name: string) =>
  page.getByRole("list", { name: "Certificates" }).getByRole("listitem").filter({ hasText: name });

test.describe("a super admin", () => {
  test("completes a person's place, issues the certificate, opens it, and withdraws it; the public page follows", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Completion");
    await expect(page.getByText("There is no completion rule: anyone taking part can be completed.")).toBeVisible();
    await expect(page.getByText("A program that never ends is archived, not completed.")).toBeVisible();
    await page.getByRole("button", { name: "Complete Amina Musa" }).click();
    const dialog = page.getByRole("dialog", { name: "Complete Amina Musa" });
    await dialog.getByRole("button", { name: "Complete place" }).click();
    await expect(page.getByText("Amina Musa is completed.")).toBeVisible();
    await expect(person(page, "Amina Musa")).toContainText(
      `completed ${new Date(`${day(0)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`,
    );
    await expect(page.getByRole("button", { name: "Complete Amina Musa" })).toHaveCount(0);

    await inner(page, "Certificates").click();
    await expect(page.getByText("No certificate has been issued yet.")).toBeVisible();
    await page.getByRole("button", { name: "Issue certificates for everyone completed" }).click();
    await expect(page.getByText("1 certificate was issued.")).toBeVisible();
    await expect(certRow(page, "Amina Musa")).toContainText(/CERT-\d{4}-0001/);
    await expect(certRow(page, "Amina Musa")).toContainText("in force");

    const token = (await db.programCertificate.findFirstOrThrow()).verifyToken;
    await certRow(page, "Amina Musa").getByRole("link", { name: "Open the certificate of Amina Musa" }).click();
    await expect(page.getByRole("heading", { name: "Certificate of Completion" })).toBeVisible();
    await expect(page.getByText(/This is to certify that Amina Musa has completed Quran memorisation/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Scan to check certificate CERT-/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await page.getByRole("link", { name: "Back to the program" }).first().click();

    // the public page, for anyone with the code
    const visitor = await page.context().newPage();
    await visitor.goto(`/verify/${token}`);
    await expect(visitor.getByText("This certificate is genuine.")).toBeVisible();
    await expect(visitor.getByText("Amina M.")).toBeVisible();
    await expect(visitor.getByText("Amina Musa")).toHaveCount(0);
    await expect(visitor.getByText("Quran memorisation")).toBeVisible();

    await programTab(page, "Completion").click();
    await inner(page, "Certificates").click();
    await certRow(page, "Amina Musa").getByRole("button", { name: "Withdraw the certificate of Amina Musa" }).click();
    const withdraw = page.getByRole("dialog", { name: /^Withdraw CERT-/ });
    await expect(withdraw.getByRole("button", { name: "Withdraw certificate" })).toBeDisabled();
    await withdraw.getByLabel("Why is it withdrawn?").fill("Issued to the wrong person");
    await withdraw.getByRole("button", { name: "Withdraw certificate" }).click();
    await expect(page.getByText("The certificate was withdrawn.")).toBeVisible();
    await expect(certRow(page, "Amina Musa")).toContainText("withdrawn");
    await expect(certRow(page, "Amina Musa").getByRole("link")).toHaveCount(0);
    await visitor.reload();
    await expect(visitor.getByText("This certificate was withdrawn by the school")).toBeVisible();
    await expect(visitor.getByText("This certificate is genuine.")).toHaveCount(0);
    await expect(visitor.getByText("wrong person")).toHaveCount(0);
  });

  test("a person who does not meet the completion rule is completed only with a reason", async ({ page }) => {
    const w = await world();
    await db.program.update({ where: { id: w.seed.program.id }, data: { completionMinAverage: 70 } });
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Completion");
    await expect(page.getByText(/To be completed without an override a person needs an average of at least 70%/)).toBeVisible();
    await expect(person(page, "Binta Musa")).toContainText("Does not meet the rule: No result counts toward the average yet.");
    await page.getByRole("button", { name: "Complete Binta Musa" }).click();
    const dialog = page.getByRole("dialog", { name: "Complete Binta Musa" });
    await expect(dialog).toContainText("does not meet the completion rule");
    await expect(dialog.getByRole("button", { name: "Complete place" })).toBeDisabled();
    await dialog.getByLabel("Why complete them anyway?").fill("Finished the practical work instead");
    await dialog.getByRole("button", { name: "Complete place" }).click();
    await expect(page.getByText("Binta Musa is completed.")).toBeVisible();
    await expect(person(page, "Binta Musa")).toContainText("Completed anyway: Finished the practical work instead");
  });

  test("completes a whole fixed-term program after its end date: sees who is skipped first, then one step", async ({ page }) => {
    const w = await world({ ended: true });
    await db.programParticipant.create({
      data: {
        programId: w.seed.program.id,
        kind: "CHILD",
        firstName: "Zainab",
        lastName: "Abubakar",
        dateOfBirth: new Date("2020-03-04"),
        guardianName: "Hauwa",
        guardianPhone: "08031234567",
        branchId: w.seed.first.id,
        groupId: w.seed.group1.id,
        joinedOn: new Date(`${day(-30)}T00:00:00Z`),
        createdByUserId: w.sa.id,
        standing: "SUSPENDED",
        standingUntil: new Date(`${day(5)}T00:00:00Z`),
      },
    });
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Completion");
    await expect(page.getByText("The program has reached its end date.")).toBeVisible();
    await page.getByRole("button", { name: "Complete the program" }).click();
    const dialog = page.getByRole("dialog", { name: "Complete the program?" });
    await expect(dialog.getByText("3 will be completed, 1 skipped.")).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Skipped" })).toContainText("Zainab Abubakar: Suspended: lift the suspension first.");
    await dialog.getByRole("button", { name: "Complete the program" }).click();
    await expect(page.getByText("The program is completed: 3 places completed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete the program" })).toHaveCount(0);
    await expect(page.getByText("This program is already completed.")).toBeVisible();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    // the certificates are issued after the program is completed
    await inner(page, "Certificates").click();
    await page.getByRole("button", { name: "Issue certificates for everyone completed" }).click();
    await expect(page.getByText("3 certificates were issued.")).toBeVisible();
  });

  test("reopens a completed place with a reason", async ({ page }) => {
    const w = await world();
    await db.programParticipant.update({
      where: { id: w.amina.id },
      data: { status: "COMPLETED", endedOn: new Date(`${day(0)}T00:00:00Z`), endedReason: "Completed" },
    });
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Completion");
    await page.getByRole("button", { name: "Reopen the place of Amina Musa" }).click();
    const dialog = page.getByRole("dialog", { name: "Reopen Amina Musa's place" });
    await expect(dialog.getByRole("button", { name: "Reopen place" })).toBeDisabled();
    await dialog.getByLabel("Why reopen it?").fill("She had not finished the last unit");
    await dialog.getByRole("button", { name: "Reopen place" }).click();
    await expect(page.getByText("Amina Musa's place is open again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Amina Musa" })).toBeVisible();
  });

  test("sets the certificate wording and signatories in Settings: an unknown placeholder is said and cannot be saved", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Settings");
    await page.getByLabel("Certificate title").fill("Certificate of Memorisation");
    await page.getByLabel("Certificate wording").fill("Well done {nme}.");
    await expect(page.getByText(/\{nme\} is not a placeholder/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
    await page.getByLabel("Certificate wording").fill("{name} memorised a portion in {program} at {school}.");
    await page.getByRole("button", { name: "Add a signatory" }).click();
    await page.getByLabel("Signatory 1 name").fill("Sheikh Musa");
    await page.getByLabel("Signatory 1 title").fill("Head of program");
    await page.getByLabel("Average of at least (%)").fill("55.5");
    await page.getByLabel("Every required assessment must be passed").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The settings were saved.")).toBeVisible();
    const program = await db.program.findFirstOrThrow();
    expect(program).toMatchObject({
      certTitle: "Certificate of Memorisation",
      certBody: "{name} memorised a portion in {program} at {school}.",
      completionRequirePassed: true,
    });
    expect(Number(program.completionMinAverage)).toBe(55.5);
    expect(program.certSignatories).toEqual([{ name: "Sheikh Musa", title: "Head of program" }]);
  });
});

test.describe("who is shown what", () => {
  test("a branch administrator sees the certificates of their own branch and nothing to complete; a teacher has no tab", async ({
    page,
    browser,
  }) => {
    const w = await world();
    for (const [place, name] of [
      [w.amina, "amina"],
      [w.cara, "cara"],
    ] as const) {
      await db.programParticipant.update({
        where: { id: place.id },
        data: { status: "COMPLETED", endedOn: new Date(`${day(0)}T00:00:00Z`), endedReason: name },
      });
    }
    await db.programCertificate.createMany({
      data: [
        { participantId: w.amina.id, personName: "Amina Pupil", serialNo: "CERT-2026-0001", verifyToken: "a".repeat(43) },
        { participantId: w.cara.id, personName: "Cara Pupil", serialNo: "CERT-2026-0002", verifyToken: "b".repeat(43) },
      ].map((c) => ({
        ...c,
        programId: w.seed.program.id,
        issuedOn: new Date(`${day(0)}T00:00:00Z`),
        completedOn: new Date(`${day(0)}T00:00:00Z`),
        title: "Certificate of Completion",
        bodyText: "Well done.",
        programName: "Quran memorisation",
        schoolName: "School",
        issuedByUserId: w.sa.id,
      })),
    });
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await openProgramTab(page, w.seed.program.id, "Certificates");
    await expect(inner(page, "Completion")).toHaveCount(0);
    await expect(certRow(page, "Amina Pupil")).toBeVisible();
    await expect(certRow(page, "Cara Pupil")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Issue certificates for everyone completed" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Withdraw/ })).toHaveCount(0);

    const other = await browser.newPage();
    await signInThroughUi(other, w.teacher);
    await other.goto(`/programs/${w.seed.program.id}`);
    await expect(programTab(other, "Overview")).toBeVisible();
    await expect(programTab(other, "Completion")).toHaveCount(0);
    await expect(programTab(other, "Certificates")).toHaveCount(0);
    await other.close();
  });

  test("a certificate that does not exist, or a program the person has no place in, is simply not found", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" }));
    await page.goto(`/programs/${w.seed.program.id}/certificates/anything`);
    await expect(page.getByText("We could not find that certificate.")).toBeVisible();
    await page.goto(`/verify/${"a".repeat(43)}`);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });
});

test.describe("the certificate on paper and in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme: the completion tab, a dialog, the certificate and the public page are accessible and fit; the certificate prints on one page`, async ({
      page,
      context,
    }) => {
      const w = await world();
      await db.programParticipant.update({
        where: { id: w.amina.id },
        data: { status: "COMPLETED", endedOn: new Date(`${day(0)}T00:00:00Z`), endedReason: "Completed" },
      });
      await db.program.update({
        where: { id: w.seed.program.id },
        data: {
          certSignatories: [
            { name: "Sheikh Musa", title: "Head of program" },
            { name: "Mrs Bello", title: "Principal" },
          ],
        },
      });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, w.sa);
      await openProgramTab(page, w.seed.program.id, "Completion");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectAccessible(page, `${theme} completion`);
      await expectFits(page, `${theme} completion`);
      await page.getByRole("button", { name: "Complete Binta Musa" }).click();
      await expect(page.getByRole("dialog", { name: "Complete Binta Musa" })).toBeVisible();
      await expectAccessible(page, `${theme} complete a place`);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await inner(page, "Certificates").click();
      await page.getByRole("button", { name: "Issue certificates for everyone completed" }).click();
      await expect(page.getByText("1 certificate was issued.")).toBeVisible();
      await expectAccessible(page, `${theme} certificates`);
      await expectFits(page, `${theme} certificates`);
      const cert = await db.programCertificate.findFirstOrThrow();
      await page.goto(`/programs/${w.seed.program.id}/certificates/${cert.id}`);
      await expect(page.getByRole("img", { name: /Scan to check certificate/ })).toBeVisible();
      await expectAccessible(page, `${theme} certificate`);
      await expectFits(page, `${theme} certificate`);
      // on paper: one page, with the controls gone
      await page.emulateMedia({ media: "print" });
      await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
      await expect(page.getByRole("list", { name: "Signatories" }).getByRole("listitem")).toHaveCount(2);
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length, "pages of the printed certificate").toBe(1);
      await page.emulateMedia({ media: "screen" });
      await page.goto(`/verify/${cert.verifyToken}`);
      await expect(page.getByText("This certificate is genuine.")).toBeVisible();
      await expectAccessible(page, `${theme} public page`);
      await expectFits(page, `${theme} public page`);
    });
  }
});
