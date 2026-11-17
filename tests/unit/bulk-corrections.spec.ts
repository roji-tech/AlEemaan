import { test, expect } from "@playwright/test";
import { applyCorrections } from "@/lib/bulk/corrections";
import type { RowVerdict, SourceRow } from "@/lib/bulk/types";

// "Upload the corrections" while the review is open (task 0084 D4): a corrected row replaces the problem row with its number, and nothing else changes.

const r = (line: number, firstName: string): SourceRow => ({ line, values: { firstName } });
const fix = (originalLine: number | null, firstName: string): SourceRow => ({ line: 2, originalLine, values: { firstName } });
const current = [r(2, "ok"), r(3, "bad"), r(4, "bad2"), r(5, "ok2")];
const verdicts: RowVerdict[] = [
  { line: 2, status: "ready", problems: [] },
  { line: 3, status: "error", problems: [{ message: "x" }] },
  { line: 4, status: "error", problems: [{ message: "x" }] },
  { line: 5, status: "ready", problems: [] },
];

test("a corrected row replaces the problem row with the same row number and keeps that number; everything else is untouched", () => {
  const out = applyCorrections(current, verdicts, [fix(3, "fixed3"), fix(4, "fixed4")]);
  expect(out.next.map((x) => [x.line, x.values.firstName])).toEqual([[2, "ok"], [3, "fixed3"], [4, "fixed4"], [5, "ok2"]]);
  expect([out.replaced, out.refused]).toEqual([2, []]);
});
test("a row with no number, a number that is not in the file, or a row that had no problem is refused with its own sentence and changes nothing", () => {
  const out = applyCorrections(current, verdicts, [fix(null, "a"), fix(99, "b"), fix(2, "c"), fix(3, "d")]);
  expect(out.next.map((x) => x.values.firstName)).toEqual(["ok", "d", "bad2", "ok2"]);
  expect(out.refused.map((x) => x.message)).toEqual([
    expect.stringContaining("no row number"),
    expect.stringContaining("no row 99"),
    expect.stringContaining("had no problem"),
  ]);
  expect(out.replaced).toBe(1);
});
test("the same row number twice: the first is used and the second refused", () => {
  const out = applyCorrections(current, verdicts, [fix(3, "first"), fix(3, "second")]);
  expect(out.next[1].values.firstName).toBe("first");
  expect(out.refused).toEqual([{ line: 3, message: expect.stringContaining("more than once") }]);
});
