import { test, expect } from "@playwright/test";
import { birthDateRange, readPupilFilters, pupilFilterQuery, activePupilFilters, schoolDay } from "@/lib/students/list-filters";
import { EXPORT_COLUMNS, exportFileStem, exportTable, exportValues } from "@/lib/bulk/list-export";
import { pupilEntity } from "@/lib/bulk/pupils";
import { staffColumns } from "@/lib/bulk/staff";
import { classColumns } from "@/lib/bulk/classes";
import { subjectColumns } from "@/lib/bulk/subjects";
import { toCsv } from "@/lib/bulk/export";
import { queryWords } from "@/lib/search/records";
import { invitable } from "@/components/academics/StaffAccess";
import { actionLook } from "@/components/ui/action-look";

// Task 0112, the pure parts: ages as a range of birth dates, the pupil filters read from an address, the export's columns and file name, the search's words, who can be invited.

test.describe("birthDateRange (age on the school's day)", () => {
  test("whole years: the birthday itself counts, the day before does not", () => {
    // 8 to 10 on 19 Nov 2026: born on or before 2018-11-19 (8 today) and after 2015-11-19 (11 today).
    expect(birthDateRange(8, 10, "2026-11-19")).toEqual({ latest: "2018-11-19", earliest: "2015-11-20" });
    expect(birthDateRange(8, undefined, "2026-11-19")).toEqual({ latest: "2018-11-19" });
    expect(birthDateRange(undefined, 0, "2026-11-19")).toEqual({ earliest: "2025-11-20" });
  });
  test("29 February: in a year without one, the child turns a year older on 1 March", () => {
    expect(birthDateRange(10, undefined, "2026-02-28").latest).toBe("2016-02-28"); // born 2016-02-29 is still 9
    expect(birthDateRange(10, undefined, "2026-03-01").latest).toBe("2016-03-01"); // and 10 today
    expect(birthDateRange(undefined, 9, "2026-02-28").earliest).toBe("2016-02-29");
  });
  test("the year end, and a lowest age above the highest is refused", () => {
    expect(birthDateRange(5, 5, "2027-01-01")).toEqual({ latest: "2022-01-01", earliest: "2021-01-02" });
    expect(() => birthDateRange(9, 8, "2026-11-19")).toThrow(RangeError);
  });
  test("the school's day follows its time zone, not the server's", () => {
    const lateUtc = new Date("2026-11-19T23:30:00Z");
    expect(schoolDay(lateUtc, "Africa/Lagos")).toBe("2026-11-20");
    expect(schoolDay(lateUtc, "UTC")).toBe("2026-11-19");
  });
});

test.describe("the pupil filters in an address", () => {
  test("valid filters read back, and the same filters make the same address", () => {
    const read = readPupilFilters(new URLSearchParams("classGroupId=c1&classArmId=a1&gender=FEMALE&ageMin=6&ageMax=9"));
    expect(read.success).toBe(true);
    expect(read.data).toEqual({ classGroupId: "c1", classArmId: "a1", gender: "FEMALE", ageMin: 6, ageMax: 9 });
    expect(readPupilFilters(new URLSearchParams(pupilFilterQuery(read.data!).replace(/^&/, ""))).data).toEqual(read.data);
    expect(activePupilFilters(read.data!)).toBe(3);
    expect(readPupilFilters(new URLSearchParams("gender=&ageMin=")).data).toEqual({});
  });
  test("what cannot be meant is refused", () => {
    for (const bad of [
      "noClass=1&classGroupId=c1",
      "classArmId=a1",
      "ageMin=9&ageMax=8",
      "gender=OTHER",
      "ageMin=-1",
      "ageMax=200",
      "noClass=yes",
    ]) {
      expect(readPupilFilters(new URLSearchParams(bad)).success, bad).toBe(false);
    }
  });
});

