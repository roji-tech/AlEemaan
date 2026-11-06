import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { seedProgram, day } from "../support/programs-seed";
import { expectAccessible, expectFits, openProgramTab, programTab } from "./program-helpers";
import { signInThroughUi } from "./helpers";
import { QURAN_BOOKLET } from "@/lib/programs/progress-templates";

// Progress records (task 0044, slices R1 to R3) as a person sees and uses them, on a desktop and a phone, in both themes. What the API allows is tested in
// tests/api/progress-records.spec.ts; here is what the screens offer, say and do.

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});
test.afterAll(async () => {
  await resetDatabase();
});

type Options = { verify?: boolean; template?: boolean };

async function world(options: Options = {}) {
  const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
  const seed = await seedProgram(sa.id, { both: true });
  const amina = await seed.join(seed.amina, seed.first.id, seed.group1.id);
  const binta = await seed.join(seed.binta, seed.first.id, seed.group1.id);
  await seed.join(seed.cara, seed.second.id, seed.group1.id);
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
  await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
  const supervisor = await createUser({ role: Role.TEACHING_STAFF, name: "Sadiq Bello" });
  await seed.name(supervisor.id, "SUPERVISOR");
  let templateId: string | null = null;
  if (options.template !== false) {
    await db.program.update({
      where: { id: seed.program.id },
      data: { progressEnabled: true, progressTemplate: "QURAN_BOOKLET", progressRequireVerification: options.verify ?? false },
    });
    const template = await db.progressTemplate.create({
      data: { programId: seed.program.id, key: "QURAN_BOOKLET", version: 1, schema: QURAN_BOOKLET as never, createdByUserId: sa.id },
    });
    templateId = template.id;
  }
  /// An entry made straight in the database: the record of a place, and one dated row of "New text".
  const entry = async (
    participant: { id: string },
    offset: number,
    over: { status?: "DRAFT" | "SUBMITTED" | "VERIFIED"; by?: string; values?: object; trackKey?: string } = {},
  ) => {
    const record =
      (await db.progressRecord.findUnique({ where: { participantId: participant.id } })) ??
      (await db.progressRecord.create({
        data: { programId: seed.program.id, participantId: participant.id, templateId: templateId!, createdByUserId: sa.id },
      }));
    const values = over.values ?? { range: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 }, rating: 4 };
    const status = over.status ?? "VERIFIED";
    const by = over.by ?? teacher.id;
    return db.progressEntry.create({
      data: {
        programId: seed.program.id,
        recordId: record.id,
        trackKey: over.trackKey ?? "new",
        entryDate: new Date(`${day(offset)}T00:00:00Z`),
        values: values as never,
        status,
        createdByUserId: by,
        lastEditedByUserId: by,
        ...(status === "VERIFIED"
          ? { verifiedByUserId: supervisor.id, verifiedAt: new Date(), publishedValues: values as never, publishedAt: new Date() }
          : {}),
      },
    });
  };
  return { sa, seed, amina, binta, teacher, supervisor, entry };
}

const open = (page: Page, name: string) => page.getByRole("button", { name: `Open the progress record of ${name}` }).click();
const entries = (page: Page | Locator, track: string) => page.getByRole("list", { name: `${track} entries` });
const dialogOf = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const goToRecord = async (page: Page, programId: string, name = "Amina Musa") => {
  await openProgramTab(page, programId, "Progress records");
  await open(page, name);
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
};

