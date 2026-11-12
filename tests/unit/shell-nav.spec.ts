import { test, expect } from "@playwright/test";
import { NAV, SECTIONS, groupNav, navFor, sectionOfPath } from "@/components/shell/nav";
import {
  SIDEBAR_COOKIE,
  parseFoldedSections,
  parseSidebarCollapsed,
  serializeFoldedSections,
  serializeSidebarCollapsed,
} from "@/lib/shell-prefs";

// The sidebar's list in sections (task 0042). `NAV` is the one list; these tests pin how it is grouped for each kind of person,
// that the phone's tab bar still comes out of the same list in the same order, and how the two remembered choices are read.

const labels = (items: { label: string }[]) => items.map((item) => item.label);
const IDS = SECTIONS.map((section) => section.id);

const admin = () => navFor(true, false);
const superAdmin = () => navFor(true, true);
const teacher = () => navFor(false, false, true, true);
const otherStaff = () => navFor(false, false, false, true);

test.describe("groupNav: sections for each kind of person", () => {
  test("a school-wide administrator sees Overview on its own, then four sections with every page in its section", () => {
    const groups = groupNav(superAdmin());
    expect(groups.map((group) => group.section?.label ?? null)).toEqual([
      null,
      "Classroom",
      "Assessment",
      "Communication",
      "Administration",
    ]);
    expect(labels(groups[0].items)).toEqual(["Overview"]);
    expect(labels(groups[1].items)).toEqual(["Students", "Coursework", "Attendance", "Timetable", "Programs"]);
    expect(labels(groups[2].items)).toEqual(["Results", "Question bank", "Forms"]);
    expect(labels(groups[3].items)).toEqual(["Announcements", "Communication"]);
    expect(labels(groups[4].items)).toEqual(["Branches", "Settings", "Academics", "Finance", "Approvals", "Users"]);
  });

  test("a branch administrator has no Branches or Settings, and the rest stays where it was", () => {
    const groups = groupNav(admin());
    expect(labels(groups[4].items)).toEqual(["Academics", "Finance", "Approvals", "Users"]);
  });

  test("a teacher: a section of one entry (Announcements) comes out as a plain link, in its place, with no heading", () => {
    const groups = groupNav(teacher());
    expect(groups.map((group) => group.section?.label ?? null)).toEqual([null, "Classroom", "Assessment", null]);
    expect(labels(groups[3].items)).toEqual(["Announcements"]);
    expect(labels(groups.flatMap((group) => group.items))).toHaveLength(teacher().length);
  });

  test("a member of staff who does not teach sees Overview, Programs, Forms and Announcements only: three single-entry sections, so no heading at all", () => {
    const groups = groupNav(otherStaff());
    expect(groups.every((group) => group.section === null)).toBe(true);
    expect(labels(groups.flatMap((group) => group.items))).toEqual(["Overview", "Programs", "Forms", "Announcements"]);
  });

  test("nothing is lost or repeated: the groups hold exactly the visible entries", () => {
    for (const items of [superAdmin(), admin(), teacher(), otherStaff(), navFor(false, false)]) {
      expect(labels(groupNav(items).flatMap((group) => group.items)).sort()).toEqual(labels(items).sort());
    }
  });

  test("an empty list has no groups; an entry with no section is never given a heading", () => {
    expect(groupNav([])).toEqual([]);
    const loose = NAV.filter((item) => !item.section);
    expect(labels(loose)).toEqual(["Overview"]);
    expect(groupNav(loose)).toEqual([{ section: null, items: loose }]);
  });

  test("the phone's More sheet groups a subset the same way (it passes only the entries that live there)", () => {
    const groups = groupNav(superAdmin().filter((item) => item.href && item.inMore));
    expect(groups.map((group) => group.section?.label ?? null)).toEqual(["Classroom", "Assessment", "Communication", "Administration"]);
    expect(labels(groups[1].items)).toEqual(["Question bank", "Forms"]); // Results is a tab, not in the sheet
  });
});

test.describe("the list itself", () => {
  test("every entry with a page belongs to a known section, except Overview", () => {
    for (const item of NAV) {
      if (item.label === "Overview") expect(item.section).toBeUndefined();
      else expect(IDS, item.label).toContain(item.section);
    }
  });

  test("the phone's tab bar is unchanged by sections: the first entries without inMore, in NAV order", () => {
    expect(labels(superAdmin().filter((item) => item.href && !item.inMore))).toEqual(["Overview", "Academics", "Results", "Users"]);
    expect(labels(teacher().filter((item) => item.href && !item.inMore))).toEqual(["Overview", "Results"]);
  });

  test("section ids are unique and are what the cookie stores", () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    expect(IDS).toEqual(["classroom", "assessment", "communication", "administration"]);
  });
});

test.describe("sectionOfPath", () => {
  test("a page and the pages below it belong to the section of their entry", () => {
    const items = superAdmin();
    expect(sectionOfPath("/students", items)).toBe("classroom");
    expect(sectionOfPath("/students/abc123", items)).toBe("classroom");
    expect(sectionOfPath("/forms/xyz", items)).toBe("assessment");
    expect(sectionOfPath("/users", items)).toBe("administration");
  });

  test("Overview, an unknown path and a page the person has no entry for belong to no section", () => {
    expect(sectionOfPath("/dashboard", superAdmin())).toBeNull();
    expect(sectionOfPath("/account", superAdmin())).toBeNull();
    expect(sectionOfPath("/users", teacher())).toBeNull();
  });

  test("a path that only starts with an entry's letters is not that entry's page", () => {
    expect(sectionOfPath("/studentsx", superAdmin())).toBeNull();
  });
});

test.describe("the remembered choices (cookies) are read strictly", () => {
  test("collapsed only when the cookie says exactly so", () => {
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    for (const value of [undefined, null, "", "expanded", "Collapsed", "true", "1", "collapsed ", "collapsed,x"]) {
      expect(parseSidebarCollapsed(value), String(value)).toBe(false);
    }
    expect(SIDEBAR_COOKIE).toBe("sidebar");
  });

  test("the two states round-trip", () => {
    expect(parseSidebarCollapsed(serializeSidebarCollapsed(true))).toBe(true);
    expect(parseSidebarCollapsed(serializeSidebarCollapsed(false))).toBe(false);
  });

  test("folded sections: only known ids, each once, in the order of the sections", () => {
    expect(parseFoldedSections("administration,classroom", IDS)).toEqual(["classroom", "administration"]);
    expect(parseFoldedSections("classroom,classroom,classroom", IDS)).toEqual(["classroom"]);
    expect(parseFoldedSections("classroom,<script>,__proto__,constructor,", IDS)).toEqual(["classroom"]);
    expect(parseFoldedSections("Classroom", IDS)).toEqual([]);
    expect(parseFoldedSections("", IDS)).toEqual([]);
    expect(parseFoldedSections(undefined, IDS)).toEqual([]);
    expect(parseFoldedSections(null, IDS)).toEqual([]);
  });

  test("folded sections round-trip, and an empty list is the empty cookie", () => {
    expect(parseFoldedSections(serializeFoldedSections(["assessment", "classroom"]), IDS)).toEqual(["classroom", "assessment"]);
    expect(serializeFoldedSections([])).toBe("");
    expect(serializeFoldedSections(["classroom", "classroom"])).toBe("classroom");
  });
});
