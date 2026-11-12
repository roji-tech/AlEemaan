import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0055 in a real browser: the Broadcast Composer offers only what can work. The tag chips follow the audience (the server fills exactly those), there is no "Due Date" chip and no
// In-App channel, choosing pupils turns SMS and WhatsApp off (a pupil's login has no phone number) and says why, and a tag the audience cannot have is refused on screen with the text kept.
// The server's side (what is filled in, who is reached) is in tests/api/communication-tags-recipients.spec.ts.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeAll(async () => {
  await seedInstance();
});

async function openComposer(page: Page) {
  const user = await createUser({ role: Role.ADMIN });
  await signInThroughUi(page, user);
  await page.goto("/communication");
  await expect(page.getByRole("heading", { level: 1, name: "Communication" })).toBeVisible();
  await expect(page.getByLabel("Message Content")).toBeVisible();
}

const chip = (page: Page, label: string) => page.getByRole("button", { name: `+ ${label}`, exact: true });
const channelButton = (page: Page, name: string) => page.locator("#broadcast-channel").getByRole("button", { name, exact: true });

test("guardians: the four tags the server fills, no Due Date, and no In-App channel", async ({ page }) => {
  await openComposer(page);
  for (const label of ["Student Name", "Class Arm", "School Name", "Today's Date"]) await expect(chip(page, label)).toBeVisible();
  await expect(chip(page, "Due Date")).toHaveCount(0);

  await expect(page.locator("#broadcast-channel").getByRole("button")).toHaveText(["SMS", "Email", "WhatsApp"]);
  await expect(channelButton(page, "In-App")).toHaveCount(0);
  await expect(channelButton(page, "SMS")).toHaveAttribute("aria-pressed", "true");

  await chip(page, "Class Arm").click();
  await expect(page.getByLabel("Message Content")).toHaveValue(/\{\{class_arm\}\}/);
});

test("staff get only the tags staff can have; pupils are reached by Email only, and the screen says why", async ({ page }) => {
  await openComposer(page);
  const audience = page.getByLabel("Target Audience");

  await audience.selectOption("STAFF");
  await expect(chip(page, "School Name")).toBeVisible();
  await expect(chip(page, "Today's Date")).toBeVisible();
  await expect(chip(page, "Student Name")).toHaveCount(0);
  await expect(chip(page, "Class Arm")).toHaveCount(0);
  await expect(channelButton(page, "SMS")).toBeEnabled(); // staff have a phone number on their staff record

  // SMS is selected; choosing pupils moves to Email and switches the two phone channels off
  await audience.selectOption("STUDENTS");
  await expect(channelButton(page, "Email")).toHaveAttribute("aria-pressed", "true");
  await expect(channelButton(page, "SMS")).toBeDisabled();
  await expect(channelButton(page, "WhatsApp")).toBeDisabled();
  await expect(page.getByText("Pupils have no phone number on file, so only Email is available for them.")).toBeVisible();
  await expect(page.getByLabel("Email / Message Subject")).toBeVisible();
  await expect(chip(page, "Student Name")).toHaveCount(0);

  // back to guardians: the phone channels and the pupil tags return
  await audience.selectOption("ALL_PARENTS");
  await expect(channelButton(page, "SMS")).toBeEnabled();
  await expect(channelButton(page, "WhatsApp")).toBeEnabled();
  await expect(page.getByText("Pupils have no phone number on file, so only Email is available for them.")).toHaveCount(0);
  await expect(chip(page, "Student Name")).toBeVisible();
});

test("the subject is for Email only", async ({ page }) => {
  await openComposer(page);
  await expect(page.getByLabel("Email / Message Subject")).toHaveCount(0); // SMS is the first channel
  await channelButton(page, "Email").click();
  await expect(page.getByLabel("Email / Message Subject")).toBeVisible();
  await channelButton(page, "WhatsApp").click();
  await expect(page.getByLabel("Email / Message Subject")).toHaveCount(0);
});

test("a tag the audience cannot have is refused on screen, says which and for whom, and the text is kept", async ({ page }) => {
  await openComposer(page);
  await page.getByLabel("Target Audience").selectOption("STAFF");
  await channelButton(page, "Email").click();
  const text = "A word about {{student_name}} for the staff room.";
  await page.getByLabel("Message Content").fill(text);
  await page.getByRole("button", { name: "Send Broadcast" }).click();
  await expect(
    page.getByText("These tags cannot be filled for staff: {{student_name}}. Remove them or choose another audience."),
  ).toBeVisible();
  await expect(page.getByLabel("Message Content")).toHaveValue(text);
});

for (const theme of ["dark", "light"] as const) {
  test(`axe finds nothing on the composer with pupils chosen (${theme} theme)`, async ({ page, baseURL }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    await openComposer(page);
    await page.getByLabel("Target Audience").selectOption("STUDENTS");
    await expect(page.getByText("Pupils have no phone number on file, so only Email is available for them.")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
      `accessibility violations on the composer (${theme})`,
    ).toEqual([]);
  });
}
