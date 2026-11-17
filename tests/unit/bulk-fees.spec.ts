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
};
test("every column has samples; each passing value passes and each failing value is a problem on that column alone", () => {
  expect(Object.keys(SAMPLES).sort()).toEqual(feeEntity.columns.map((c) => c.key).sort());
  for (const [column, { pass, fail }] of Object.entries(SAMPLES)) {
    for (const value of pass) expect(one({ [column]: value }).verdicts[0].status, `${column}=${JSON.stringify(value)}`).toBe("ready");
    for (const value of fail) {
      const v = one({ [column]: value }).verdicts[0];
      expect([v.status, v.problems.map((p) => p.column)], `${column}=${JSON.stringify(value)}`).toEqual(["error", [column]]);
    }
  }
});

test("a row comes out with the amount as exact text; the class may be empty (every class)", () => {
  expect(one({ amount: "₦1,500.5", classGroup: "" }).ok[0].row).toEqual({
    period: "1st Term (2026/2027)",
    name: "Tuition",
    amount: "1500.50",
  });
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
  expect(out.verdicts[1].problems).toEqual([{ column: "name", message: "Same period, class and fee item as row 2." }]);
  expect(out.verdicts[5].problems[0].message).toBe("Same period, class and fee item as row 6.");
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
      expect(validateRows(entity, [row({ [column.key]: o.label })]).verdicts[0].status, `${column.key}=${o.label}`).toBe("ready");
});
