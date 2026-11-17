import { test, expect } from "@playwright/test";
import { neutralise, problemRowsTable, toCsv } from "@/lib/bulk/export";
import { splitCsv } from "@/lib/bulk/csv";
import { restoreCell } from "@/lib/bulk/export";
import { staffColumns } from "@/lib/bulk/staff";
import type { RowVerdict, SourceRow } from "@/lib/bulk/types";

test("a cell that Excel would run as a formula is written with a leading apostrophe; a plain number or phone starting with + or - is left alone", () => {
  for (const bad of ["=1+1", "@SUM(A1)", "+cmd|' /C calc'!A0", "-2+3+cmd", "\tx", "\rx"]) expect(neutralise(bad), bad).toBe(`'${bad}`);
  for (const fine of ["+2348031234567", "-5", "08031234567", "Amina", "", "a=b", "(0803) 123-4567"])
    expect(neutralise(fine), fine).toBe(fine);
});
test("restoreCell undoes exactly what neutralise did, so a downloaded file uploads back unchanged", () => {
  for (const cell of ["=1+1", "@x", "+cmd|x", "Amina", "'quoted"]) expect(restoreCell(neutralise(cell))).toBe(cell);
});
test("toCsv: a BOM, CRLF line ends, quotes around commas, quotes and line breaks, and it reads back with splitCsv", () => {
  const csv = toCsv(
    ["a", "b"],
    [
      ["x, y", 'say "hi"'],
      ["two\nlines", "=1+1"],
    ],
  );
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv.includes("\r\n")).toBe(true);
  expect(splitCsv(csv)).toEqual([
    ["a", "b"],
    ["x, y", 'say "hi"'],
    ["two\nlines", "'=1+1"],
  ]);
});

const rows: SourceRow[] = [
  { line: 2, values: { category: "Teaching", firstName: "A", lastName: "B" } },
  { line: 3, values: { category: "Principal", firstName: "C", lastName: "D", email: "nope" } },
  { line: 5, values: { category: "T", firstName: "", lastName: "F" } },
];
const verdicts: RowVerdict[] = [
  { line: 2, status: "ready", problems: [] },
  {
    line: 3,
    status: "error",
    problems: [
      { column: "category", message: "Choose Teaching or Non-teaching." },
      { column: "email", message: "That does not look like an email address." },
    ],
  },
  { line: 5, status: "error", problems: [{ column: "firstName", message: "Give a name." }] },
];
test("the problem rows table holds only the rows with problems, their original row numbers first and the problems last, in the template's columns", () => {
  const t = problemRowsTable(staffColumns, rows, verdicts);
  expect(t.headers).toEqual(["Row", "Category", "First name", "Last name", "Phone", "Email", "Problem"]);
  expect(t.rows).toEqual([
    ["3", "Principal", "C", "D", "", "nope", "Category: Choose Teaching or Non-teaching. Email: That does not look like an email address."],
    ["5", "T", "", "F", "", "", "First name: Give a name."],
  ]);
});
