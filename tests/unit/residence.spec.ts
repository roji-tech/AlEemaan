import { test, expect } from "@playwright/test";
import { activePupilFilters, pupilFilterQuery, readPupilFilters } from "@/lib/students/list-filters";
import { pupilEntity, toResidence } from "@/lib/bulk/pupils";
import { validateRows } from "@/lib/bulk/validate";
import { EXPORT_COLUMNS, exportTable, exportValues } from "@/lib/bulk/list-export";

// Task 0113 R1 (the maintainer: "we have day students and burden students, we need to be able to classify"): day or boarding, as a list filter, an import column and an export column.

test.describe("the list filter", () => {
  test("Day, Boarding and Not set are read from the address; anything else is refused", () => {
    for (const value of ["DAY", "BOARDING", "NONE"]) {
      const read = readPupilFilters(new URLSearchParams(`residence=${value}`));
      expect(read.success, value).toBe(true);
      if (read.success) expect(read.data.residence).toBe(value);
    }
    for (const bad of ["day", "Boarding", "BOTH", "1"])
      expect(readPupilFilters(new URLSearchParams(`residence=${bad}`)).success, bad).toBe(false);
    expect(readPupilFilters(new URLSearchParams("residence=")).success).toBe(true);
  });
  test("it counts as one active filter and goes into the list's and the export's address the same way", () => {
    const read = readPupilFilters(new URLSearchParams("residence=BOARDING&gender=MALE"));
    if (!read.success) throw new Error("should read");
    expect(activePupilFilters(read.data)).toBe(2);
    expect(pupilFilterQuery(read.data)).toContain("&residence=BOARDING");
  });
});

test.describe("the import column", () => {
  test("Day or Boarding in any case and the usual wordings; blank is not set", () => {
    expect(toResidence("Day")).toBe("DAY");
    expect(toResidence(" BOARDING ")).toBe("BOARDING");
    expect(toResidence("boarder")).toBe("BOARDING");
    expect(toResidence("Day student")).toBe("DAY");
    expect(toResidence("day-pupil")).toBe("DAY");
    expect(toResidence("")).toBeUndefined();
    expect(toResidence("   ")).toBeUndefined();
  });
  const base = { firstName: "Amina", lastName: "Yusuf", gender: "Female" };
  const run = (residence: string | undefined) =>
    validateRows(pupilEntity, [{ line: 2, values: { ...base, ...(residence === undefined ? {} : { residence }) } }]);
  test("a row with Day, Boarding or nothing is ready, and carries the value", () => {
    expect(run("boarding").ok[0].row.residence).toBe("BOARDING");
    expect(run("Day").ok[0].row.residence).toBe("DAY");
    expect(run("").verdicts[0].status).toBe("ready");
    expect(run(undefined).ok[0].row.residence).toBeUndefined();
  });
  test("anything else is a problem on the row, in words", () => {
    const out = run("weekly");
    expect(out.verdicts[0].status).not.toBe("ready");
    expect(JSON.stringify(out.verdicts[0])).toContain("Day or Boarding");
  });
  test("the template has a Day or boarding column with a dropdown of two", () => {
    const col = pupilEntity.columns.find((c) => c.key === "residence");
    expect(col?.label).toBe("Day or boarding");
    expect(col?.required).toBe(false);
    expect(col?.options?.map((o) => o.value)).toEqual(["DAY", "BOARDING"]);
  });
});

test.describe("the export column", () => {
  test("it follows the template's, in words", () => {
    expect(EXPORT_COLUMNS.pupils.map((c) => c.label)).toEqual(pupilEntity.columns.map((c) => c.label));
    const row = (residence: string | null | undefined) =>
      exportValues.pupils({
        firstName: "A",
        middleName: null,
        lastName: "B",
        gender: "MALE",
        dateOfBirth: null,
        admissionNo: "1",
        className: null,
        arm: null,
        guardianName: null,
        guardianPhone: null,
        guardianEmail: null,
        residence,
      }).residence;
    expect(row("DAY")).toBe("Day");
    expect(row("BOARDING")).toBe("Boarding");
    expect(row(null)).toBe("");
    expect(row(undefined)).toBe("");
    const table = exportTable("pupils", [
      exportValues.pupils({
        firstName: "A",
        middleName: null,
        lastName: "B",
        gender: "MALE",
        dateOfBirth: null,
        admissionNo: "1",
        className: null,
        arm: null,
        guardianName: null,
        guardianPhone: null,
        guardianEmail: null,
        residence: "BOARDING",
      }),
    ]);
    const at = table.headers.indexOf("Day or boarding");
    expect(at).toBeGreaterThan(-1);
    expect(table.rows[0][at]).toBe("Boarding");
  });
});
