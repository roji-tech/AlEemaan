import { test, expect } from "@playwright/test";
import { validateRows } from "@/lib/bulk/validate";
import { feeEntity, feeEntityFor, feeTotals, parseAmount, MAX_NAIRA } from "@/lib/bulk/fees";
import type { SourceRow } from "@/lib/bulk/types";

// The fee kind of the bulk entry (task 0084). Money: exact, from text to whole kobo and back, never through a floating point sum.

test("amounts: digits with optional thousands commas, a naira sign or NGN, at most two decimals", () => {
  const ok = (raw: string) => {
    const r = parseAmount(raw);
    return r.ok ? [r.kobo, r.text] : r.message;
  };
  expect(ok("150000")).toEqual([15000000, "150000.00"]);
  expect(ok("150,000")).toEqual([15000000, "150000.00"]);
  expect(ok("150000.50")).toEqual([15000050, "150000.50"]);
  expect(ok("₦1,500.5")).toEqual([150050, "1500.50"]);
  expect(ok("NGN 1500")).toEqual([150000, "1500.00"]);
  expect(ok("n20")).toEqual([2000, "20.00"]);
  expect(ok("0.07")).toEqual([7, "0.07"]);
  expect(ok("1500.")).toEqual([150000, "1500.00"]);
  expect(ok(`${MAX_NAIRA.toLocaleString("en")}`)).toEqual([MAX_NAIRA * 100, `${MAX_NAIRA}.00`]);
});
test("amounts that are refused each say why", () => {
  const why = (raw: string) => {
    const r = parseAmount(raw);
    return r.ok ? "OK" : r.message;
  };
  expect(why("")).toBe("Enter the amount.");
  for (const bad of ["abc", "-5", "1e5", ".5", "1,50", "15,0000", "1 500", "12a"])
    expect(why(bad), bad).toBe("Use digits, like 150000, 150,000 or 150000.50.");
  expect(why("12.345")).toBe("Use at most two decimals.");
  for (const zero of ["0", "0.00", "₦0"]) expect(why(zero), zero).toBe("The amount must be above zero.");
  expect(why("100,000,000.01")).toContain("more than ₦100,000,000");
  expect(why("999999999999")).toContain("more than");
});
test("a sum of cents never drifts: 0.1 + 0.2 kobo is exactly 0.30", () => {
  const sum = ["0.10", "0.20"].map((v) => parseAmount(v)).reduce((n, r) => n + (r.ok ? r.kobo : 0), 0);
  expect(sum).toBe(30);
});

const row = (values: Record<string, string>, line = 2): SourceRow => ({
  line,
  values: { period: "1st Term (2026/2027)", classGroup: "JSS 1", name: "Tuition", amount: "150,000", ...values },
});
const one = (values: Record<string, string>) => validateRows(feeEntity, [row(values)]);

const SAMPLES: Record<string, { pass: string[]; fail: string[] }> = {
  period: { pass: ["1st Term (2026/2027)", "2nd Term"], fail: ["", "   ", "x".repeat(101)] },
  classGroup: { pass: ["", "JSS 1"], fail: ["x".repeat(101)] },
  name: { pass: ["Tuition", "PE"], fail: ["", "A", "x".repeat(101)] },
  amount: { pass: ["1", "150,000", "₦150000.50", "100,000,000"], fail: ["", "0", "abc", "12.345", "-1", "100,000,000.01"] },
  // Task 0122: who a line is charged to and how it behaves. Blank is "everyone" / the default; a word the rules do not know is a problem on that cell, never read as "everyone".
  admission: { pass: ["", "New", "returning", "ALL"], fail: ["sometimes", "newish"] },
  gender: { pass: ["", "Male", "female", "girls"], fail: ["other", "x"] },
  residence: { pass: ["", "Day", "Boarding", "boarders"], fail: ["weekly"] },
  optional: { pass: ["", "Yes", "no", "TRUE"], fail: ["maybe"] },
  trackHandover: { pass: ["", "Yes", "No"], fail: ["sometimes"] },
  scholarshipCovers: { pass: ["", "Yes", "No"], fail: ["half"] },
  // Task 0124: with an empty Period (the test sets one), how often is every term or once a year; an unknown word is a problem on that cell.
  howOften: { pass: ["Every term", "once a year", "Annually"], fail: ["sometimes"] },
};
test("every column has samples; each passing value passes and each failing value is a problem on that column alone", () => {
  expect(Object.keys(SAMPLES).sort()).toEqual(feeEntity.columns.map((c) => c.key).sort());
  for (const [column, { pass, fail }] of Object.entries(SAMPLES)) {
    // How often goes with an empty Period (task 0124): a line is for one term or it recurs, never both.
    const base: Record<string, string> = column === "howOften" ? { period: "" } : {};
    for (const value of pass)
      expect(one({ ...base, [column]: value }).verdicts[0].status, `${column}=${JSON.stringify(value)}`).toBe("ready");
    for (const value of fail) {
      const v = one({ ...base, [column]: value }).verdicts[0];
      expect([v.status, v.problems.map((p) => p.column)], `${column}=${JSON.stringify(value)}`).toEqual(["error", [column]]);
    }
  }
});

