import { test, expect } from "@playwright/test";
import { CSV_TEMPLATE, MAX_CSV_ROWS, parseStudentCsv, splitCsv } from "../../src/lib/students/csv";

// The CSV the Students screen sends to students/import: pure text -> rows, with a message per bad line.

test.describe("splitCsv", () => {
  test("quoted cells keep commas, doubled quotes and line breaks; CRLF and a BOM are handled", () => {
    expect(splitCsv('\ufeffa,"b,1","say ""hi"""\r\nx,"two\nlines",z\n')).toEqual([
      ["a", "b,1", 'say "hi"'],
      ["x", "two\nlines", "z"],
    ]);
  });
});

test.describe("parseStudentCsv", () => {
  test("the downloadable template parses to one valid row", () => {
    const parsed = parseStudentCsv(CSV_TEMPLATE);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        firstName: "Amina",
        lastName: "Yusuf",
        gender: "FEMALE",
        dateOfBirth: "2014-03-21",
        className: "JSS 1",
        arm: "A",
        guardianName: "Mr Yusuf",
        guardianPhone: "08030000000",
        guardianEmail: "yusuf@example.com",
      },
    ]);
  });

  test("friendly headers in any order, day-first dates and short genders are understood", () => {
    const parsed = parseStudentCsv("Surname,First Name,Sex,DOB\nYusuf,Amina,f,21/03/2014\nBello,Musa,M,2013-12-01\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows.map((r) => [r.firstName, r.lastName, r.gender, r.dateOfBirth])).toEqual([
      ["Amina", "Yusuf", "FEMALE", "2014-03-21"],
      ["Musa", "Bello", "MALE", "2013-12-01"],
    ]);
    expect(parsed.lineOf).toEqual([2, 3]);
  });

  test("a missing required column stops the import and names the column", () => {
    const parsed = parseStudentCsv("firstName,lastName,gender\nAmina,Yusuf,F\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toEqual([{ line: 1, message: 'A "dateOfBirth" column is missing from the first line.' }]);
  });

  test("bad lines are reported with their line number and the good lines are still kept", () => {
    const parsed = parseStudentCsv(
      "firstName,lastName,gender,dateOfBirth,guardianEmail\nAmina,Yusuf,F,2014-03-21,\nA,Y,X,2014-02-31,not-an-email\n\nMusa,Bello,M,2013-12-01,\n",
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.lineOf).toEqual([2, 5]);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0].line).toBe(3);
    expect(parsed.problems[0].message).toMatch(/first name.*last name.*gender.*date of birth.*email/);
  });

  test("an impossible calendar date (31 February, month 13) is refused, a leap day is accepted", () => {
    const body = (dob: string) => parseStudentCsv(`firstName,lastName,gender,dateOfBirth\nAmina,Yusuf,F,${dob}\n`);
    expect(body("2014-02-31").rows).toHaveLength(0);
    expect(body("2014-13-01").rows).toHaveLength(0);
    expect(body("2012-02-29").rows).toHaveLength(1);
    expect(body("2014-02-29").rows).toHaveLength(0);
  });

  test("an empty file and an over-long file are refused with one message", () => {
    expect(parseStudentCsv("  \n").problems).toEqual([{ line: 1, message: "The file is empty." }]);
    const many = "firstName,lastName,gender,dateOfBirth\n" + "Amina,Yusuf,F,2014-03-21\n".repeat(MAX_CSV_ROWS + 1);
    const parsed = parseStudentCsv(many);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems[0].message).toMatch(/at most 1000/);
  });
});
