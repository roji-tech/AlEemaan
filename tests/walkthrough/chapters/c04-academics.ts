import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C04 Academics (task 0033, section 6.6): the branch administrator sets the branch up for teaching. Classes with arms, subjects and which class studies which (create, correct a slip,
// archive), then the staff records of the branch: create, edit, search, link a record to the person's sign-in, assign them to a subject in an arm, take an assignment away, archive and
// restore. After each group the chapter leaves the page by clicking and comes back by clicking and reads it again.

const chapter = "C04 Academics";

const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const classCard = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
const subjectsList = (page: Page) => page.getByRole("region", { name: "Subjects" });
const teacherName = `${a.teacher.first} ${a.teacher.last}`;
const officeName = `${a.office.first} ${a.office.last}`;

async function newClass(walk: Walk, page: Page, name: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: "New class", exact: true }));
  const dialog = page.getByRole("dialog", { name: "New class" });
  await walk.type(dialog.getByLabel("Class name"), name);
  await walk.click(dialog.getByRole("button", { name: "Create class" }));
  await expect(page.getByText(`${name} created.`)).toBeVisible();
}

async function addArm(walk: Walk, page: Page, className: string, arm: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: `Add an arm to ${className}`, exact: true }));
  const dialog = page.getByRole("dialog", { name: `Add an arm to ${className}` });
  await walk.type(dialog.getByLabel("Arm name"), arm);
  await walk.click(dialog.getByRole("button", { name: "Add arm" }));
  await expect(page.getByText(`Arm ${arm} added.`)).toBeVisible();
}

async function newSubject(walk: Walk, page: Page, name: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: "New subject", exact: true }));
  const dialog = page.getByRole("dialog", { name: "New subject" });
  await walk.type(dialog.getByLabel("Subject name"), name);
  await walk.click(dialog.getByRole("button", { name: "Create subject" }));
  await expect(page.getByText(`${name} created.`)).toBeVisible();
}

async function newStaff(
  walk: Walk,
  page: Page,
  person: { first: string; last: string; email: string; phone: string },
  kind: string,
): Promise<void> {
  await walk.click(page.getByRole("button", { name: "New staff record", exact: true }));
  const dialog = page.getByRole("dialog", { name: "New staff record" });
  await walk.selectOption(dialog.getByLabel("Kind of staff"), kind);
  await walk.type(dialog.getByLabel("First name"), person.first);
  await walk.type(dialog.getByLabel("Last name"), person.last);
  await walk.type(dialog.getByLabel("Phone (optional)"), person.phone);
  await walk.type(dialog.getByLabel("Email (optional)"), person.email);
  await walk.click(dialog.getByRole("button", { name: "Add staff record" }));
  await expect(page.getByText(`${person.first} ${person.last} added.`)).toBeVisible();
}

