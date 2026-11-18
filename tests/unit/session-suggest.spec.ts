import { test, expect } from "@playwright/test";
import { defaultTermCount, schoolYearStarting, sessionLabel, suggestSession } from "../../src/lib/academics/session-suggest";

// What the New session form suggests (task 0093): the next school year that does not exist yet, 1 September to 31 July.
test.describe("session suggestion", () => {
  test("the label of a school year", () => {
    expect(sessionLabel(2026)).toBe("2026/2027");
  });

  test("August onwards belongs to the year that starts in September; January to July to the one before", () => {
    expect(schoolYearStarting(new Date("2026-11-18T10:00:00Z"))).toBe(2026);
    expect(schoolYearStarting(new Date("2026-08-01T00:00:00Z"))).toBe(2026);
    expect(schoolYearStarting(new Date("2026-07-31T23:59:59Z"))).toBe(2025);
    expect(schoolYearStarting(new Date("2027-01-01T00:00:00Z"))).toBe(2026);
  });

  test("the suggestion for today, with its dates", () => {
    expect(suggestSession(new Date("2026-11-18T10:00:00Z"), [])).toEqual({
      label: "2026/2027",
      startDate: "2026-09-01",
      endDate: "2027-07-31",
    });
  });

  test("a year that already exists is skipped, in order", () => {
    const today = new Date("2026-11-18T10:00:00Z");
    expect(suggestSession(today, ["2026/2027"]).label).toBe("2027/2028");
    expect(suggestSession(today, ["2026/2027", " 2027/2028 "]).label).toBe("2028/2029");
    expect(suggestSession(today, ["2025/2026"]).label).toBe("2026/2027"); // an earlier year does not matter
  });

  test("it always ends: with ten years taken it gives the eleventh, which the server will refuse if it exists", () => {
    const taken = Array.from({ length: 10 }, (_, i) => sessionLabel(2026 + i));
    expect(suggestSession(new Date("2026-11-18T10:00:00Z"), taken).label).toBe("2036/2037");
  });

  test("two terms in an Arabic branch, three elsewhere", () => {
    expect(defaultTermCount("Secondary (Arabic)")).toBe(2);
    expect(defaultTermCount("Primary (English)")).toBe(3);
  });
});
