import { test, expect } from "@playwright/test";
import {
  daysText,
  dayNumber,
  lengthDays,
  lengthText,
  progressOf,
  segmentsOf,
  termState,
  todayNumber,
  whereWeAre,
  type TermLike,
} from "@/lib/academics/session-progress";
import { actionLook } from "@/components/ui/action-look";

// Task 0105: where a school year stands today, and what an action looks like in a menu. Pure, so the clock is passed in.

const term = (label: string, start: string, end: string, isCurrent = false): TermLike => ({
  label,
  startDate: `${start}T00:00:00.000Z`,
  endDate: `${end}T00:00:00.000Z`,
  isCurrent,
});
const T1 = term("1st Term", "2026-09-13", "2026-12-28", true);
const T2 = term("2nd Term", "2026-12-29", "2027-04-14");
const T3 = term("3rd Term", "2027-04-15", "2027-07-31");
const on = (iso: string) => todayNumber(new Date(`${iso}T12:00:00`)); // the viewer's own midday of that calendar day

test.describe("days, in the numbers the dates are stored in", () => {
  test("a date is its UTC date part; today is the viewer's own calendar day, so the two compare as days", () => {
    expect(dayNumber("2026-11-18T00:00:00.000Z")).toBe(on("2026-11-18"));
    expect(dayNumber("2026-11-19T00:00:00.000Z") - dayNumber("2026-11-18T00:00:00.000Z")).toBe(1);
  });
  test("both ends count: one day long from the 1st to the 1st, 107 days from 13 Sept to 28 Dec", () => {
    expect(lengthDays(term("x", "2026-09-01", "2026-09-01"))).toBe(1);
    expect(lengthDays(T1)).toBe(107);
  });
  test("words: 1 day, 5 days, under two weeks in days, then weeks", () => {
    expect(daysText(1)).toBe("1 day");
    expect(daysText(5)).toBe("5 days");
    expect(lengthText(10)).toBe("10 days");
    expect(lengthText(107)).toBe("15 weeks");
  });
});

test.describe("a term's state", () => {
  test("the administrator's choice is current whatever the dates say", () => {
    expect(termState(T1, on("2027-02-01"))).toBe("current");
  });
  test("otherwise the dates decide: over is ended, anything else is upcoming (its last day is still upcoming)", () => {
    expect(termState(T2, on("2027-04-14"))).toBe("upcoming");
    expect(termState(T2, on("2027-04-15"))).toBe("ended");
    expect(termState(T3, on("2026-09-01"))).toBe("upcoming");
  });
});

test.describe("how far through a term", () => {
  test("day 1 is the first day, never beyond the length, never before it; the share is a fraction", () => {
    expect(progressOf(T1, on("2026-09-13"))).toMatchObject({ day: 1, of: 107, left: 106 });
    expect(progressOf(T1, on("2026-12-28"))).toMatchObject({ day: 107, left: 0, ratio: 1 });
    expect(progressOf(T1, on("2027-02-01"))).toMatchObject({ day: 107, left: 0 }); // past its end: full
    expect(progressOf(T1, on("2026-08-01")).day).toBe(0); // before it begins: nothing done
    expect(progressOf(T1, on("2026-11-18")).ratio).toBeGreaterThan(0.5);
  });
});

test.describe("the bar's segments", () => {
  test("each term starts where it starts in the year and is as wide as it is long, with the gap of a holiday kept", () => {
    const segments = segmentsOf([T1, T2, T3]);
    expect(segments[0]!.x).toBe(0);
    expect(segments[1]!.x).toBeGreaterThan(segments[0]!.x + segments[0]!.width - 1);
    const end = segments[2]!.x + segments[2]!.width;
    expect(end).toBeGreaterThan(99);
    expect(end).toBeLessThanOrEqual(100.0001);
    expect(segments[0]!.width).toBeGreaterThan(segments[2]!.width - 20);
  });
  test("a very short term is still a segment you can see", () => {
    const short = term("Short", "2026-09-13", "2026-09-14");
    expect(segmentsOf([short, T2])[0]!.width).toBeGreaterThanOrEqual(3);
  });
  test("no terms, no segments", () => {
    expect(segmentsOf([])).toEqual([]);
  });
});

test.describe("the one line of where the year is", () => {
  const session = { startDate: T1.startDate, endDate: T3.endDate };
  test("inside the current term: its day, its length, the days left", () => {
    expect(whereWeAre("ACTIVE", [T1, T2, T3], session, on("2026-11-18"))).toBe("1st Term, day 67 of 107, 40 days left.");
  });
  test("the last day says so", () => {
    expect(whereWeAre("ACTIVE", [T1, T2, T3], session, on("2026-12-28"))).toBe("1st Term, day 107 of 107, last day.");
  });
  test("a current term that has ended asks the administrator to move on, and one that has not begun says when it starts", () => {
    expect(whereWeAre("ACTIVE", [T1, T2, T3], session, on("2027-01-05"))).toBe(
      "1st Term has ended; the next term is not set as current yet.",
    );
    expect(whereWeAre("ACTIVE", [T1, T2, T3], session, on("2026-09-01"))).toBe("1st Term starts in 12 days.");
  });
  test("no current term: the next one to come, or that all have ended", () => {
    const none = [{ ...T1, isCurrent: false }, T2, T3];
    expect(whereWeAre("PLANNED", none, session, on("2026-09-01"))).toBe("1st Term starts in 12 days.");
    expect(whereWeAre("ACTIVE", none, session, on("2027-08-05"))).toBe("All terms have ended.");
  });
  test("a closed session says so", () => {
    expect(whereWeAre("CLOSED", [T1, T2, T3], session, on("2026-11-18"))).toBe("This session is closed.");
  });
  test("no terms: when the session starts, or that there are none", () => {
    expect(whereWeAre("PLANNED", [], session, on("2026-09-01"))).toBe("Starts in 12 days.");
    expect(whereWeAre("ACTIVE", [], session, on("2026-10-01"))).toBe("No terms yet.");
  });
});

test.describe("what an action looks like in a menu", () => {
  const tone = (id: string, danger = false) => actionLook({ id, danger }).tone;
  test("Add, Edit, Archive and Remove are told apart by tone", () => {
    expect(tone("arm")).toBe("ok");
    expect(tone("break")).toBe("ok");
    expect(tone("edit")).toBe("info");
    expect(tone("rename")).toBe("info");
    expect(tone("dates")).toBe("info");
    expect(tone("archive")).toBe("warn");
    expect(tone("close")).toBe("warn");
    expect(tone("subjects")).toBe("brand");
    expect(tone("history")).toBe("neutral");
    expect(tone("remove", true)).toBe("danger");
  });
  test("undoing is the colour of the thing undone, not of archive: restore and reactivate are green, deactivate is amber", () => {
    expect(tone("restore")).toBe("ok");
    expect(tone("reactivate")).toBe("ok");
    expect(tone("unarchive")).toBe("ok");
    expect(tone("deactivate")).toBe("warn");
    expect(tone("activate")).toBe("ok");
  });
  test("an action nothing recognises is neutral and has no icon; one that asks for its own look gets it; danger always wins", () => {
    expect(actionLook({ id: "frobnicate" })).toEqual({ tone: "neutral", icon: null });
    expect(actionLook({ id: "frobnicate", tone: "warn", icon: "x" })).toEqual({ tone: "warn", icon: "x" });
    expect(actionLook({ id: "frobnicate", danger: true }).tone).toBe("danger");
    expect(actionLook({ id: "archive", danger: true }).tone).toBe("danger");
  });
});