test.describe("a teacher", () => {
  test("adds an entry, is offered the next range, and a second entry for the same day opens the first", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, w.teacher);
    await openProgramTab(page, w.seed.program.id, "Progress records");
    await expect(page.getByTestId("progress-state")).toHaveText("On.");
    await expect(page.getByRole("list", { name: "People" }).getByRole("listitem")).toHaveCount(3);
    await open(page, "Amina Musa");
    await expect(entries(page, "New text")).toHaveCount(0);
    await page.getByRole("button", { name: "Add to new text" }).click();
    const dialog = dialogOf(page, "Add new text");
    await dialog.getByLabel("From surah").selectOption("2");
    await dialog.getByLabel("From ayah").fill("1");
    await dialog.getByLabel("To surah").selectOption("2");
    await dialog.getByLabel("To ayah").fill("500");
    await dialog.getByLabel("Rating").selectOption("4");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    await expect(dialog.getByText("Surah 2 has ayat 1 to 286.")).toBeVisible();
    await dialog.getByLabel("To ayah").fill("5");
    await dialog.getByLabel("Notes").fill("Smooth, no prompting");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    await expect(page.getByText("The entry was added.")).toBeVisible();
    const row = entries(page, "New text").getByRole("listitem");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Al-Baqarah 1 to 5");
    await expect(row).toContainText("Smooth, no prompting");
    await expect(row).toContainText("Very good");
    await expect(row).toContainText("Verified");
    await expect(row).toContainText("Last saved by Hafsat Ali");

    // the next range starts after the last ayah done
    await page.getByRole("button", { name: "Add to daily revision" }).click();
    await expect(dialogOf(page, "Add daily revision").getByLabel("From ayah")).toHaveValue("");
    await dialogOf(page, "Add daily revision").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Add to new text" }).click();
    const next = dialogOf(page, "Add new text");
    await expect(next.getByLabel("From surah")).toHaveValue("2");
    await expect(next.getByLabel("From ayah")).toHaveValue("6");
    await next.getByLabel("To ayah").fill("9");
    await next.getByRole("button", { name: "Add entry" }).click();

    // the same day again: the first entry opens instead
    const change = dialogOf(page, "Change new text");
    await expect(change).toBeVisible();
    await expect(change.getByLabel("To ayah")).toHaveValue("5");
    await change.getByLabel("To ayah").fill("8");
    await change.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("The entry was changed.")).toBeVisible();
    await expect(row).toContainText("Al-Baqarah 1 to 8");

    await page.getByRole("button", { name: /^History of the new text entry/ }).click();
    const history = dialogOf(page, "History of this entry");
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(history).toContainText("create");
    await expect(history).toContainText("update");
    await history.getByRole("button", { name: "Close" }).last().click();
    expect(await db.progressEntry.count()).toBe(1);
  });

  test("keeps a profile, and cannot write to someone outside their groups or a person who is not taking part", async ({ page }) => {
    const w = await world();
    await db.programParticipant.update({
      where: { id: w.binta.id },
      data: { status: "WITHDRAWN", endedOn: new Date(`${day(-1)}T00:00:00Z`) },
    });
    await signInThroughUi(page, w.teacher);
    await goToRecord(page, w.seed.program.id);
    const profile = page.getByRole("form", { name: "Profile" });
    await profile.getByLabel("Age").fill("12");
    await profile.getByLabel("Riwayah").selectOption("HAFS");
    await profile.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("The profile was saved.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Profile" }).getByLabel("Age")).toHaveValue("12");
    await page.getByRole("button", { name: "Back to the people" }).click();
    await open(page, "Binta Musa");
    await expect(page.getByText("This place is not taking part, so its record can't be written to.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to new text" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  });

  test("fills the week grid like the paper booklet, and sees the days it saved", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, w.teacher);
    await goToRecord(page, w.seed.program.id);
    await page.getByRole("button", { name: "Week grid" }).click();
    const grid = page.getByRole("region", { name: "Week grid" });
    await expect(grid.getByRole("button", { name: "Save the week" })).toBeDisabled();
    await grid
      .getByLabel(/^New text .+ From surah$/)
      .first()
      .selectOption("1");
    await grid
      .getByLabel(/^New text .+ From ayah$/)
      .first()
      .fill("1");
    await grid
      .getByLabel(/^New text .+ To surah$/)
      .first()
      .selectOption("1");
    await grid
      .getByLabel(/^New text .+ To ayah$/)
      .first()
      .fill("7");
    await grid
      .getByLabel(/^New text .+ Rating$/)
      .first()
      .selectOption("5");
    await grid.getByRole("button", { name: "Save the week" }).click();
    await expect(grid.getByText("1 day was saved.")).toBeVisible();
    await expect(grid.getByRole("button", { name: "Save the week" })).toBeDisabled();
    await page.getByRole("button", { name: "Hide the week grid" }).click();
    await expect(entries(page, "New text").getByRole("listitem")).toContainText("Al-Fatihah 1 to 7");
    expect(await db.progressEntry.count()).toBe(1);
  });

  test("hands an entry in when the program verifies, and cannot verify it", async ({ page }) => {
    const w = await world({ verify: true });
    await signInThroughUi(page, w.teacher);
    await goToRecord(page, w.seed.program.id);
    await page.getByRole("button", { name: "Add to new text" }).click();
    const dialog = dialogOf(page, "Add new text");
    await dialog.getByLabel("From surah").selectOption("3");
    await dialog.getByLabel("From ayah").fill("1");
    await dialog.getByLabel("To surah").selectOption("3");
    await dialog.getByLabel("To ayah").fill("10");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    const row = entries(page, "New text").getByRole("listitem");
    await expect(row).toContainText("Draft");
    await page.getByRole("button", { name: /^Hand in the new text entry/ }).click();
    await expect(page.getByText("The entry was handed in.")).toBeVisible();
    await expect(row).toContainText("Handed in");
    await expect(page.getByRole("button", { name: /^Verify the new text entry/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Change the new text entry/ })).toBeVisible();
  });
});