test.describe("export", () => {
  test("the columns are the import templates', in the same order and words", () => {
    expect(EXPORT_COLUMNS.pupils.map((c) => c.label)).toEqual(pupilEntity.columns.map((c) => c.label));
    expect(EXPORT_COLUMNS.staff).toBe(staffColumns);
    expect(EXPORT_COLUMNS.classes).toBe(classColumns);
    expect(EXPORT_COLUMNS.subjects).toBe(subjectColumns);
  });
  test("a row is written as the import reads it, and a formula cell is neutralised in the CSV", () => {
    const pupil = exportValues.pupils({
      firstName: "Amina",
      middleName: null,
      lastName: "Yusuf",
      gender: "FEMALE",
      dateOfBirth: new Date("2016-02-29T00:00:00Z"),
      admissionNo: "2026/0001",
      className: "Basic 3",
      arm: "A",
      guardianName: '=HYPERLINK("x")',
      guardianPhone: "+2348031234567",
      guardianEmail: null,
    });
    const table = exportTable("pupils", [pupil]);
    expect(table.headers[0]).toBe("First name");
    expect(table.rows[0]).toEqual([
      "Amina",
      "",
      "Yusuf",
      "Female",
      "2016-02-29",
      "2026/0001",
      "Basic 3",
      "A",
      '=HYPERLINK("x")',
      "+2348031234567",
      "",
      "", // Day or boarding: not set (task 0113 R1)
      "", // Scholarship: none (task 0113 S1)
      "", // Scholarship %
    ]);
    const csv = toCsv(table.headers, table.rows);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",+2348031234567,");
    const staff = exportValues.staff({
      category: "NON_TEACHING",
      firstName: "Musa",
      lastName: "Bello",
      phone: null,
      email: "musa@school.example",
      title: "Mr",
      gender: "MALE",
      designation: "Bursar",
      qualification: null,
      corpsMember: true,
    });
    expect(exportTable("staff", [staff]).rows[0]).toEqual([
      "Non-teaching staff",
      "Musa",
      "Bello",
      "",
      "musa@school.example",
      "Mr",
      "Male",
      "Bursar",
      "",
      "Yes",
      "",
    ]);
    expect(
      exportTable("classes", [exportValues.classes({ name: "JSS 1", arms: ["A", "B"], subjects: ["English", "Maths"] })]).rows[0],
    ).toEqual(["JSS 1", "A, B", "English, Maths"]);
  });
  test("the file name is letters, digits and dashes only", () => {
    expect(exportFileStem("pupils", "Primary (English)", "2026-11-19", "shown")).toBe("pupils-primary-english-filtered-2026-11-19");
    expect(exportFileStem("staff", "Ṣẹ́kọ́ndírì / ../etc", "2026-11-19", "all")).toBe("staff-sekondiri-etc-2026-11-19");
    expect(exportFileStem("classes", "!!!", "2026-11-19", "all")).toBe("classes-branch-2026-11-19");
  });
});

test.describe("search and staff", () => {
  test("the search's words: at most four, control characters gone", () => {
    expect(queryWords("  Amina   Yusuf ")).toEqual(["Amina", "Yusuf"]);
    expect(queryWords("a b c d e f")).toEqual(["a", "b", "c", "d"]);
    expect(queryWords("x\u0000y")).toEqual(["x", "y"]);
  });
  test("who can be invited from the list: live, active, an e-mail, no sign-in, no link waiting", () => {
    const base = { archived: false, standing: "ACTIVE", email: "a@b.example", account: { state: "none" }, invited: null };
    expect(invitable(base)).toBe(true);
    expect(invitable({ ...base, invited: { expired: true } })).toBe(true);
    expect(invitable({ ...base, invited: { expired: false } })).toBe(false);
    expect(invitable({ ...base, email: null })).toBe(false);
    expect(invitable({ ...base, archived: true })).toBe(false);
    expect(invitable({ ...base, standing: "SUSPENDED" })).toBe(false);
    expect(invitable({ ...base, account: { state: "linked" } })).toBe(false);
  });
  test("menu looks: invite is an e-mail, transfer a building", () => {
    expect(actionLook({ id: "invite" }).tone).toBe("ok");
    expect((actionLook({ id: "invite" }).icon as { type?: { name?: string } }).type?.name).toBe("MailIcon");
    expect((actionLook({ id: "transfer" }).icon as { type?: { name?: string } }).type?.name).toBe("BuildingIcon");
  });
});
