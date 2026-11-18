import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The bulk review at every width (the maintainer, 2026-11-18, on a screenshot of 144 pupils refused for the same reason: the Result column was a few words wide, so each problem was a tall
// strip of one word per line). The same problem on many rows is said once above the table, the Result column keeps room to read, the table scrolls inside its own region rather than
// squeezing, and the page itself never scrolls sideways.
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const WIDTHS = [
  { name: "phone", width: 360, height: 780 },
  { name: "large phone", width: 430, height: 900 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];
const rows = (n: number) => "First name,Last name,Gender\n" + Array.from({ length: n }, (_, i) => `Pupil${i},,Female`).join("\n") + "\n";
const dialog = (page: Page) => page.getByRole("dialog").first();

for (const size of WIDTHS) {
  test(`pupil review at ${size.name} (${size.width}px): one summary line for a repeated problem, readable Result column, no page scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
    await signInThroughUi(page, admin);
    await page.goto("/students");
    await page.getByRole("button", { name: "Add many" }).click();
    // the branch the rows go into is a labelled chip at the top of the dialog, not only a sentence in the grey description
    const branch = await db.branch.findFirstOrThrow();
    await expect(dialog(page).getByText(branch.name, { exact: true })).toBeVisible();
    await dialog(page)
      .getByLabel("CSV or Excel file")
      .setInputFiles({ name: "pupils.csv", mimeType: "text/csv", buffer: Buffer.from(rows(12)) });
    await expect(
      dialog(page)
        .getByRole("status")
        .filter({ hasText: /rows?:/ }),
    ).toContainText("12 rows: 0 ready, 12 with problems");

    // the repeated problem is said once, with how many rows it is on
    const fixing = dialog(page).getByRole("region", { name: "What needs fixing" });
    await expect(fixing).toContainText("12 rows");
    await expect(fixing.getByRole("listitem")).toHaveCount(1);

    // the list: a table in a scroll area of its own, bounded in height, whose Result column is at least 240 px at every width (it was a one-word strip)
    const region = dialog(page).getByRole("region", { name: "The rows that were read" });
    const result = region.getByText("Has problems").first();
    expect(await result.boundingBox(), "the first problem row is drawn").not.toBeNull();
    const cell = await result.evaluate((el) => (el.closest("td") as HTMLElement).getBoundingClientRect().width);
    expect(cell).toBeGreaterThanOrEqual(240);
    const box = await region.evaluate((el) => ({
      height: el.clientHeight,
      scrolls: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
    }));
    expect(box.height, "the table scrolls inside itself instead of making the dialog a mile long").toBeLessThanOrEqual(size.height * 0.7);

    // the grid: a compact card per row, headed by the pupil's name, with the empty cells left out
    await dialog(page).getByRole("group", { name: "Show the rows as" }).getByRole("button", { name: "Grid view" }).click();
    const cards = dialog(page).getByRole("list", { name: "The rows that were read" }).getByRole("listitem");
    await expect(cards.first()).toContainText("Pupil0");
    await expect(cards.first()).not.toContainText("(empty)");
    expect((await cards.first().boundingBox())!.height, "a card is compact, not a screen").toBeLessThan(260);

    // nothing makes the page itself scroll sideways
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
