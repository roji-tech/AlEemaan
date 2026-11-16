import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, pupils } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C07 Attendance (task 0033, section 6.6): the daily roll call. The branch administrator takes the roll for Primary 1 A (everyone present, then one pupil absent with a remark), reads the
// summary, moves between days and comes back, makes the teacher the form teacher of the arm, grants and revokes an explicit permission for the other arm; then the teacher opens Attendance
// and is offered only the arm they hold.

const chapter = "C07 Attendance";

const teacherName = `${a.teacher.first} ${a.teacher.last}`;
const tile = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..");
const remark = "Sick note";

async function chooseArm(walk: Walk, page: Page, arm: string): Promise<void> {
  await walk.type(page.getByLabel("Class", { exact: true }), a.classes.first);
  await walk.type(page.getByLabel("Arm (optional)"), arm);
}

async function readSummary(
  page: Page,
  counts: { enrolled: number; present: number; late: number; absent: number; excused: number; rate: number },
): Promise<void> {
  await expect(tile(page, "Enrolled")).toHaveText(`Enrolled${counts.enrolled}`);
  await expect(tile(page, "Present")).toHaveText(`Present${counts.present}`);
  await expect(tile(page, "Late")).toHaveText(`Late${counts.late}`);
  await expect(tile(page, "Absent")).toHaveText(`Absent${counts.absent}`);
  await expect(tile(page, "Excused")).toHaveText(`Excused${counts.excused}`);
  await expect(tile(page, "Rate")).toHaveText(`Rate${counts.rate}%`);
}

export async function c07Attendance(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 63,
      chapter,
      role: "Branch administrator",
      title: "Take the roll for an arm: everyone present, one pupil absent",
      caption:
        "Choose the class and arm, press Mark All Present, then change the exceptions. A remark can say why. Save Roll Call records the day.",
      covers: ["ATT-01", "ATT-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Attendance");
      await chooseArm(walk, page, pupils.aisha.arm);
      await expect(page.getByText("Bello, Aisha")).toBeVisible();
      await expect(page.getByText("Danjuma, Yusuf")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Mark All Present", exact: true }));
      await walk.click(page.getByRole("button", { name: "ABSENT", exact: true }).nth(1));
      await walk.type(page.getByPlaceholder("Remarks (e.g. sick note)...").nth(1), remark);
      await walk.click(page.getByRole("button", { name: "Save Roll Call", exact: true }).first());
      await expect(page.getByText(/^Attendance recorded for \d{4}-\d{2}-\d{2} \(2 students\)\.$/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 64,
      chapter,
      role: "Branch administrator",
      title: "Read the summary: the counts add up",
      caption: "Enrolled, Present, Late, Absent, Excused and the attendance rate agree with the marks that were saved.",
      covers: ["ATT-04"],
    },
    async () => {
      await readSummary(page, { enrolled: 2, present: 1, late: 0, absent: 1, excused: 0, rate: 50 });
    },
  );

  await walk.step(
    {
      id: 65,
      chapter,
      role: "Branch administrator",
      title: "Move between days: a saved day is still there",
      caption:
        "Previous day opens the day before, which has no marks. Next day returns to the saved day, and the marks are as they were saved.",
      covers: ["ATT-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Previous day", exact: true }));
      await expect(page.getByRole("button", { name: "Next day", exact: true })).toBeEnabled();
      await walk.click(page.getByRole("button", { name: "Next day", exact: true }));
      await expect(page.getByRole("button", { name: "Next day", exact: true })).toBeDisabled();
      await readSummary(page, { enrolled: 2, present: 1, late: 0, absent: 1, excused: 0, rate: 50 });
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Attendance");
      await chooseArm(walk, page, pupils.aisha.arm);
      await readSummary(page, { enrolled: 2, present: 1, late: 0, absent: 1, excused: 0, rate: 50 });
      await expect(page.getByPlaceholder("Remarks (e.g. sick note)...").nth(1)).toHaveValue(remark);
    },
  );

  await walk.step(
    {
      id: 66,
      chapter,
      role: "Branch administrator",
      title: "Make the teacher the form teacher of an arm",
      caption: "The form teacher holds the permission to take the roll for their arm without being granted it.",
      covers: ["ATT-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Manage Permissions", exact: true }));
      const dialog = page.getByRole("dialog", { name: "Attendance Permissions & Grants" });
      await walk.selectOption(dialog.getByLabel("Class Arm", { exact: true }), `${a.classes.first} ${pupils.aisha.arm} (Unassigned)`);
      await walk.selectOption(dialog.getByLabel("Designated Teacher"), `${teacherName} (TEACHING)`);
      await walk.click(dialog.getByRole("button", { name: "Save Assignment", exact: true }));
      await expect(dialog.getByText("Class teacher updated successfully")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 67,
      chapter,
      role: "Branch administrator",
      title: "Grant a staff member the roll of another arm, then take it back",
      caption: "An explicit grant lets someone take the roll of an arm they are not the form teacher of. Revoke ends it.",
      covers: ["ATT-06"],
    },
    async () => {
      const dialog = page.getByRole("dialog", { name: "Attendance Permissions & Grants" });
      await walk.selectOption(dialog.getByLabel("Staff Member"), `${teacherName} (TEACHING)`);
      await walk.selectOption(dialog.getByLabel("Arm to Grant"), `${a.classes.first} ${pupils.zainab.arm}`);
      await walk.click(dialog.getByRole("button", { name: "Add Grant", exact: true }));
      await expect(dialog.getByText("Explicit grant added successfully")).toBeVisible();
      await expect(dialog.getByRole("row", { name: new RegExp(`${teacherName}.*${a.classes.first} ${pupils.zainab.arm}`) })).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Revoke", exact: true }));
      await expect(dialog.getByText("Grant revoked successfully")).toBeVisible();
      await expect(dialog.getByText("No explicit attendance grants active in this branch.")).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Close", exact: true }).last());
    },
  );

  await walk.step(
    {
      id: 68,
      chapter,
      role: "Teacher",
      title: "A teacher is offered only the arm they hold",
      caption:
        "The form teacher can take the roll of their own arm. An arm they have no permission for is refused with a sentence, not hidden behind an error.",
      covers: ["ATT-07"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Attendance");
      const authorized = page.getByLabel("Authorized Arm:");
      await expect(authorized.locator("option")).toHaveCount(2);
      await walk.selectOption(authorized, `${a.classes.first} ${pupils.aisha.arm} (Class Teacher)`);
      await expect(page.getByText("Bello, Aisha")).toBeVisible();
      await expect(page.getByRole("button", { name: "Manage Permissions", exact: true })).toHaveCount(0);
      await walk.selectOption(authorized, "Custom input below…");
      await walk.type(page.getByLabel("Arm (optional)"), pupils.zainab.arm);
      // the sentence itself, not getByRole("alert"): the framework's hidden route announcer is a role=alert too (strict-mode violation in the first full run)
      await expect(page.getByText("You do not have permission to view attendance for this arm.")).toBeVisible();
    },
  );
}
