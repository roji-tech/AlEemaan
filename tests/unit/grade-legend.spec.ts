import { expect, test } from "@playwright/test";
import { bandRange, legendLine, legendWithRanges } from "@/lib/results/grade-legend";

// The grading line of a printed card (task 0116): highest first, whole-number ranges that do not overlap, the top band closed at its max.

const SENIOR = [
  { min: 0, max: 40, letter: "F9", remark: "Fail" },
  { min: 40, max: 45, letter: "E8", remark: "Pass" },
  { min: 45, max: 50, letter: "D7", remark: "Pass" },
  { min: 50, max: 55, letter: "C6", remark: "Credit" },
  { min: 55, max: 60, letter: "C5", remark: "Credit" },
  { min: 60, max: 65, letter: "C4", remark: "Credit" },
  { min: 65, max: 70, letter: "B3", remark: "Good" },
  { min: 70, max: 75, letter: "B2", remark: "Very good" },
  { min: 75, max: 100, letter: "A1", remark: "Excellent" },
];

test("senior bands print as the school's card does: highest first, inclusive whole ranges, F9 ends at 39", () => {
  expect(legendLine(SENIOR, "ranges")).toBe(
    "A1 (75-100) · B2 (70-74) · B3 (65-69) · C4 (60-64) · C5 (55-59) · C6 (50-54) · D7 (45-49) · E8 (40-44) · F9 (0-39)",
  );
});

test("the order does not depend on how the bands are stored", () => {
  expect(legendLine([...SENIOR].reverse(), "ranges")).toBe(legendLine(SENIOR, "ranges"));
});

test("junior prints names and no marks (its printed card has no ranges)", () => {
  const junior = [
    { min: 0, max: 50, letter: "E", remark: "Fair" },
    { min: 50, max: 60, letter: "C", remark: "Average" },
    { min: 60, max: 70, letter: "B", remark: "Good" },
    { min: 70, max: 100, letter: "A", remark: "Excellent" },
  ];
  expect(legendLine(junior, "names")).toBe("A Excellent · B Good · C Average · E Fair");
});

test("a band with a fractional edge keeps its exact edges", () => {
  expect(bandRange({ min: 0, max: 39.5 }, false)).toBe("0 to below 39.5");
  expect(bandRange({ min: 39.5, max: 100 }, true)).toBe("39.5-100");
  expect(
    legendWithRanges([
      { min: 0, max: 49.5, letter: "F", remark: "Fail" },
      { min: 49.5, max: 100, letter: "P", remark: "Pass" },
    ]).map((r) => r.range),
  ).toEqual(["49.5-100", "0 to below 49.5"]);
});

test("a single band is the top band", () => {
  expect(legendLine([{ min: 0, max: 100, letter: "A", remark: "All" }], "ranges")).toBe("A (0-100)");
});
