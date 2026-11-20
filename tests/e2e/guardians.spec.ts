import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0113 on screen (the maintainer, 2026-11-19): Users > Guardians lists the guardians, opening one shows all their children, and an administrator blocks the guardian from some of them (with a
// reason) and lifts it; a guardian's access code is made there and shown once; a pupil's Guardians and Access codes are in the pupil's Actions list; a class prints its slips; day or boarding is
// on the pupil's form, card and filter. Driven on a desktop and a phone, with axe on each screen.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}
const CODE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

let n = 0;
const pupil = (branchId: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
  db.studentRecord.create({
    data: { branchId, firstName, lastName, gender: "FEMALE", admissionNo: `E2E/${Date.now() % 100000}/${++n}`, ...extra },
  });

async function setUp(page: Page) {
  const branch = await seedInstance();
  const other = await db.branch.findFirstOrThrow({ where: { id: { not: branch.id } }, orderBy: { name: "asc" } });
  // A superadmin: every branch, so every child of a guardian is listed.
  const admin = await createUser({ role: Role.ADMIN, name: "Guardian Admin" });
  const mrs = await db.guardian.create({
    data: { name: "Mrs Yusuf", phone: "08030001111", phoneKey: "8030001111", email: "mrs.yusuf@example.com" },
  });
  const kids = [
    await pupil(branch.id, "Amina", "Yusuf"),
    await pupil(branch.id, "Bilal", "Yusuf"),
    await pupil(other.id, "Chidi", "Yusuf"),
  ];
  for (const [i, kid] of kids.entries())
    await db.studentGuardian.create({
      data: { studentId: kid.id, branchId: kid.branchId, guardianId: mrs.id, isMain: i === 0, relationship: i === 0 ? "MOTHER" : null },
    });
  await db.guardian.create({ data: { name: "Mr Okafor", phone: "08039990000", phoneKey: "8039990000" } });
  await signInThroughUi(page, admin);
  return { branch, other, admin, mrs, kids };
}

test("Users > Guardians: the list, a guardian's children, blocking one with a reason, and lifting it", async ({ page }) => {
  await setUp(page);
  await page.goto("/users?tab=guardians");
  const list = page.getByRole("list", { name: "Guardians" });
  await expect(list.getByRole("listitem").filter({ hasText: "Mrs Yusuf" })).toContainText("3 children");
  await expect(list.getByRole("listitem").filter({ hasText: "Mr Okafor" })).toContainText("No code yet");
  await expectAccessible(page, "Users > Guardians");

  // Search narrows the list.
  await page.getByRole("searchbox", { name: "Search guardians" }).fill("okaf");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search guardians" }).fill("");
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Open Mrs Yusuf" }).click();
  const dialog = page.getByRole("dialog", { name: "Guardian Mrs Yusuf" });
  const children = dialog.getByRole("list", { name: "Children of Mrs Yusuf" });
  await expect(children.getByRole("listitem")).toHaveCount(3);
  await expect(children).toContainText("Amina Yusuf");
  await expect(children).toContainText("Chidi Yusuf");
  await expect(children.getByRole("listitem").filter({ hasText: "Amina Yusuf" })).toContainText("Main contact");
  await expect(children.getByRole("listitem").filter({ hasText: "Amina Yusuf" })).toContainText("Mother");
  await expect(children.getByText("Allowed")).toHaveCount(3);
  await expectAccessible(page, "a guardian's dialog");

  // Block one child: a reason is required.
  await dialog.getByRole("button", { name: "Block this guardian from Bilal Yusuf" }).click();
  const form = dialog.getByRole("form", { name: "Block from Bilal Yusuf" });
  await form.getByRole("button", { name: "Block" }).click();
  await expect(form).toContainText("Say why this guardian is blocked.");
  await form.getByLabel("Why is this guardian blocked from Bilal Yusuf?").fill("Court order of 12 March");
  await expectAccessible(page, "the block form");
  await form.getByRole("button", { name: "Block" }).click();
  const bilal = children.getByRole("listitem").filter({ hasText: "Bilal Yusuf" });
  await expect(bilal).toContainText("Blocked on");
  await expect(bilal).toContainText("Court order of 12 March");
  await expect(bilal.getByText("Blocked", { exact: true })).toBeVisible();
  await expect(children.getByText("Allowed")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "Unblock this guardian from Bilal Yusuf" })).toBeVisible();
  const blocked = await db.studentGuardian.findFirstOrThrow({ where: { blockedAt: { not: null } } });
  expect(blocked.blockedReason).toBe("Court order of 12 March");

  // The list says so after the dialog closes.
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(list.getByRole("listitem").filter({ hasText: "Mrs Yusuf" })).toContainText("Blocked from 1");

  // Lift it.
  await page.getByRole("button", { name: "Open Mrs Yusuf" }).click();
  await dialog.getByRole("button", { name: "Unblock this guardian from Bilal Yusuf" }).click();
  await expect(children.getByText("Allowed")).toHaveCount(3);
  expect(await db.studentGuardian.count({ where: { blockedAt: { not: null } } })).toBe(0);
});

