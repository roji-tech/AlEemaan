import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// A DESIGN REVIEW capture, not a test: it only runs with UI_SHOTS=1 and saves pictures of the screens of task 0085 at phone, tablet and desktop widths in both themes, into
// out/screenshots/ui-batch/, for a person to look at. It asserts nothing about pixels.
test.skip(!process.env.UI_SHOTS, "design review capture: set UI_SHOTS=1");
const OUT = path.resolve(__dirname, "../../out/screenshots/ui-batch");
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [
  { name: "phone", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 860 },
];

test.beforeAll(async () => {
  await seedInstance();
});

async function seed() {
  const branch = await db.branch.findFirstOrThrow({ orderBy: { name: "asc" } });
  const stamp = Date.now().toString(36);
  const empty = await db.branch.create({ data: { name: `Review branch ${stamp}` } });
  await db.classGroup.createMany({
    data: Array.from({ length: 9 }, (_, i) => ({ branchId: branch.id, name: `Review JSS ${i + 1} ${stamp}`, sortOrder: 200 + i })),
  });
  await db.subject.createMany({
    data: [
      "Mathematics",
      "English",
      "Basic Science",
      "Arabic",
      "Islamic Studies",
      "Civic Education",
      "Computer Studies",
      "Agriculture",
      "Business Studies",
      "History",
      "Geography",
      "Home Economics",
      "Music",
      "Physical Education",
    ].map((name) => ({ branchId: branch.id, name: `${name} ${stamp}` })),
  });
  return { branch, empty };
}
const shot = (page: Page, name: string, size: string, theme: string) =>
  page.screenshot({ path: `${OUT}/${name}-${size}-${theme}.png`, fullPage: false });

for (const theme of ["dark", "light"] as const) {
  for (const size of SIZES) {
    test(`screens at ${size.name} in the ${theme} theme`, async ({ page, baseURL }) => {
      if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
      const { empty } = await seed();
      await page.setViewportSize({ width: size.width, height: size.height });
      await signInThroughUi(page, await createUser({ role: Role.ADMIN }));

      await page.goto("/branches");
      await page.getByRole("heading", { level: 1, name: "Branches" }).waitFor();
      await shot(page, "branches", size.name, theme);
      await page.getByRole("button", { name: `Delete ${empty.name}` }).click();
      await page
        .getByRole("dialog")
        .getByText(/holds nothing/)
        .waitFor();
      await shot(page, "branches-delete", size.name, theme);
      await page.keyboard.press("Escape");
      await page.goto(`/branches/${empty.id}`);
      await page.getByRole("heading", { level: 1, name: empty.name }).waitFor();
      await shot(page, "branch-page", size.name, theme);

      await page.goto("/academics");
      await page.getByRole("heading", { level: 1, name: "Academics" }).waitFor();
      await page.getByRole("heading", { level: 2, name: "Classes and arms" }).waitFor();
      await shot(page, "academics-classes", size.name, theme);
      await page.getByRole("button", { name: /^Filters/ }).click();
      await shot(page, "academics-classes-filters", size.name, theme);
      await page.getByRole("tab", { name: "Subjects", exact: true }).click();
      await page.getByRole("heading", { level: 2, name: "Subjects" }).waitFor();
      await shot(page, "academics-subjects", size.name, theme);

      await page.goto("/users");
      await page.getByRole("heading", { level: 1, name: "Users" }).waitFor();
      await shot(page, "users", size.name, theme);
      await page.getByRole("button", { name: /^Filters/ }).click();
      await shot(page, "users-filters", size.name, theme);

      if (size.name === "phone") {
        await page.goto("/dashboard");
        await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).click();
        await shot(page, "more-sheet", size.name, theme);
      }
    });
  }
}
