import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C09 Timetable (task 0033, section 6.6): the branch administrator schedules a period, the same period on two days, edits one and comes back to it, filters by arm and teacher in the grid and
// the list, is warned when a teacher would be in two places, and removes a period (the browser asks first). A teacher then opens the timetable and can look but not change it.

const chapter = "C09 Timetable";

const teacherName = `${a.teacher.first} ${a.teacher.last}`;
const heading = "Timetable & Scheduling";
// One period in the grid: its card is a button whose text holds the subject, the times, the arm, the teacher and the room.
const period = (page: Page, text: string): Locator => page.getByRole("button").filter({ hasText: text });

// The arm selects of this screen offer "<class> <arm>" (the first full run chose "A" and "B" and found no such option).
const armLabel = (arm: string): string => `${a.classes.first} ${arm}`;

async function slotForm(
  walk: Walk,
  page: Page,
  day: string,
  start: string,
  end: string,
  arm: string,
  subject: string,
  room: string,
): Promise<Locator> {
  await walk.click(page.getByRole("button", { name: "Schedule Period" }));
  const dialog = page.getByRole("dialog", { name: "Schedule New Timetable Slot" });
  await walk.selectOption(dialog.getByLabel("Day of Week"), day);
  await walk.type(dialog.getByLabel("Start Time (HH:MM)"), start);
  await walk.type(dialog.getByLabel("End Time (HH:MM)"), end);
  await walk.selectOption(dialog.getByLabel("Class Arm", { exact: true }), arm);
  await walk.selectOption(dialog.getByLabel("Subject"), subject);
  await walk.selectOption(dialog.getByLabel("Teacher"), teacherName);
  await walk.type(dialog.getByLabel("Room / Lab / Location (Optional)"), room);
  return dialog;
}

