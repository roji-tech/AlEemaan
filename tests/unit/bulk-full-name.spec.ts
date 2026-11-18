import { test, expect } from "@playwright/test";
import { splitFullName } from "@/lib/bulk/names";
import { mapTable } from "@/lib/bulk/table";
import { pupilEntity } from "@/lib/bulk/pupils";
import { validateRows } from "@/lib/bulk/validate";

// A file may give one name column ("Name", "Full name", "full_name") instead of first, middle and last name; it is split (task 0084).

test.describe("splitFullName", () => {
  test("two words: first and last; three or more: the words between are the middle name", () => {
    expect(splitFullName("Amina Yusuf")).toEqual({ first: "Amina", middle: "", last: "Yusuf" });
    expect(splitFullName("Abdul-Hakeem Abubakr Oladimeji")).toEqual({ first: "Abdul-Hakeem", middle: "Abubakr", last: "Oladimeji" });
    expect(splitFullName("Ada Ngozi Chioma Okafor")).toEqual({ first: "Ada", middle: "Ngozi Chioma", last: "Okafor" });
  });
  test("extra spaces, tabs and non-breaking spaces are collapsed", () => {
    expect(splitFullName("  Amina    Bola\tYusuf ")).toEqual({ first: "Amina", middle: "Bola", last: "Yusuf" });
  });
  test("a name entirely in capitals is turned into ordinary capitals, hyphens and apostrophes included; a mixed-case name is never changed", () => {
    expect(splitFullName("ABASS KHOLID")).toEqual({ first: "Abass", middle: "", last: "Kholid" });
    expect(splitFullName("ABDUL-HAKEEM O'NEIL ABUBAKR")).toEqual({ first: "Abdul-Hakeem", middle: "O'Neil", last: "Abubakr" });
    expect(splitFullName("Amina McDonald")).toEqual({ first: "Amina", middle: "", last: "McDonald" });
    expect(splitFullName("AMINA Yusuf")).toEqual({ first: "AMINA", middle: "", last: "Yusuf" });
  });
  test("one word has no last name (the row is refused for it, nothing is invented); an empty cell is empty", () => {
    expect(splitFullName("Madonna")).toEqual({ first: "Madonna", middle: "", last: "" });
    expect(splitFullName("   ")).toEqual({ first: "", middle: "", last: "" });
  });
});

const fullName = pupilEntity.fullName!;
const map = (table: string[][]) => mapTable(table, pupilEntity.columns, { fullName });

test.describe("a file with one name column", () => {
  for (const header of ["Name", "Full name", "full_name", "FULLNAME", "Pupil name", "Student's name"]) {
    test(`"${header}" is split, and the file needs no First name or Last name column`, () => {
      const out = map([
        [header, "Gender", "Date of birth"],
        ["Abdul Hakeem Oladimeji", "Male", "2014-03-21"],
      ]);
      expect(out.problems).toEqual([]);
      expect(out.warnings).toEqual([]);
      expect(out.rows[0].values).toMatchObject({
        firstName: "Abdul",
        middleName: "Hakeem",
        lastName: "Oladimeji",
        gender: "Male",
        dateOfBirth: "2014-03-21",
      });
      expect(validateRows(pupilEntity, out.rows).verdicts.map((v) => v.status)).toEqual(["ready"]);
    });
  }

  test("separate columns win: a file with First name and Last name AND a Name column keeps its own columns", () => {
    const out = map([
      ["Name", "First name", "Last name", "Gender", "Date of birth"],
      ["Zed Zed Zed", "Amina", "Yusuf", "Female", "2014-03-21"],
    ]);
    expect(out.problems).toEqual([]);
    expect(out.rows[0].values).toMatchObject({ firstName: "Amina", lastName: "Yusuf" });
    expect(out.rows[0].values.middleName).toBeUndefined();
    expect(out.warnings).toEqual(['The column "Name" was ignored: the file has its own first and last name columns.']);
  });

  test("a Name column fills only what the file lacks: with a Middle name column of its own, that is kept", () => {
    const out = map([
      ["Full name", "Middle name", "Gender", "Date of birth"],
      ["Amina Yusuf", "Bola", "Female", "2014-03-21"],
    ]);
    expect(out.rows[0].values).toMatchObject({ firstName: "Amina", middleName: "Bola", lastName: "Yusuf" });
  });

  test("a one-word name is refused for its missing last name; the other required columns (Gender) still have to be there, the date of birth does not", () => {
    const out = map([
      ["Name", "Gender", "Date of birth"],
      ["Madonna", "Female", "2014-03-21"],
    ]);
    const verdict = validateRows(pupilEntity, out.rows).verdicts[0];
    expect(verdict.status).toBe("error");
    // Gender is still required as a column; the date of birth is not (the maintainer, 2026-11-18).
    expect(
      map([
        ["Name", "Date of birth"],
        ["Amina Yusuf", "2014-03-21"],
      ]).problems.map((p) => p.message),
    ).toEqual(['A "Gender" column is missing from the first row.']);
    const noDob = map([
      ["Name", "Gender"],
      ["Amina Yusuf", "Female"],
    ]);
    expect(noDob.problems).toEqual([]);
    expect(validateRows(pupilEntity, noDob.rows).verdicts[0].status).toBe("ready");
  });

  test("without a fullName rule (any other kind) a Name column is just an unrecognised column, as before", () => {
    const out = mapTable(
      [
        ["Name", "Gender", "Date of birth"],
        ["Amina Yusuf", "Female", "2014-03-21"],
      ],
      pupilEntity.columns,
    );
    expect(out.problems.map((p) => p.message).join(" ")).toContain('"First name" column is missing');
    expect(out.warnings).toEqual(['The column "Name" is not recognised and was ignored.']);
  });
});
