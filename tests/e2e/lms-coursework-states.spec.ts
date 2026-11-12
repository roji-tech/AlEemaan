import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

// An assignment and a study material can be saved as a draft, edited, and (an assignment) closed, reopened, archived and restored from the screens (task 0066).
// Before, an assignment was only ever created already published, and a material could only be added or deleted.

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  const branch = await db.branch.findFirstOrThrow();
  await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
});

const signInAsAdmin = async (page: import("@playwright/test").Page) => {
  const admin = await createUser({ role: Role.ADMIN, name: "Coursework Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
  await page.goto("/lms");
};

test("an assignment: save as a draft, edit and publish it, close and reopen hand-ins, archive and restore", async ({ page }) => {
  await signInAsAdmin(page);
  const title = "Essay on honesty";
  const status = async () => (await db.assignment.findFirstOrThrow({ where: { title: { startsWith: "Essay" } } })).status;

  // saved as a draft: stored as DRAFT, and the card offers to publish it
  await page.getByRole("button", { name: "+ Create Assignment" }).click();
  const create = page.getByRole("dialog", { name: "Create Coursework Assignment" });
  await create.getByLabel("Assignment Title").fill(title);
  await create.getByRole("button", { name: "Save as Draft" }).click();
  await expect(create).toBeHidden();
  await expect(page.getByRole("button", { name: `Publish draft: ${title}` })).toBeVisible();
  expect(await status()).toBe("DRAFT");

  // edited and published from the same dialog: the fields start from the row, the draft button is "Save Draft", the main one publishes
  await page.getByRole("button", { name: `Edit assignment ${title}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit Coursework Assignment" });
  await expect(edit.getByLabel("Assignment Title")).toHaveValue(title);
  await expect(edit.getByRole("button", { name: "Save Draft" })).toBeVisible();
  await edit.getByLabel("Assignment Title").fill("Essay on honesty, revised");
  await edit.getByLabel("Total Points").fill("40");
  await edit.getByRole("button", { name: "Publish Assignment" }).click();
  await expect(edit).toBeHidden();
  const revised = "Essay on honesty, revised";
  await expect(page.getByRole("button", { name: `Close hand-ins: ${revised}` })).toBeVisible();
  const row = await db.assignment.findFirstOrThrow({ where: { title: revised } });
  expect(row.status).toBe("PUBLISHED");
  expect(row.totalPoints).toBe(40);

  // a published assignment is edited with "Save Changes" and no draft button; the status stays
  await page.getByRole("button", { name: `Edit assignment ${revised}` }).click();
  await expect(edit.getByRole("button", { name: "Save Draft" })).toHaveCount(0);
  await edit.getByLabel("Description").fill("Two pages, in your own words.");
  await edit.getByRole("button", { name: "Save Changes" }).click();
  await expect(edit).toBeHidden();
  const saved = await db.assignment.findFirstOrThrow({ where: { title: revised } });
  expect(saved.status).toBe("PUBLISHED");
  expect(saved.description).toBe("Two pages, in your own words.");
  expect(saved.totalPoints).toBe(40);

  // closed, reopened, archived, restored (back to a draft)
  await page.getByRole("button", { name: `Close hand-ins: ${revised}` }).click();
  await expect(page.getByRole("button", { name: `Reopen hand-ins: ${revised}` })).toBeVisible();
  expect(await status()).toBe("CLOSED");
  await page.getByRole("button", { name: `Reopen hand-ins: ${revised}` }).click();
  await expect(page.getByRole("button", { name: `Close hand-ins: ${revised}` })).toBeVisible();
  expect(await status()).toBe("PUBLISHED");
  await page.getByRole("button", { name: `Archive assignment ${revised}` }).click();
  await expect(page.getByRole("button", { name: `Restore assignment ${revised} as a draft` })).toBeVisible();
  expect(await status()).toBe("ARCHIVED");
  await page.getByRole("button", { name: `Restore assignment ${revised} as a draft` }).click();
  await expect(page.getByRole("button", { name: `Publish draft: ${revised}` })).toBeVisible();
  expect(await status()).toBe("DRAFT");
});

test("a study material: save as a draft with a type, edit it, publish it, take it back to a draft", async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole("tab", { name: /Study Materials & Notes/ }).click();
  const title = "Recording of week 2";
  const row = () => db.learningMaterial.findFirstOrThrow({ where: { title: { startsWith: "Recording" } } });

  // saved as a draft, with a type: both are stored, and the card says Draft and the type
  await page.getByRole("button", { name: "+ Add Material" }).click();
  const add = page.getByRole("dialog", { name: "Add Learning Material" });
  await add.getByLabel("Material Title").fill(title);
  await add.getByLabel("Type of Resource").selectOption("VIDEO_LINK");
  await add.getByRole("button", { name: "Save as Draft" }).click();
  await expect(add).toBeHidden();
  await expect(page.getByRole("button", { name: `Publish draft: ${title}` })).toBeVisible();
  await expect(page.getByText("Video Link / Recording", { exact: true }).first()).toBeVisible();
  expect((await row()).status).toBe("DRAFT");
  expect((await row()).materialType).toBe("VIDEO_LINK");

  // edited: the fields start from the row; a new title, type and link are saved; publishing from the dialog
  await page.getByRole("button", { name: `Edit material ${title}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit Learning Material" });
  await expect(edit.getByLabel("Material Title")).toHaveValue(title);
  await expect(edit.getByLabel("Type of Resource")).toHaveValue("VIDEO_LINK");
  await edit.getByLabel("Material Title").fill("Recording of week 3");
  await edit.getByLabel("Type of Resource").selectOption("PRESENTATION");
  await edit.getByLabel("Resource Link or Document URL").fill("https://school.example/week3.pdf");
  await edit.getByRole("button", { name: "Publish Material" }).click();
  await expect(edit).toBeHidden();
  const edited = await row();
  expect(edited.title).toBe("Recording of week 3");
  expect(edited.materialType).toBe("PRESENTATION");
  expect(edited.status).toBe("PUBLISHED");
  expect(edited.attachments).toEqual([{ title: "Recording of week 3", url: "https://school.example/week3.pdf" }]);
  await expect(page.getByRole("link", { name: "Open Recording of week 3 ↗" })).toHaveAttribute("href", "https://school.example/week3.pdf");

  // taken back to a draft and published again from the card
  await page.getByRole("button", { name: "Unpublish: Recording of week 3" }).click();
  await expect(page.getByRole("button", { name: "Publish draft: Recording of week 3" })).toBeVisible();
  expect((await row()).status).toBe("DRAFT");
  await page.getByRole("button", { name: "Publish draft: Recording of week 3" }).click();
  await expect(page.getByRole("button", { name: "Unpublish: Recording of week 3" })).toBeVisible();
  expect((await row()).status).toBe("PUBLISHED");
});
