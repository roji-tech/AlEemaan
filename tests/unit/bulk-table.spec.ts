import { test, expect } from "@playwright/test";
import { splitCsv } from "@/lib/bulk/csv";
import { mapTable } from "@/lib/bulk/table";
import { staffColumns } from "@/lib/bulk/staff";

// The bulk-entry engine (task 0084): text to cells, and cells to rows with the spreadsheet's own row numbers. No database, no browser.

test.describe("splitCsv", () => {
  test("quotes may hold commas, doubled quotes and line breaks; CRLF, a BOM and a missing final newline are fine", () => {
    expect(splitCsv('a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
    expect(splitCsv("﻿a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  test("an empty file is no rows, and a blank line stays a row of one empty cell (the caller decides)", () => {
    expect(splitCsv("")).toEqual([]);
    expect(splitCsv("a\n\nb")).toEqual([["a"], [""], ["b"]]);
  });
});

const HEADER = ["First name", "Surname", "Category", "Phone number", "Email address"];
test.describe("mapTable", () => {
  test("headers match by key, label or alias, ignoring case, spaces and punctuation; row numbers are the spreadsheet's (header = 1; blank rows keep the count)", () => {
    const t = mapTable([HEADER, ["Amina", "Yusuf", "Teaching", "08030000000", "a@x.com"], ["", "", "", "", ""], ["Bala", "Musa", "NT", "", ""]], staffColumns);
    expect(t.problems).toEqual([]);
    expect(t.rows.map((r) => r.line)).toEqual([2, 4]);
    expect(t.rows[0].values).toEqual({ firstName: "Amina", lastName: "Yusuf", category: "Teaching", phone: "08030000000", email: "a@x.com" });
    expect(mapTable([["first_name", "LAST NAME", "category"], ["A", "B", "T"]], staffColumns).problems).toEqual([]);
  });
  test("a required column that is missing is a problem; an optional one may be missing altogether", () => {
    const missing = mapTable([["First name", "Category"], ["A", "T"]], staffColumns);
    expect(missing.problems.map((p) => p.message)).toEqual([expect.stringContaining("Last name")]);
    expect(missing.rows).toEqual([]);
    expect(mapTable([["First name", "Last name", "Category"], ["A", "B", "T"]], staffColumns).problems).toEqual([]);
  });
  test("an unrecognised column is named as ignored (a typo must not lose a column silently); problem, row and # are not", () => {
    const t = mapTable([["First name", "Last name", "Category", "Emial", "Problem", "#"], ["A", "B", "T", "a@x.com", "", "1"]], staffColumns);
    expect(t.warnings).toEqual([expect.stringContaining("Emial")]);
    expect(t.rows[0].values.email).toBeUndefined();
  });
  test("two columns that mean the same field are a problem", () => {
    const t = mapTable([["First name", "Given name", "Last name", "Category"], ["A", "A", "B", "T"]], staffColumns);
    expect(t.problems.map((p) => p.message)).toEqual([expect.stringContaining("twice")]);
  });
  test("an empty file, and more rows than allowed, are problems and give no rows", () => {
    expect(mapTable([], staffColumns).problems).toEqual([{ line: 1, message: "The file is empty." }]);
    const many = [HEADER.slice(0, 3), ...Array.from({ length: 4 }, () => ["A", "B", "T"])];
    const t = mapTable(many, staffColumns, { maxRows: 3 });
    expect(t.rows).toEqual([]);
    expect(t.problems[0].message).toContain("at most 3");
  });
  test("cells beyond the header (an unquoted comma shifted them) mark the row; a leading apostrophe added by a safe export is removed", () => {
    const t = mapTable([["First name", "Last name", "Category"], ["A", "B", "T", "extra"], ["'=cmd", "B", "T"]], staffColumns);
    expect(t.rows[0].overflow).toBe(true);
    expect(t.rows[1].overflow).toBeUndefined();
    expect(t.rows[1].values.firstName).toBe("=cmd");
  });
  test("with the row column allowed, each row carries the original row number it corrects; without it the column is just unrecognised", () => {
    const table = [["Row", "First name", "Last name", "Category"], ["7", "A", "B", "T"], ["", "C", "D", "T"], ["x", "E", "F", "T"]];
    const t = mapTable(table, staffColumns, { allowRowColumn: true });
    expect(t.rows.map((r) => r.originalLine)).toEqual([7, null, null]);
    expect(t.warnings).toEqual([]);
    expect(mapTable(table, staffColumns).warnings).toEqual([expect.stringContaining("Row")]);
  });
});