test("a guardian's access code is made in their dialog, shown once with a slip to print, and never again", async ({ page }) => {
  await setUp(page);
  await page.goto("/users?tab=guardians");
  await page.getByRole("button", { name: "Open Mrs Yusuf" }).click();
  const dialog = page.getByRole("dialog", { name: "Guardian Mrs Yusuf" });
  await expect(dialog).toContainText("No code yet");
  await dialog.getByRole("button", { name: "Make code" }).click();
  await expect(dialog.getByRole("heading", { name: "The new code (shown once)" })).toBeVisible();
  await expect(dialog.getByText(CODE)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Print the slip" })).toBeVisible();
  await expect(dialog).toContainText("Amina Yusuf"); // the children the one code opens
  await expect(dialog).toContainText("Bilal Yusuf");
  await expectAccessible(page, "the new code");
  await expect(dialog.getByRole("button", { name: "New code" })).toBeVisible();
  // Closed and opened again: the code is not shown, only that one was made.
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Mrs Yusuf" }).click();
  await expect(dialog.getByText(CODE)).toHaveCount(0);
  await expect(dialog).toContainText("Code made");
});

test("a pupil's Guardians: find a guardian by phone and link them, then unlink", async ({ page }) => {
  const { branch } = await setUp(page);
  await pupil(branch.id, "Hauwa", "Newcomer");
  await page.goto(`/students?branch=${branch.id}&q=Hauwa`);
  await clickAction(page, "Guardians of Hauwa Newcomer");
  const dialog = page.getByRole("dialog", { name: "Guardians of Hauwa Newcomer" });
  await expect(dialog).toContainText("No guardian yet");
  await dialog.getByLabel("Phone number or email").fill("+234 803 000 1111");
  await dialog.getByRole("button", { name: "Find", exact: true }).click();
  const found = dialog.getByRole("list", { name: "Guardians found" });
  await expect(found).toContainText("Mrs Yusuf");
  await expect(found).toContainText("Amina Yusuf"); // who they already are the guardian of: so they are not typed twice
  await expectAccessible(page, "the pupil's Guardians dialog");
  await dialog.getByRole("button", { name: "Link Mrs Yusuf" }).click();
  const guardians = dialog.getByRole("list", { name: "Guardians of Hauwa Newcomer" });
  await expect(guardians).toContainText("Mrs Yusuf");
  await expect(guardians).toContainText("Main contact");
  await expect(guardians).toContainText("3 other children");
  await dialog.getByRole("button", { name: "Unlink Mrs Yusuf" }).click();
  await expect(dialog).toContainText("No guardian yet");
  expect(await db.guardian.count({ where: { name: "Mrs Yusuf" } })).toBe(1); // the guardian stays
});

test("a pupil's Access codes: a pupil code made, shown once; a class prints its slips", async ({ page }) => {
  const { branch, mrs } = await setUp(page);
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Basic 5", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  const inClass = await db.studentRecord.findMany({ where: { branchId: branch.id, firstName: { in: ["Amina", "Bilal"] } } });
  for (const kid of inClass)
    await db.studentEnrollment.create({
      data: { studentId: kid.id, branchId: branch.id, sessionId: session.id, className: group.name, arm: "A", classArmId: arm.id },
    });
  await page.goto(`/students?branch=${branch.id}&q=Amina`);
  await clickAction(page, "Access codes of Amina Yusuf");
  const dialog = page.getByRole("dialog", { name: "Access codes of Amina Yusuf" });
  await expect(dialog.getByRole("list", { name: "Codes" })).toContainText("Mrs Yusuf");
  await dialog.getByRole("button", { name: "Make pupil code" }).click();
  await expect(dialog.getByRole("heading", { name: "New codes (shown once)" })).toBeVisible();
  await expect(dialog.getByText(CODE)).toBeVisible();
  await expectAccessible(page, "a pupil's access codes");
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();

  // The class's slips: how many it replaces is said before anything is made; the codes appear once.
  await page.goto(`/students?branch=${branch.id}`);
  await page.getByRole("button", { name: "Print access slips" }).click();
  const sheet = page.getByRole("dialog", { name: "Print access slips" });
  await sheet.getByLabel("Class", { exact: true }).selectOption({ label: "Basic 5" });
  await expect(sheet).toContainText("2 pupils in Basic 5");
  await expectAccessible(page, "the class slips dialog");
  await sheet.getByRole("button", { name: "Make pupil and guardian codes for 2" }).click();
  const slips = sheet.getByRole("list", { name: "Access slips" });
  await expect(slips.getByRole("listitem")).toHaveCount(2);
  await expect(slips).toContainText("Amina Yusuf");
  await expect(slips).toContainText("Bilal Yusuf");
  await expect(slips).toContainText("Mrs Yusuf"); // one guardian code for both: the family has one
  await expect(sheet.getByRole("button", { name: "Print the slips" })).toBeVisible();
  expect((await db.guardian.findUniqueOrThrow({ where: { id: mrs.id } })).codeHash).toMatch(/^s1\$/);
  expect(await db.studentRecord.count({ where: { pupilCodeHash: { not: null } } })).toBe(2);
});

test("day or boarding: on the form, on the card, and in the filter", async ({ page }) => {
  const { branch } = await setUp(page);
  await pupil(branch.id, "Dayo", "Resident", { residence: "DAY" });
  await pupil(branch.id, "Boarda", "Resident", { residence: "BOARDING" });
  await page.goto(`/students?branch=${branch.id}&q=Resident`);
  const list = page.getByRole("list", { name: "Students" });
  await expect(list.getByRole("listitem").filter({ hasText: "Boarda" })).toContainText("Boarding");
  await expect(list.getByRole("listitem").filter({ hasText: "Dayo" })).toContainText("Day");

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Day or boarding").selectOption("BOARDING");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Boarda");
  await page.getByLabel("Day or boarding").selectOption("NONE");
  await expect(page.getByText("No students match.")).toBeVisible();
  await page.getByLabel("Day or boarding").selectOption("");

  await page.getByRole("button", { name: "New student" }).click();
  const dialog = page.getByRole("dialog", { name: "New student" });
  await dialog.getByLabel("First name", { exact: true }).fill("Newly");
  await dialog.getByLabel("Last name").fill("Resident");
  await dialog.getByLabel("Gender").selectOption("FEMALE");
  await dialog.getByLabel("Day or boarding").selectOption("BOARDING");
  await expectAccessible(page, "the pupil form with the main guardian and day or boarding");
  await dialog.getByRole("button", { name: "Register student" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: "Newly" })).toContainText("Boarding");
  expect((await db.studentRecord.findFirstOrThrow({ where: { firstName: "Newly" } })).residence).toBe("BOARDING");
});
