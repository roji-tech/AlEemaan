import { test, expect } from "@playwright/test";
import { validateRows } from "@/lib/bulk/validate";
import { mapTable } from "@/lib/bulk/table";
import { classEntity } from "@/lib/bulk/classes";
import { subjectEntity } from "@/lib/bulk/subjects";
import { listItems, repeatedItems } from "@/lib/bulk/fields";
import type { SourceRow } from "@/lib/bulk/types";

// The class and subject kinds of the bulk entry (task 0084, requested 2026-11-17): the SAME name and code rules as the single forms, a class's arms and subjects in one cell each.

const subj = (values: Record<string, string>, line = 2): SourceRow => ({ line, values: { name: "Mathematics", code: "", ...values } });
const cls = (values: Record<string, string>, line = 2): SourceRow => ({
  line,
  values: { name: "JSS 1", arms: "", subjects: "", ...values },
});

test("a list cell: commas, semicolons, bars and new lines separate; blanks go; a repeat is found without regard to capitals", () => {
  expect(listItems(" A, B ;C|D\nE ,, ")).toEqual(["A", "B", "C", "D", "E"]);
  expect(listItems("")).toEqual([]);
  expect(listItems(7)).toBe(7);
  expect(repeatedItems(["A", "B", "a", "C", "b"])).toEqual(["a", "b"]);
  expect(repeatedItems(["A", "B"])).toEqual([]);
});

const SUBJECT_SAMPLES: Record<string, { pass: string[]; fail: string[] }> = {
  name: { pass: ["Mathematics", "A", "x".repeat(60)], fail: ["", "   ", "x".repeat(61)] },
  code: { pass: ["", "MTH", "mth-1", "A.B_C", "x".repeat(12)], fail: ["x".repeat(13), "bad code", "a/b", "é"] },
};
test("subjects: every column has samples; each passing value passes and each failing value is a problem on that column alone", () => {
  expect(Object.keys(SUBJECT_SAMPLES).sort()).toEqual(subjectEntity.columns.map((c) => c.key).sort());
  for (const [column, { pass, fail }] of Object.entries(SUBJECT_SAMPLES)) {
    for (const value of pass)
      expect(validateRows(subjectEntity, [subj({ [column]: value })]).verdicts[0].status, `${column}=${JSON.stringify(value)}`).toBe(
        "ready",
      );
    for (const value of fail) {
      const v = validateRows(subjectEntity, [subj({ [column]: value })]).verdicts[0];
      expect([v.status, v.problems.map((p) => p.column)], `${column}=${JSON.stringify(value)}`).toEqual(["error", [column]]);
    }
  }
});

test("subjects: a code is upper-cased, an empty code is no code, and a repeat of the name (any capitals) or the code in the file is refused naming the first row", () => {
  const out = validateRows(subjectEntity, [
    subj({ name: "Mathematics", code: "mth" }),
    subj({ name: "MATHEMATICS", code: "" }, 3),
    subj({ name: "Maths", code: "MTH" }, 4),
    subj({ name: "English" }, 5),
  ]);
  expect(out.ok[0].row).toEqual({ name: "Mathematics", code: "MTH" });
  expect(out.ok.at(-1)?.row).toEqual({ name: "English" });
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "error", "error", "ready"]);
  expect(out.verdicts[1].problems).toEqual([{ column: "name", message: "Repeats row 2." }]);
  expect(out.verdicts[2].problems).toEqual([{ column: "code", message: "Repeats row 2." }]);
});

test("classes: only the class is required; arms and subjects may be empty or missing and come out as empty lists", () => {
  const out = validateRows(classEntity, [cls({}), { line: 3, values: { name: "JSS 2" } }]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "ready"]);
  expect(out.ok.map((o) => o.row)).toEqual([
    { name: "JSS 1", arms: [], subjects: [] },
    { name: "JSS 2", arms: [], subjects: [] },
  ]);
});

test("classes: arms and subjects are read as lists and come out trimmed and in order", () => {
  const out = validateRows(classEntity, [cls({ name: " JSS 1 ", arms: "A, B ; C", subjects: "Mathematics|English\nBasic Science" })]);
  expect(out.ok[0].row).toEqual({ name: "JSS 1", arms: ["A", "B", "C"], subjects: ["Mathematics", "English", "Basic Science"] });
});

test("classes: each rule refuses on its own column, in words", () => {
  const bad = (values: Record<string, string>) => validateRows(classEntity, [cls(values)]).verdicts[0];
  expect(bad({ name: "" }).problems).toEqual([{ column: "name", message: "Give a name." }]);
  expect(bad({ name: "x".repeat(61) }).problems).toEqual([{ column: "name", message: "Use at most 60 characters." }]);
  expect(bad({ arms: "A, B, a" }).problems).toEqual([{ column: "arms", message: "a is written twice in the arms." }]);
  expect(bad({ arms: `A, ${"x".repeat(61)}` }).problems).toEqual([{ column: "arms", message: "Use at most 60 characters." }]);
  expect(bad({ arms: Array.from({ length: 31 }, (_, i) => `A${i}`).join(",") }).problems).toEqual([
    { column: "arms", message: "Use at most 30." },
  ]);
  expect(bad({ subjects: "Maths; maths" }).problems).toEqual([{ column: "subjects", message: "maths is written twice in the subjects." }]);
  expect(bad({ subjects: Array.from({ length: 101 }, (_, i) => `S${i}`).join(",") }).problems).toEqual([
    { column: "subjects", message: "Use at most 100." },
  ]);
});

test("classes: the same class twice in the file (any capitals) is refused on the second", () => {
  const out = validateRows(classEntity, [cls({ name: "JSS 1" }), cls({ name: "jss 1" }, 3)]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "error"]);
  expect(out.verdicts[1].problems).toEqual([{ column: "name", message: "Repeats row 2." }]);
});

test("a header is found under its own name or a usual alias, in either order, and the optional columns may be missing", () => {
  const classes = mapTable(
    [
      ["Class Name", "Subjects", "Arms"],
      ["JSS 1", "Maths", "A,B"],
    ],
    classEntity.columns,
  );
  expect(classes.problems).toEqual([]);
  expect(classes.rows[0].values).toEqual({ name: "JSS 1", subjects: "Maths", arms: "A,B" });
  expect(mapTable([["Class"], ["JSS 1"]], classEntity.columns).problems).toEqual([]);
  const subjects = mapTable(
    [
      ["Subject Name", "Short"],
      ["Maths", "MTH"],
    ],
    subjectEntity.columns,
  );
  expect(subjects.rows[0].values).toEqual({ name: "Maths", code: "MTH" });
  expect(mapTable([["Code"], ["MTH"]], subjectEntity.columns).problems.length).toBeGreaterThan(0); // the required column is missing
});
