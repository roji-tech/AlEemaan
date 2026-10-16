import "../support/env";
import { test, expect } from "@playwright/test";
import {
  evaluateArithmetic,
  tokenize,
  formatCalculation,
  applyDiscountWaiver,
  applyTaxSurcharge,
} from "@/lib/tools/calculator";
import manifest from "@/app/manifest";

test.describe("Quick Tools — Calculator Arithmetic Engine", () => {
  test("tokenizes standard arithmetic correctly", () => {
    const tokens = tokenize("250000 * (1 - 0.10) + 500");
    expect(tokens).toEqual(["250000", "*", "(", "1", "-", "0.10", ")", "+", "500"]);
  });

  test("rejects malformed numbers with multiple decimal points", () => {
    expect(tokenize("12.34.56 + 1")).toBeNull();
  });

  test("respects operator precedence (multiplication before addition)", () => {
    const result = evaluateArithmetic("5000 + 2000 * 3");
    expect(result).toBe(11000);
  });

  test("handles parentheses properly", () => {
    const result = evaluateArithmetic("(5000 + 2000) * 3");
    expect(result).toBe(21000);
  });

  test("normalizes unicode arithmetic symbols (×, ÷, −)", () => {
    const result = evaluateArithmetic("100000 × 2 ÷ 4 − 10000");
    expect(result).toBe(40000);
  });

  test("evaluates percentage calculations", () => {
    const result = evaluateArithmetic("200000 * 5%");
    expect(result).toBe(10000);
  });

  test("returns null on division by zero", () => {
    const result = evaluateArithmetic("50000 / 0");
    expect(result).toBeNull();
  });

  test("returns null on unbalanced parentheses or invalid syntax", () => {
    expect(evaluateArithmetic("((100 + 50)")).toBeNull();
    expect(evaluateArithmetic("100 +* 50")).toBeNull();
    expect(evaluateArithmetic("")).toBeNull();
  });

  test("formats calculations with thousand separators", () => {
    expect(formatCalculation(1250000.5)).toBe("1,250,000.5");
    expect(formatCalculation(0)).toBe("0");
  });

  test("computes tuition discounts and waivers accurately", () => {
    // 250,000 tuition with 10% staff discount -> 225,000
    const discounted = applyDiscountWaiver(250000, 10);
    expect(discounted).toBe(225000);

    // 0% discount
    expect(applyDiscountWaiver(250000, 0)).toBe(250000);

    // Invalid negative discount
    expect(applyDiscountWaiver(250000, -5)).toBe(250000);
  });

  test("computes tax surcharges accurately", () => {
    // 100,000 with 7.5% VAT -> 107,500
    const total = applyTaxSurcharge(100000, 7.5);
    expect(total).toBe(107500);

    // 0% VAT
    expect(applyTaxSurcharge(100000, 0)).toBe(100000);
  });
});

test.describe("PWA Web App Manifest", () => {
  test("generates valid standalone manifest with proper shortcuts and icons", () => {
    const config = manifest();
    expect(config.display).toBe("standalone");
    expect(config.start_url).toBe("/students");
    expect(config.theme_color).toBe("#0f172a");
    expect(config.icons).toHaveLength(2);
    expect(config.shortcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ short_name: "Calculator", url: "/students?tool=calculator" }),
        expect.objectContaining({ short_name: "Lookup", url: "/students?tool=lookup" }),
        expect.objectContaining({ short_name: "Attendance", url: "/attendance" }),
        expect.objectContaining({ short_name: "Notes", url: "/students?tool=scratchpad" }),
      ])
    );
  });
});
