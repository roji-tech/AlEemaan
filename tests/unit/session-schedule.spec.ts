import { expect, test } from "@playwright/test";
import {
  COUNTS,
  addDays,
  defaultSchedule,
  isDay,
  kindNoun,
  periodLabel,
  usualCount,
  validateSchedule,
} from "../../src/lib/academics/session-schedule";

// The dates of a session and its terms or semesters (task 0097): the rules the form, the Edit dates dialog and the server share.
const SESSION = { startDate: "2026-09-01", endDate: "2027-07-31" };

test.describe("session schedule", () => {
  test("terms are 2 or 3, semesters are 2; names read '1st Term', '2nd Semester'", () => {
    expect(COUNTS.TERM).toEqual([2, 3]);
    expect(COUNTS.SEMESTER).toEqual([2]);
    expect([1, 2, 3, 4].map((n) => periodLabel("TERM", n))).toEqual(["1st Term", "2nd Term", "3rd Term", "4th Term"]);
    expect([1, 2].map((n) => periodLabel("SEMESTER", n))).toEqual(["1st Semester", "2nd Semester"]);
    expect([kindNoun("TERM"), kindNoun("SEMESTER", true)]).toEqual(["term", "semesters"]);
  });

  test("the usual count is 2 for an Arabic branch and 3 elsewhere", () => {
    expect([usualCount("Secondary (Arabic)"), usualCount("Primary (English)")]).toEqual([2, 3]);
  });

  test("real calendar days only", () => {
    for (const ok of ["2026-09-01", "2028-02-29", "1999-12-31"]) expect(isDay(ok), ok).toBe(true);
    for (const bad of ["2027-02-29", "2026-13-01", "2026-9-1", "2026-09-01T10:00", "", "tomorrow", 20260901, null, undefined])
      expect(isDay(bad), String(bad)).toBe(false);
  });

  test("addDays crosses months, years and leap days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  test("the default split shares the days equally and ends with the session", () => {
    const three = defaultSchedule(SESSION.startDate, SESSION.endDate, 3);
    expect(three).toHaveLength(3);
    expect(three[0].startDate).toBe("2026-09-01");
    expect(three[2].endDate).toBe("2027-07-31");
    expect(validateSchedule(SESSION, three)).toEqual([]); // the suggestion is always valid
    const two = defaultSchedule(SESSION.startDate, SESSION.endDate, 2);
    expect(two[1].endDate).toBe("2027-07-31");
    expect(validateSchedule(SESSION, two)).toEqual([]);
    for (let i = 1; i < three.length; i++) expect(addDays(three[i - 1].endDate, 1)).toBe(three[i].startDate); // back to back
  });

  test("the default split is valid for any sensible session, 2 to 4 periods", () => {
    for (const [s, e] of [
      ["2026-09-01", "2027-07-31"],
      ["2026-01-05", "2026-12-18"],
      ["2027-02-01", "2028-02-29"],
      ["2026-09-14", "2027-07-02"],
    ]) {
      for (const n of [2, 3, 4])
        expect(validateSchedule({ startDate: s, endDate: e }, defaultSchedule(s, e, n)), `${s} ${e} ${n}`).toEqual([]);
    }
  });

  test("no default for dates that are not days", () => {
    expect(defaultSchedule("nope", SESSION.endDate, 3)).toEqual([]);
    expect(defaultSchedule(SESSION.startDate, SESSION.endDate, 0)).toEqual([]);
  });

  test("a gap between two periods is fine (a holiday)", () => {
    const periods = [
      { startDate: "2026-09-08", endDate: "2026-12-18" },
      { startDate: "2027-01-11", endDate: "2027-04-02" },
      { startDate: "2027-04-26", endDate: "2027-07-23" },
    ];
    expect(validateSchedule(SESSION, periods)).toEqual([]);
  });

  test("an overlap, a period that ends before it starts, and one outside the session are each named on their field", () => {
    const names = ["1st Term", "2nd Term", "3rd Term"];
    const overlap = validateSchedule(
      SESSION,
      [
        { startDate: "2026-09-01", endDate: "2026-12-20" },
        { startDate: "2026-12-20", endDate: "2027-03-31" },
      ],
      names,
    );
    expect(overlap).toEqual([{ path: "periods.1.startDate", message: "2nd Term must start after 1st Term ends." }]);
    const backwards = validateSchedule(SESSION, [{ startDate: "2026-10-01", endDate: "2026-10-01" }], names);
    expect(backwards.map((p) => p.path)).toEqual(["periods.0.endDate"]);
    const outside = validateSchedule(
      SESSION,
      [
        { startDate: "2026-08-15", endDate: "2026-12-18" },
        { startDate: "2027-01-10", endDate: "2027-08-15" },
      ],
      names,
    );
    expect(outside.map((p) => p.path)).toEqual(["periods.0.startDate", "periods.1.startDate"]);
    expect(outside[0].message).toContain("inside the session's dates");
  });

  test("a session that ends before it starts, and a day that is not a day, are named", () => {
    expect(
      validateSchedule({ startDate: "2027-07-31", endDate: "2026-09-01" }, defaultSchedule("2026-09-01", "2027-07-31", 3)).map(
        (p) => p.path,
      ),
    ).toContain("session.endDate");
    expect(validateSchedule({ startDate: "", endDate: "2027-07-31" }, []).map((p) => p.path)).toEqual(["session.startDate", "periods"]);
    expect(validateSchedule(SESSION, [{ startDate: "2027-02-30", endDate: "2027-03-30" }]).map((p) => p.path)).toEqual([
      "periods.0.startDate",
    ]);
  });

  test("between one and four periods", () => {
    expect(validateSchedule(SESSION, []).map((p) => p.path)).toEqual(["periods"]);
    const five = defaultSchedule(SESSION.startDate, SESSION.endDate, 5);
    expect(validateSchedule(SESSION, five).map((p) => p.path)).toContain("periods");
  });
});