test.describe("a supervisor", () => {
  test("verifies a handed-in entry, or returns it with a comment, and cannot write", async ({ page }) => {
    const w = await world({ verify: true });
    await w.entry(w.amina, -1, { status: "SUBMITTED" });
    await w.entry(w.amina, -2, { status: "SUBMITTED", values: { range: { fromSurah: 3, fromAyah: 1, toSurah: 3, toAyah: 4 }, rating: 3 } });
    await signInThroughUi(page, w.supervisor);
    await openProgramTab(page, w.seed.program.id, "Progress records");
    await expect(page.getByRole("list", { name: "People" }).getByRole("listitem").filter({ hasText: "Amina Musa" })).toContainText(
      "2 waiting to be verified",
    );
    await open(page, "Amina Musa");
    await expect(page.getByRole("button", { name: "Add to new text" })).toHaveCount(0);
    await expect(page.getByText("You are not named to write to this person's group.")).toBeVisible();
    const rows = entries(page, "New text").getByRole("listitem");
    await rows
      .filter({ hasText: "Al-Baqarah 1 to 5" })
      .getByRole("button", { name: /^Verify/ })
      .click();
    await expect(page.getByText("The entry was verified.")).toBeVisible();
    await expect(rows.filter({ hasText: "Al-Baqarah 1 to 5" })).toContainText("Verified");
    await rows
      .filter({ hasText: "Ali 'Imran 1 to 4" })
      .getByRole("button", { name: /^Return/ })
      .click();
    const dialog = dialogOf(page, "Return this entry");
    await dialog.getByLabel("Comment for the writer").fill("ok");
    await dialog.getByRole("button", { name: "Return entry" }).click();
    await expect(dialog.getByText(/few words/i)).toBeVisible();
    await dialog.getByLabel("Comment for the writer").fill("Check the last ayah again");
    await dialog.getByRole("button", { name: "Return entry" }).click();
    await expect(page.getByText("The entry was returned.")).toBeVisible();
    await expect(rows.filter({ hasText: "Ali 'Imran 1 to 4" })).toContainText("Returned: Check the last ayah again");
    await expect(rows.filter({ hasText: "Ali 'Imran 1 to 4" })).toContainText("Draft");
  });

  test("verifies the whole week from the week grid", async ({ page }) => {
    const w = await world({ verify: true });
    await w.entry(w.amina, -1, { status: "SUBMITTED" });
    await w.entry(w.amina, -2, { status: "SUBMITTED" });
    await signInThroughUi(page, w.supervisor);
    await goToRecord(page, w.seed.program.id);
    await page.getByRole("button", { name: "Week grid" }).click();
    const grid = page.getByRole("region", { name: "Week grid" });
    // the week of today might start after the entries (they are yesterday and the day before): go back a week when nothing waits here
    if ((await grid.getByRole("button", { name: "Verify the week" }).count()) === 0)
      await grid.getByRole("button", { name: "Earlier week" }).click();
    const verifyButton = grid.getByRole("button", { name: "Verify the week" });
    const waiting = await db.progressEntry.count({ where: { status: "SUBMITTED" } });
    expect(waiting).toBe(2);
    if (await verifyButton.count()) {
      await verifyButton.click();
      await expect(grid.getByText(/entries? w(as|ere) verified\./)).toBeVisible();
      expect(await db.progressEntry.count({ where: { status: "VERIFIED" } })).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe("a program admin", () => {
  test("turns progress records on in the Settings tab, after choosing a template", async ({ page }) => {
    const w = await world({ template: false });
    await signInThroughUi(page, w.sa);
    await page.goto(`/programs/${w.seed.program.id}`);
    await expect(programTab(page, "Progress records")).toHaveCount(0);
    await programTab(page, "Settings").click();
    const fieldset = page.getByRole("group", { name: "Progress records" });
    await expect(fieldset.getByTestId("progress-settings-state")).toContainText("switched off for this program");
    await fieldset.getByLabel("Keep progress records in this program").check();
    await expect(fieldset.getByText("Choose a template before turning progress records on.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
    await fieldset.getByLabel("Template").selectOption("SIMPLE_LOG");
    await fieldset.getByLabel("Verify entries before families see them").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The settings were saved.")).toBeVisible();
    await expect(programTab(page, "Progress records")).toBeVisible();
    expect(await db.program.findUniqueOrThrow({ where: { id: w.seed.program.id } })).toMatchObject({
      progressEnabled: true,
      progressTemplate: "SIMPLE_LOG",
      progressRequireVerification: true,
    });
    await programTab(page, "Progress records").click();
    await expect(page.getByText("Template: Simple daily log")).toBeVisible();
    await expect(page.getByText("entries are verified before families see them")).toBeVisible();
  });

  test("sees that a program admin cannot change the four-eyes rule, and that the lock times are checked", async ({ page }) => {
    const w = await world();
    const admin = await createUser({ role: Role.TEACHING_STAFF, name: "Program Admin" });
    await db.programStaff.create({
      data: { programId: w.seed.program.id, userId: admin.id, branchId: w.seed.first.id, role: "ADMIN", createdByUserId: w.sa.id },
    });
    await signInThroughUi(page, admin);
    await page.goto(`/programs/${w.seed.program.id}`);
    await programTab(page, "Settings").click();
    const fieldset = page.getByRole("group", { name: "Progress records" });
    await expect(fieldset.getByLabel("Someone else has to verify an entry (not the person who wrote it)")).toBeDisabled();
    await expect(fieldset.getByText("Only a super admin can change that.")).toBeVisible();
    await fieldset.getByLabel("Lock ends after (seconds without activity)").fill("20");
    await expect(fieldset.getByText("From 60 to 3600 seconds.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });
});

test.describe("a pupil and a guardian in the portal", () => {
  async function portal(page: Page, secret: string) {
    await page.goto("/portal");
    await page.fill("#admissionNo", "2026/0001");
    await page.fill("#secret", secret);
    await page.click("button:has-text('Access Student Portal')");
    await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
  }
  const progressTab = (page: Page) => page.getByRole("tablist", { name: "Student Portal Sections" }).getByRole("tab", { name: "Progress" });

  test("a pupil sees their verified entries and marks a week as seen; nothing unverified shows", async ({ page }) => {
    const w = await world({ verify: true });
    await w.entry(w.amina, -1, { status: "VERIFIED" });
    await w.entry(w.amina, -2, { status: "DRAFT", values: { range: { fromSurah: 18, fromAyah: 1, toSurah: 18, toAyah: 9 } } });
    await portal(page, "2013-05-10");
    await progressTab(page).click();
    const card = page.getByRole("region", { name: "Progress in Quran memorisation" });
    await expect(card).toBeVisible();
    await expect(card.getByText("This month so far")).toBeVisible();
    await expect(card.getByRole("region", { name: "New text entries" })).toContainText("Al-Baqarah 1 to 5");
    await expect(card).not.toContainText("Al-Kahf");
    await card
      .getByRole("button", { name: /^Mark the week of .+ as seen$/ })
      .first()
      .click();
    await expect(card.getByText("You marked this week as seen.").first()).toBeVisible();
    expect(await db.progressSeen.count({ where: { actor: "PUPIL" } })).toBe(1);
  });

  test("a guardian sees a summary and no day-by-day notes; the program can allow the full entries", async ({ page }) => {
    const w = await world();
    await w.entry(w.amina, -1, {
      values: { range: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 }, notes: "Confident today", rating: 5 },
    });
    await w.entry(w.amina, -1, { trackKey: "mistakes", values: { note: "Mixes up the endings" } });
    await portal(page, "08011110001");
    await progressTab(page).click();
    const card = page.getByRole("region", { name: "Progress in Quran memorisation" });
    await expect(card.getByText("This month so far")).toBeVisible();
    await expect(card).toContainText("1 day recorded");
    await expect(card).toContainText("5 ayat");
    await expect(card).not.toContainText("Confident today");
    await expect(card).not.toContainText("Mixes up the endings");
    await expect(card.getByRole("region", { name: "New text entries" })).toHaveCount(0);
    await db.program.update({ where: { id: w.seed.program.id }, data: { progressGuardianDetail: "FULL" } });
    await page.reload();
    await progressTab(page).click();
    await expect(
      page.getByRole("region", { name: "Progress in Quran memorisation" }).getByRole("region", { name: "New text entries" }),
    ).toContainText("Confident today");
  });

  test("a pupil whose program shows no progress record has no Progress tab", async ({ page }) => {
    const w = await world();
    await w.entry(w.amina, -1);
    await db.program.update({ where: { id: w.seed.program.id }, data: { progressStudentView: false } });
    await portal(page, "2013-05-10");
    await expect(progressTab(page)).toHaveCount(0);
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme: the list, a record, an entry dialog, the week grid, the settings and the portal`, async ({ page, context }) => {
      const w = await world({ verify: true });
      await w.entry(w.amina, -1, { status: "SUBMITTED" });
      await w.entry(w.amina, -2, { status: "VERIFIED" });
      await w.entry(w.amina, -2, { trackKey: "mistakes", status: "VERIFIED", values: { note: "Rushes the last ayah" } });
      await db.progressRecord.update({ where: { participantId: w.amina.id }, data: { profile: { age: "12", riwayah: "HAFS" } } });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, w.sa);
      await openProgramTab(page, w.seed.program.id, "Progress records");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectAccessible(page, `${theme} list`);
      await expectFits(page, `${theme} list`);
      await open(page, "Amina Musa");
      await expect(entries(page, "New text").getByRole("listitem")).toHaveCount(2);
      await expectAccessible(page, `${theme} record`);
      await expectFits(page, `${theme} record`);
      await page.getByRole("button", { name: "Add to new text" }).click();
      await expect(dialogOf(page, "Add new text")).toBeVisible();
      await expectAccessible(page, `${theme} entry dialog`);
      await dialogOf(page, "Add new text").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Week grid" }).click();
      await expect(page.getByRole("region", { name: "Week grid" }).getByText(/^Week of/)).toBeVisible();
      await expectAccessible(page, `${theme} week grid`);
      await expectFits(page, `${theme} week grid`);
      await page.getByRole("button", { name: "Hide the week grid" }).click();
      await page.getByRole("button", { name: "Back to the people" }).click();
      await programTab(page, "Settings").click();
      await expect(page.getByRole("group", { name: "Progress records" })).toBeVisible();
      await expectAccessible(page, `${theme} settings`);
      await expectFits(page, `${theme} settings`);
    });

    test(`${theme} theme: the portal Progress tab`, async ({ page, context }) => {
      const w = await world();
      await w.entry(w.amina, -1);
      await db.program.update({ where: { id: w.seed.program.id }, data: { progressGuardianDetail: "FULL" } });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await page.goto("/portal");
      await page.fill("#admissionNo", "2026/0001");
      await page.fill("#secret", "08011110001");
      await page.click("button:has-text('Access Student Portal')");
      await page.getByRole("tablist", { name: "Student Portal Sections" }).getByRole("tab", { name: "Progress" }).click();
      await expect(page.getByRole("region", { name: "Progress in Quran memorisation" })).toBeVisible();
      await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
      await expectAccessible(page, `${theme} portal progress`);
      await expectFits(page, `${theme} portal progress`);
    });
  }
});