export async function c09Timetable(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 74,
      chapter,
      role: "Branch administrator",
      title: "Schedule a period",
      caption: "A period is a day, a time, a class arm, a subject, a teacher and, if wanted, a room. It appears in that day's column.",
      covers: ["TMT-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Timetable", heading);
      await expect(page.getByText("No periods scheduled")).toHaveCount(5);
      const dialog = await slotForm(walk, page, "Monday", "0800AM", "0840AM", armLabel("A"), a.subjects.maths, "Room 1");
      await walk.click(dialog.getByRole("button", { name: "Add Slot", exact: true }));
      await expect(period(page, "08:00 – 08:40")).toHaveCount(1);
      await expect(period(page, "08:00 – 08:40")).toContainText(a.subjects.maths);
      await expect(period(page, "08:00 – 08:40")).toContainText(teacherName);
      await expect(period(page, "08:00 – 08:40")).toContainText("Room 1");
      await expect(page.getByText("No periods scheduled")).toHaveCount(4);
    },
  );

  await walk.step(
    {
      id: 75,
      chapter,
      role: "Branch administrator",
      title: "Schedule the same period on several days at once",
      caption: "Tick the days. All of them are scheduled together, or none if one clashes.",
      covers: ["TMT-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Same period, several days" }));
      const dialog = page.getByRole("dialog", { name: "Schedule the same period on several days" });
      await walk.selectOption(dialog.getByLabel("Class arm"), armLabel("A"));
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.english);
      await walk.selectOption(dialog.getByLabel("Teacher"), teacherName);
      await walk.type(dialog.getByLabel("Starts"), "0900AM");
      await walk.type(dialog.getByLabel("Ends"), "0940AM");
      await walk.type(dialog.getByLabel("Room (optional)"), "Room 1");
      await walk.click(dialog.getByText("Tuesday", { exact: true }));
      await walk.click(dialog.getByText("Wednesday", { exact: true }));
      await walk.click(dialog.getByRole("button", { name: "Schedule 2 periods", exact: true }));
      await expect(period(page, "09:00 – 09:40")).toHaveCount(2);
      await expect(page.getByText("No periods scheduled")).toHaveCount(2);
    },
  );

  await walk.step(
    {
      id: 76,
      chapter,
      role: "Branch administrator",
      title: "Edit a period and come back to it",
      caption: "Clicking a period opens it for editing. The change is saved: it is still there after leaving the page.",
      covers: ["TMT-03"],
    },
    async () => {
      await walk.click(period(page, "08:00 – 08:40"));
      const dialog = page.getByRole("dialog", { name: "Edit Timetable Slot" });
      await walk.type(dialog.getByLabel("Room / Lab / Location (Optional)"), "Room 2");
      await walk.click(dialog.getByRole("button", { name: "Update Slot", exact: true }));
      await expect(period(page, "08:00 – 08:40")).toContainText("Room 2");
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Timetable", heading);
      await expect(period(page, "08:00 – 08:40")).toContainText("Room 2");
      await expect(period(page, "08:00 – 08:40")).not.toContainText("Room 1");
    },
  );

  await walk.step(
    {
      id: 77,
      chapter,
      role: "Branch administrator",
      title: "Filter by arm and by teacher, in the grid and in the list",
      caption: "The filters narrow what is shown. List View shows the same periods as a table with a status for each.",
      covers: ["TMT-04"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Filter by Class Arm"), armLabel("B"));
      await expect(page.getByText("No periods scheduled")).toHaveCount(5);
      await walk.selectOption(page.getByLabel("Filter by Class Arm"), "All Class Arms");
      await walk.selectOption(page.getByLabel("Filter by Teacher"), teacherName);
      await expect(period(page, "08:00 – 08:40")).toHaveCount(1);
      await walk.click(page.getByRole("button", { name: "List View", exact: true }));
      await expect(page.getByRole("row").filter({ hasText: "Active" })).toHaveCount(3);
      await walk.click(page.getByRole("button", { name: "Grid View", exact: true }));
      await expect(period(page, "09:00 – 09:40")).toHaveCount(2);
    },
  );

  await walk.step(
    {
      id: 78,
      chapter,
      role: "Branch administrator",
      title: "A teacher cannot be in two places at once",
      caption:
        "While the form is open, a conflict is shown and Add Slot is switched off: the period cannot be saved until the time is changed.",
      covers: ["TMT-05"],
    },
    async () => {
      const dialog = await slotForm(walk, page, "Monday", "0820AM", "0900AM", armLabel("B"), a.subjects.maths, "Room 3");
      await expect(dialog.getByText("Schedule Conflict Detected")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Add Slot", exact: true })).toBeDisabled();
      await walk.click(dialog.getByRole("button", { name: "Cancel", exact: true }));
      await expect(period(page, "08:20 – 09:00")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 79,
      chapter,
      role: "Branch administrator",
      title: "Remove a period: the browser asks first",
      caption: "Delete Slot asks for confirmation before it removes the period.",
      covers: ["TMT-03"],
    },
    async () => {
      await walk.click(period(page, "09:00 – 09:40").first());
      const dialog = page.getByRole("dialog", { name: "Edit Timetable Slot" });
      await walk.acceptNextConfirm("Are you sure you want to remove this timetable slot?");
      await walk.click(dialog.getByRole("button", { name: "Delete Slot", exact: true }));
      await expect(period(page, "09:00 – 09:40")).toHaveCount(1);
    },
  );

  await walk.step(
    {
      id: 80,
      chapter,
      role: "Teacher",
      title: "A teacher can look at the timetable and not change it",
      caption: "The periods are shown. The buttons to schedule are not offered, and clicking a period opens nothing.",
      covers: ["TMT-06", "TMT-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Timetable", heading);
      await expect(period(page, "08:00 – 08:40")).toHaveCount(1);
      for (const hidden of ["Schedule Period", "Same period, several days"]) {
        await expect(page.getByRole("button", { name: hidden })).toHaveCount(0);
      }
      await walk.click(period(page, "08:00 – 08:40"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
    },
  );
}
