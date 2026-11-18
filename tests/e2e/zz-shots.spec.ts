import { test } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Throwaway: screenshots of the redesigned screens, for looking at. Not committed.
const OUT = "/tmp/claude-1000/-home-rojitech-Desktop-CODEC-NextJS-next-school-project/40e7ea48-66c2-4762-9b60-173efdf77ee2/scratchpad/shots";
test("shots", async ({ page, isMobile }) => {
  test.skip(isMobile);
  test.setTimeout(240000);
  await resetDatabase();
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  const make = (ordinal: number, label: string, start: string, end: string, current: boolean) => ({
    branchId: branch.id, kind: "TERM" as const, ordinal, label, startDate: new Date(start), endDate: new Date(end), isCurrent: current,
  });
  const session = await db.academicSession.create({
    data: {
      branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-13"), endDate: new Date("2027-07-31"), status: "ACTIVE",
      periods: { create: [make(1, "1st Term", "2026-09-13", "2026-12-28", true), make(2, "2nd Term", "2026-12-29", "2027-04-14", false), make(3, "3rd Term", "2027-04-15", "2027-07-31", false)] },
    },
    include: { periods: true },
  });
  const first = session.periods.find((p) => p.ordinal === 1)!;
  await db.academicBreak.create({ data: { branchId: branch.id, periodId: first.id, label: "Mid-term break", startDate: new Date("2026-10-26"), endDate: new Date("2026-10-30") } }).catch(() => {});
  for (const [name, arms] of [["Nursery 1", ["A", "B"]], ["Nursery 2", ["A"]], ["Prep A", ["Main"]]] as const) {
    const g = await db.classGroup.create({ data: { branchId: branch.id, name } });
    for (const a of arms) await db.classArm.create({ data: { branchId: branch.id, classGroupId: g.id, name: a } });
  }
  await signInThroughUi(page, admin);
  for (const theme of ["dark", "light"] as const) {
    await page.context().addCookies([{ name: "theme", value: theme, url: "http://localhost:3200" }]);
    for (const [w, h] of [[390, 844], [850, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/academics?tab=sessions");
      await page.getByRole("list", { name: /^Terms of/ }).waitFor();
      await page.screenshot({ path: `${OUT}/sessions-${theme}-${w}.png`, fullPage: true });
      await page.goto("/academics?tab=classes");
      await page.getByRole("button", { name: "List view" }).click().catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/classes-${theme}-${w}.png`, fullPage: true });
    }
  }
  await resetDatabase();
});