test("a row comes out with the amount as exact text; the class may be empty (every class)", () => {
  expect(one({ amount: "₦1,500.5", classGroup: "" }).ok[0].row).toEqual({
    period: "1st Term (2026/2027)",
    name: "Tuition",
    amount: "1500.50",
    // A file that says nothing about who pays or how the line behaves: for every pupil, not optional, not handed over, a scholarship covers it.
    optional: false,
    trackHandover: false,
    scholarshipCovers: true,
  });
});

test("who a line is charged to is read from its cells; the boys' and the girls' uniform are two lines, the same one twice is refused", () => {
  const out = validateRows(feeEntity, [
    row(
      {
        name: "Uniform",
        amount: "26000",
        admission: "New",
        gender: "Male",
        optional: "Yes",
        trackHandover: "Yes",
        scholarshipCovers: "No",
      },
      2,
    ),
    row(
      {
        name: "Uniform",
        amount: "30000",
        admission: "New",
        gender: "Female",
        optional: "Yes",
        trackHandover: "Yes",
        scholarshipCovers: "No",
      },
      3,
    ),
    row({ name: "Uniform", amount: "30000", admission: "New", gender: "Female" }, 4),
  ]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "ready", "error"]);
  expect(out.verdicts[2].problems[0].message).toBe("Same period, class, fee item and pupils as row 3.");
  expect(out.ok[0].row).toMatchObject({ admission: "NEW", gender: "MALE", optional: true, trackHandover: true, scholarshipCovers: false });
  expect(out.ok[1].row).toMatchObject({ admission: "NEW", gender: "FEMALE" });
});

test("a fee line repeated inside the file (same period, class and name, any capitals) is a problem on the later row; another class or another period is not", () => {
  const out = validateRows(feeEntity, [
    row({}, 2),
    row({ name: "TUITION", amount: "1" }, 3),
    row({ classGroup: "JSS 2" }, 4),
    row({ period: "2nd Term" }, 5),
    row({ classGroup: "" }, 6),
    row({ classGroup: "" }, 7),
  ]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "error", "ready", "ready", "ready", "error"]);
  expect(out.verdicts[1].problems).toEqual([{ column: "name", message: "Same period, class, fee item and pupils as row 2." }]);
  expect(out.verdicts[5].problems[0].message).toBe("Same period, class, fee item and pupils as row 6.");
});

test("the review's totals add up per period and class in whole kobo; an empty class is every class; rows that do not parse are left out", () => {
  const t = feeTotals([
    row({ amount: "150,000" }),
    row({ amount: "50000.50", name: "Books" }),
    row({ classGroup: "", amount: "1000" }),
    row({ amount: "nope" }),
    row({ period: "2nd Term", amount: "10" }),
  ]);
  expect(t).toEqual([
    { period: "1st Term (2026/2027)", classGroup: "JSS 1", kobo: 20000050, lines: 2 },
    { period: "1st Term (2026/2027)", classGroup: "Every class", kobo: 100000, lines: 1 },
    { period: "2nd Term", classGroup: "JSS 1", kobo: 1000, lines: 1 },
  ]);
});

