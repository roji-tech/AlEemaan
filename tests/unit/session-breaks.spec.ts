import { expect, test } from "@playwright/test";
import {
  announcementExpiry,
  breakAnnouncement,
  breaksOutside,
  defaultBreakLabel,
  longDay,
  resumeDay,
  validateBreak,
} from "../../src/lib/academics/session-break-rules";

// The break inside a term or semester (task 0098): the rules the form and the server share, and the words of the announcement.
const TERM = { startDate: "2026-09-01", endDate: "2026-12-15" };
const input = (startDate: string, endDate: string, label = "Mid-term break") => ({ label, startDate, endDate });
const at = (problems: ReturnType<typeof validateBreak>, path: string) => problems.find((p) => p.path === path)?.message;

test.describe("a break must be valid", () => {
  test("a break inside the term is fine, a one-day break too, and so are its first and last day of the term", () => {
    expect(validateBreak(TERM, [], input("2026-10-26", "2026-10-30"))).toEqual([]);
    expect(validateBreak(TERM, [], input("2026-10-26", "2026-10-26"))).toEqual([]);
    expect(validateBreak(TERM, [], input("2026-09-01", "2026-12-15"))).toEqual([]);
  });

  test("the name needs 2 to 60 characters; the days must be real", () => {
    expect(at(validateBreak(TERM, [], input("2026-10-26", "2026-10-30", " ")), "label")).toMatch(/Name the break/);
    expect(at(validateBreak(TERM, [], input("2026-10-26", "2026-10-30", "x".repeat(61))), "label")).toMatch(/Name the break/);
    expect(at(validateBreak(TERM, [], input("", "2026-10-30")), "startDate")).toBe("Choose the first day of the break.");
    expect(at(validateBreak(TERM, [], input("2026-10-26", "2026-02-30")), "endDate")).toBe("Choose the last day of the break.");
  });

  test("the last day cannot be before the first", () => {
    expect(at(validateBreak(TERM, [], input("2026-10-30", "2026-10-26")), "endDate")).toBe(
      "The last day of the break cannot be before its first day.",
    );
  });

  test("it must sit inside the term: before it, after it, or running past its end is refused, saying which days the term has", () => {
    expect(at(validateBreak(TERM, [], input("2026-08-25", "2026-09-04"), "the 1st Term"), "startDate")).toBe(
      "The break must sit inside the 1st Term (2026-09-01 to 2026-12-15).",
    );
    expect(at(validateBreak(TERM, [], input("2026-12-20", "2026-12-22")), "startDate")).toMatch(/must sit inside/);
    expect(at(validateBreak(TERM, [], input("2026-12-10", "2026-12-18")), "endDate")).toMatch(/must sit inside/);
  });

  test("it must not overlap another break of the term, the touching day counts; a break next to it, with a day between, is fine", () => {
    const others = [{ label: "Long weekend", startDate: "2026-10-26", endDate: "2026-10-28" }];
    expect(at(validateBreak(TERM, others, input("2026-10-28", "2026-10-30")), "startDate")).toBe(
      "It overlaps Long weekend (2026-10-26 to 2026-10-28).",
    );
    expect(at(validateBreak(TERM, others, input("2026-10-20", "2026-10-26")), "startDate")).toMatch(/overlaps Long weekend/);
    expect(at(validateBreak(TERM, others, input("2026-10-20", "2026-11-05")), "startDate")).toMatch(/overlaps Long weekend/); // one that holds the other
    expect(validateBreak(TERM, others, input("2026-10-29", "2026-10-30"))).toEqual([]);
    expect(validateBreak(TERM, others, input("2026-10-20", "2026-10-25"))).toEqual([]);
  });
});

test("changing a term's days: the breaks that would be left outside are found", () => {
  const breaks = [
    { label: "Mid-term break", startDate: "2026-10-26", endDate: "2026-10-30" },
    { label: "Early", startDate: "2026-09-02", endDate: "2026-09-03" },
  ];
  expect(breaksOutside({ startDate: "2026-09-01", endDate: "2026-12-15" }, breaks)).toEqual([]);
  expect(breaksOutside({ startDate: "2026-09-10", endDate: "2026-12-15" }, breaks).map((b) => b.label)).toEqual(["Early"]);
  expect(breaksOutside({ startDate: "2026-09-01", endDate: "2026-10-28" }, breaks).map((b) => b.label)).toEqual(["Mid-term break"]);
});

test.describe("the announcement", () => {
  test("classes resume the day after, or the Monday when that is a weekend", () => {
    expect(resumeDay("2026-10-29")).toBe("2026-10-30"); // Thursday -> Friday
    expect(resumeDay("2026-10-30")).toBe("2026-11-02"); // Friday -> Monday
    expect(resumeDay("2026-10-31")).toBe("2026-11-02"); // Saturday -> Monday
  });

  test("days read in full, in UTC (no time zone moves one)", () => {
    expect(longDay("2026-10-26")).toBe("Monday 26 October 2026");
    expect(longDay("2027-01-01")).toBe("Friday 1 January 2027");
  });

  test("the draft names the break, its days, the term, the session and when classes resume", () => {
    const base = { label: "Mid-term break", periodLabel: "1st Term", sessionLabel: "2026/2027", branchName: "Secondary (English)" };
    const week = breakAnnouncement({ ...base, startDate: "2026-10-26", endDate: "2026-10-30" });
    expect(week.title).toBe("Mid-term break: Monday 26 October 2026 to Friday 30 October 2026");
    expect(week.body).toBe(
      "Secondary (English) will have no classes from Monday 26 October 2026 to Friday 30 October 2026 for the mid-term break in the 1st Term of 2026/2027. Classes resume on Monday 2 November 2026.",
    );
    const one = breakAnnouncement({ ...base, startDate: "2026-10-26", endDate: "2026-10-26" });
    expect(one.title).toBe("Mid-term break: Monday 26 October 2026");
    expect(one.body).toContain("no classes on Monday 26 October 2026");
    expect(one.title.length).toBeLessThanOrEqual(200);
  });

  test("it stops showing at the end of the day classes resume; the usual name follows the kind", () => {
    expect(announcementExpiry("2026-10-30")).toBe("2026-11-02T23:59:59.000Z");
    expect([defaultBreakLabel("TERM"), defaultBreakLabel("SEMESTER")]).toEqual(["Mid-term break", "Mid-semester break"]);
  });
});