export async function c04Academics(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 33,
      chapter,
      role: "Branch administrator",
      title: "Sign in as the branch administrator and open Academics",
      caption:
        "Academics holds the classes, subjects, grading and staff of one branch. A branch administrator sees only their own branch, so there is no branch picker.",
      covers: ["ACA-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Academics");
      await expect(tab(page, "Classes and subjects")).toHaveAttribute("aria-selected", "true");
      for (const name of ["Assessment and grading", "Staff", "Promotion & rollover"]) {
        await expect(tab(page, name)).toBeVisible();
      }
      await expect(page.getByText("No classes yet.")).toBeVisible();
      await expect(page.getByText("No subjects yet.")).toBeVisible();
      await expect(page.getByLabel("Branch", { exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 34,
      chapter,
      role: "Branch administrator",
      title: "Create a class and add its arms",
      caption:
        "A class is a year group; its arms are the groups the pupils sit in. The number beside an arm is how many pupils are enrolled in it.",
      covers: ["ACA-01"],
    },
    async () => {
      await newClass(walk, page, a.classes.first);
      await addArm(walk, page, a.classes.first, a.arms.a);
      await addArm(walk, page, a.classes.first, a.arms.b);
      await expect(classCard(page, a.classes.first).getByText(`${a.arms.a} · 0`, { exact: true })).toBeVisible();
      await expect(classCard(page, a.classes.first).getByText(`${a.arms.b} · 0`, { exact: true })).toBeVisible();
      await expect(classCard(page, a.classes.first)).toContainText("No subjects set");
    },
  );

  await walk.step(
    {
      id: 35,
      chapter,
      role: "Branch administrator",
      title: "Correct a class name typed with a slip",
      caption: "Edit renames the class; its arms and everything attached to it stay as they are.",
      covers: ["ACA-01", "ACA-03"],
    },
    async () => {
      await newClass(walk, page, a.classes.slip);
      await walk.click(page.getByRole("button", { name: `Rename ${a.classes.slip}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Edit ${a.classes.slip}` });
      await walk.type(dialog.getByLabel("Class name"), a.classes.second);
      await walk.click(dialog.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText(`${a.classes.second} saved.`)).toBeVisible();
      await expect(page.getByText(a.classes.slip, { exact: true })).toHaveCount(0);
      await expect(page.getByText(a.classes.second, { exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 36,
      chapter,
      role: "Branch administrator",
      title: "Archive a class",
      caption: "Archiving takes a class out of the active list without deleting its history.",
      covers: ["ACA-03"],
    },
    async () => {
      await newClass(walk, page, a.classes.toArchive);
      await walk.click(page.getByRole("button", { name: `Archive ${a.classes.toArchive}`, exact: true }));
      await expect(page.getByText(`${a.classes.toArchive} archived.`)).toBeVisible();
      await expect(page.getByText(a.classes.toArchive, { exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 37,
      chapter,
      role: "Branch administrator",
      title: "Create subjects and correct one",
      caption: "Subjects belong to the branch. A slip in a name is corrected with Edit.",
      covers: ["ACA-02", "ACA-03"],
    },
    async () => {
      await newSubject(walk, page, a.subjects.slip);
      await walk.click(page.getByRole("button", { name: `Edit ${a.subjects.slip}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Edit ${a.subjects.slip}` });
      await walk.type(dialog.getByLabel("Subject name"), a.subjects.maths);
      await walk.click(dialog.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText(`${a.subjects.maths} saved.`)).toBeVisible();
      await newSubject(walk, page, a.subjects.english);
      await newSubject(walk, page, a.subjects.toArchive);
      await expect(page.getByRole("button", { name: `Edit ${a.subjects.slip}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Edit ${a.subjects.maths}`, exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 38,
      chapter,
      role: "Branch administrator",
      title: "Archive a subject",
      caption: "An archived subject leaves the list the classes choose from.",
      covers: ["ACA-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Archive ${a.subjects.toArchive}`, exact: true }));
      await expect(page.getByText(`${a.subjects.toArchive} archived.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Edit ${a.subjects.toArchive}`, exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 39,
      chapter,
      role: "Branch administrator",
      title: "Choose which subjects a class studies",
      caption: "Each class studies its own set of subjects. Teachers are later assigned only to subjects their class studies.",
      covers: ["ACA-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Subjects of ${a.classes.first}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Subjects of ${a.classes.first}` });
      await walk.click(dialog.getByText(a.subjects.maths, { exact: true }));
      await walk.click(dialog.getByText(a.subjects.english, { exact: true }));
      await expect(dialog.getByLabel(a.subjects.maths)).toBeChecked();
      await expect(dialog.getByLabel(a.subjects.english)).toBeChecked();
      await walk.click(dialog.getByRole("button", { name: "Save subjects" }));
      await expect(page.getByText(`Subjects of ${a.classes.first} saved.`)).toBeVisible();
      await expect(classCard(page, a.classes.first)).toContainText(a.subjects.maths);
      await expect(classCard(page, a.classes.first)).toContainText(a.subjects.english);
    },
  );

  await walk.step(
    {
      id: 40,
      chapter,
      role: "Branch administrator",
      title: "Leave and come back: the classes and subjects are still there",
      caption: "Persistence is shown by leaving the page and returning to it.",
      covers: ["ACA-01", "ACA-02", "ACA-03"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Academics");
      await expect(page.getByText(a.classes.first, { exact: true })).toBeVisible();
      await expect(page.getByText(a.classes.second, { exact: true })).toBeVisible();
      await expect(page.getByText(a.classes.toArchive, { exact: true })).toHaveCount(0);
      await expect(page.getByText(`${a.arms.a} · 0`, { exact: true })).toBeVisible();
      await expect(classCard(page, a.classes.first)).toContainText(a.subjects.maths);
      await expect(classCard(page, a.classes.first)).toContainText(a.subjects.english);
      await expect(subjectsList(page)).toContainText(a.subjects.maths);
      await expect(subjectsList(page)).toContainText(a.subjects.english);
      await expect(subjectsList(page)).not.toContainText(a.subjects.toArchive);
    },
  );

  await walk.step(
    {
      id: 41,
      chapter,
      role: "Branch administrator",
      title: "Create staff records: a teacher and an office worker",
      caption: "A staff record is the branch's own list of the people it employs. A record does not by itself create a login.",
      covers: ["ACA-04"],
    },
    async () => {
      await walk.click(tab(page, "Staff"));
      await expect(page.getByText("No staff records yet.")).toBeVisible();
      await newStaff(walk, page, a.teacher, "Teaching");
      await newStaff(walk, page, a.office, "NON_TEACHING");
      await expect(page.getByText(`Teaching · No sign-in · 0 assignments · ${a.teacher.email} · ${a.teacher.phone}`)).toBeVisible();
      await expect(page.getByText(`Non-teaching · No sign-in · 0 assignments · ${a.office.email} · ${a.office.phone}`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 42,
      chapter,
      role: "Branch administrator",
      title: "Edit a staff record and search the list",
      caption: "Search finds a person by name, email or phone.",
      covers: ["ACA-04"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Edit ${teacherName}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Edit ${teacherName}` });
      await walk.type(dialog.getByLabel("Phone (optional)"), a.teacher.phoneCorrected);
      await walk.click(dialog.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText(`${teacherName} saved.`)).toBeVisible();
      await expect(page.getByText(a.teacher.phoneCorrected)).toBeVisible();
      await expect(page.getByText(a.teacher.phone)).toHaveCount(0);
      await walk.type(page.getByLabel("Search staff"), "Kem");
      await expect(page.getByRole("button", { name: `Manage ${officeName}`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Manage ${teacherName}`, exact: true })).toHaveCount(0);
      await walk.type(page.getByLabel("Search staff"), "");
      await expect(page.getByRole("button", { name: `Manage ${teacherName}`, exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 43,
      chapter,
      role: "Branch administrator",
      title: "Link a staff record to a person's sign-in, unlink it and link it again",
      caption:
        "Linking joins the record to the member who signs in; the member must be of the same kind. Unlinking leaves the record and removes the connection.",
      covers: ["ACA-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Manage ${teacherName}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: teacherName });
      await expect(dialog.getByText("No sign-in. This person is recorded but cannot log in.")).toBeVisible();
      await walk.selectOption(dialog.getByLabel("Link to a member"), teacherName);
      await walk.click(dialog.getByRole("button", { name: "Link sign-in" }));
      await expect(dialog.getByText("Sign-in linked.")).toBeVisible();
      await expect(dialog.getByText(`Linked to ${teacherName}.`)).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Unlink sign-in" }));
      await expect(dialog.getByText("Sign-in unlinked.")).toBeVisible();
      await walk.selectOption(dialog.getByLabel("Link to a member"), teacherName);
      await walk.click(dialog.getByRole("button", { name: "Link sign-in" }));
      await expect(dialog.getByText(`Linked to ${teacherName}.`)).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Close", exact: true }).last());
      await expect(page.getByText("Teaching · Can sign in · 0 assignments")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 44,
      chapter,
      role: "Branch administrator",
      title: "Assign a teacher to subjects in an arm",
      caption: "An assignment says who teaches which subject in which arm. Only subjects the class studies are offered.",
      covers: ["ACA-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Manage ${teacherName}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: teacherName });
      await walk.selectOption(dialog.getByLabel("Class and arm"), `${a.classes.first} ${a.arms.a}`);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.maths);
      await walk.click(dialog.getByRole("button", { name: "Assign", exact: true }));
      await expect(dialog.getByText("Subject assigned.")).toBeVisible();
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.english);
      await walk.click(dialog.getByRole("button", { name: "Assign", exact: true }));
      await expect(dialog.getByText(`${a.subjects.maths} · ${a.classes.first} ${a.arms.a}`)).toBeVisible();
      await expect(dialog.getByText(`${a.subjects.english} · ${a.classes.first} ${a.arms.a}`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 45,
      chapter,
      role: "Branch administrator",
      title: "Take an assignment away",
      caption: "Remove takes one subject in one arm off the teacher; the others stay.",
      covers: ["ACA-06"],
    },
    async () => {
      const dialog = page.getByRole("dialog", { name: teacherName });
      await walk.selectOption(dialog.getByLabel("Class and arm"), `${a.classes.first} ${a.arms.b}`);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.maths);
      await walk.click(dialog.getByRole("button", { name: "Assign", exact: true }));
      await expect(dialog.getByText(`${a.subjects.maths} · ${a.classes.first} ${a.arms.b}`)).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: `Remove ${a.subjects.maths} in ${a.classes.first} ${a.arms.b}`, exact: true }));
      await expect(dialog.getByText("Assignment removed.")).toBeVisible();
      await expect(dialog.getByText(`${a.subjects.maths} · ${a.classes.first} ${a.arms.b}`)).toHaveCount(0);
      await expect(dialog.getByText(`${a.subjects.maths} · ${a.classes.first} ${a.arms.a}`)).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Close", exact: true }).last());
      await expect(page.getByText("Teaching · Can sign in · 2 assignments")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 46,
      chapter,
      role: "Branch administrator",
      title: "Archive a staff record and restore it",
      caption: "An archived record leaves the current list. Show Archived finds it, and Restore brings it back.",
      covers: ["ACA-07"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Archive ${officeName}`, exact: true }));
      await expect(page.getByText(`${officeName} archived.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Manage ${officeName}`, exact: true })).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Show"), "Archived");
      await expect(page.getByRole("button", { name: `Manage ${officeName}`, exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Restore ${officeName}`, exact: true }));
      await expect(page.getByText(`${officeName} restored.`)).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Current staff");
      await expect(page.getByRole("button", { name: `Manage ${officeName}`, exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 47,
      chapter,
      role: "Branch administrator",
      title: "Leave and come back: the staff records are still there",
      caption: "The link to the sign-in and the assignments were saved, not just shown.",
      covers: ["ACA-04", "ACA-05", "ACA-06", "ACA-07"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Academics");
      await walk.click(tab(page, "Staff"));
      await expect(
        page.getByText(`Teaching · Can sign in · 2 assignments · ${a.teacher.email} · ${a.teacher.phoneCorrected}`),
      ).toBeVisible();
      await expect(page.getByText(`Non-teaching · No sign-in · 0 assignments · ${a.office.email} · ${a.office.phone}`)).toBeVisible();
    },
  );
}
