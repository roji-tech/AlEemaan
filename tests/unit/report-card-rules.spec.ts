import { test, expect } from "@playwright/test";
import { averageHundredths, percentHundredths, publicName, rankAverages } from "../../src/lib/academics/report-card-rules";

// The arithmetic of a report card (Slice P2c): percentages, the average, positions with ties, and the one thing the public page says about a pupil.

test.describe("percentHundredths", () => {
  test("is exact in hundredths of a percent and rounds half up", () => {
    expect(percentHundredths(65, 100)).toBe(6500);
    expect(percentHundredths(7, 8)).toBe(8750);
    expect(percentHundredths(1, 3)).toBe(3333);
    expect(percentHundredths(2, 3)).toBe(6667);
    expect(percentHundredths(0, 100)).toBe(0);
    expect(percentHundredths(100, 100)).toBe(10000);
    expect(percentHundredths(0.05, 100)).toBe(5);
  });
  test("refuses a maximum that is not positive or numbers that are not finite", () => {
    expect(percentHundredths(5, 0)).toBeNull();
    expect(percentHundredths(5, -1)).toBeNull();
    expect(percentHundredths(Number.NaN, 100)).toBeNull();
    expect(percentHundredths(5, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

test.describe("averageHundredths", () => {
  test("is the mean of the subject PERCENTAGES, so a subject out of 50 weighs the same as one out of 100", () => {
    expect(
      averageHundredths([
        { total: 80, max: 100 },
        { total: 20, max: 50 },
      ]),
    ).toBe(6000); // (80% + 40%) / 2
    expect(averageHundredths([{ total: 65, max: 100 }])).toBe(6500);
  });
  test("rounds half up and has no average for no subjects or an impossible one", () => {
    expect(
      averageHundredths([
        { total: 1, max: 3 },
        { total: 1, max: 3 },
        { total: 2, max: 3 },
      ]),
    ).toBe(4444); // (3333 + 3333 + 6667) / 3 = 4444.33
    expect(averageHundredths([])).toBeNull();
    expect(averageHundredths([{ total: 5, max: 0 }])).toBeNull();
  });
});

test.describe("rankAverages", () => {
  test("ties share a position and the next is skipped (1, 2, 2, 4); size is how many were ranked", () => {
    const ranks = rankAverages([
      { id: "a", average: 9000 },
      { id: "b", average: 8000 },
      { id: "c", average: 8000 },
      { id: "d", average: 5000 },
    ]);
    expect([...ranks].map(([id, r]) => [id, r.position, r.size])).toEqual([
      ["a", 1, 4],
      ["b", 2, 4],
      ["c", 2, 4],
      ["d", 4, 4],
    ]);
  });
  test("a lone student is first of one; everyone tied is first of all", () => {
    expect(rankAverages([{ id: "a", average: 10 }]).get("a")).toEqual({ position: 1, size: 1 });
    expect(
      [
        ...rankAverages([
          { id: "a", average: 5 },
          { id: "b", average: 5 },
        ]).values(),
      ].map((r) => r.position),
    ).toEqual([1, 1]);
  });
});

test.describe("publicName", () => {
  test("first name and the initial of the last name, nothing else", () => {
    expect(publicName("Amina", "Yusuf")).toBe("Amina Y.");
    expect(publicName("  Amina Bola ", " yusuf-Ade ")).toBe("Amina Y.");
    expect(publicName("Amina", "")).toBe("Amina");
    expect(publicName("Zoë", "Émile")).toBe("Zoë É.");
  });
});