test("the branch's periods and classes become dropdowns, and every dropdown label is accepted by the rules", () => {
  const entity = feeEntityFor(["1st Term (2026/2027)", "2nd Term (2026/2027)"], ["JSS 1", "Primary 1"]);
  expect(entity.columns.find((c) => c.key === "period")!.options!.map((o) => o.label)).toEqual([
    "1st Term (2026/2027)",
    "2nd Term (2026/2027)",
  ]);
  for (const column of entity.columns.filter((c) => c.options))
    for (const o of column.options!)
      expect(
        validateRows(entity, [row({ ...(column.key === "howOften" ? { period: "" } : {}), [column.key]: o.label })]).verdicts[0].status,
        `${column.key}=${o.label}`,
      ).toBe("ready");
});

test("the review adds a class up per kind of pupil the lines tell apart: the school's printed Basic 1 bill is 128,000, 136,000 and 47,000", () => {
  const line = (name: string, amount: string, who: Record<string, string> = {}) => row({ classGroup: "Basic 1", name, amount, ...who });
  const bill = [
    line("School fees", "42000"),
    line("Two pairs of uniform", "26000", { admission: "New", gender: "Male" }),
    line("Two pairs of uniform", "30000", { admission: "New", gender: "Female" }),
    line("Cardigan", "9000", { admission: "New" }),
    line("Lesson fee", "2000"),
    line("Sport wear", "10000", { admission: "New" }),
    line("Thursday wear", "12000", { admission: "New", gender: "Male" }),
    line("Thursday wear", "14000", { admission: "New", gender: "Female" }),
    line("Friday wear", "14000", { admission: "New", gender: "Male" }),
    line("Friday wear", "16000", { admission: "New", gender: "Female" }),
    line("Afternoon Quran", "10000", { admission: "New" }),
    line("ID card", "3000"),
  ];
  const totals = feeTotals(bill);
  const of = (who: string) => totals.find((t) => t.who === who)?.kobo;
  expect(of("New, Male")).toBe(12800000);
  expect(of("New, Female")).toBe(13600000);
  expect(of("Returning, Male")).toBe(4700000);
  expect(of("Returning, Female")).toBe(4700000);
  // Lines with no condition at all keep the old shape: one total, no "who".
  expect(feeTotals([line("School fees", "42000"), line("Lesson fee", "2000")])).toEqual([
    { period: "1st Term (2026/2027)", classGroup: "Basic 1", kobo: 4400000, lines: 2 },
  ]);
});

test("a line is for one term or it recurs: both, or neither, is a problem on the Period cell (task 0124)", () => {
  const status = (values: Record<string, string>) => {
    const v = one(values).verdicts[0];
    return [v.status, v.problems.map((p) => p.column)];
  };
  expect(status({ period: "", howOften: "Every term" })).toEqual(["ready", []]);
  expect(status({ period: "1st Term (2026/2027)", howOften: "" })).toEqual(["ready", []]);
  expect(status({ period: "1st Term (2026/2027)", howOften: "Every term" })).toEqual(["error", ["period"]]);
  expect(status({ period: "", howOften: "" })).toEqual(["error", ["period"]]);
  expect(one({ period: "", howOften: "once a year" }).ok[0].row).toMatchObject({ howOften: "EVERY_SESSION" });
});

test("the review groups recurring rows by how often (task 0124)", () => {
  const t = feeTotals([
    row({ period: "", howOften: "Every term", classGroup: "", amount: "85000" }),
    row({ period: "", howOften: "Once a year", classGroup: "", amount: "20000" }),
  ]);
  expect(t).toEqual([
    { period: "Every term", classGroup: "Every class", kobo: 8500000, lines: 1 },
    { period: "Once a year", classGroup: "Every class", kobo: 2000000, lines: 1 },
  ]);
});
