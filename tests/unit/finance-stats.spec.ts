import { test, expect } from "@playwright/test";
import {
  ageingBucket,
  compactNaira,
  dayOf,
  kobo,
  monthKeys,
  monthKeyOf,
  monthSeries,
  ratePercent,
  sumTotals,
  totalsOf,
  type AgeingBucket,
  type Totals,
} from "@/lib/finance/stats";

// Task 0106: the rules behind Finance's Overview. Pure: money is whole kobo, a rate is worked out from sums, an invoice's lateness is counted in calendar days.

const row = (count: number, invoiced: number, collected: number) => ({ count, invoicedKobo: invoiced, collectedKobo: collected });
const noAgeing = (): Record<AgeingBucket, number> => ({ notDue: 0, d1to30: 0, d31to60: 0, d61plus: 0 });

test.describe("money is whole kobo", () => {
  test("naira (a Decimal, a string, a number) become kobo without float drift", () => {
    expect(kobo("100000.00")).toBe(10_000_000);
    expect(kobo("20000.25")).toBe(2_000_025);
    expect(kobo(0.1 + 0.2)).toBe(30); // 0.30000000000000004 naira is 30 kobo
    expect(kobo({ toString: () => "1.005" })).toBe(101); // half a kobo rounds up
    expect(kobo(null)).toBe(0);
    expect(kobo(undefined)).toBe(0);
    expect(kobo("not a number")).toBe(0);
  });

  test("twenty thousand invoices of ₦0.10 add up to exactly ₦2,000.00", () => {
    let total = 0;
    for (let i = 0; i < 20_000; i++) total += kobo("0.10");
    expect(total).toBe(200_000);
  });

  test("short amounts for a chart: whole naira, then K, M and B with one decimal and no trailing .0", () => {
    expect(compactNaira(95_000)).toBe("₦950");
    expect(compactNaira(0)).toBe("₦0");
    expect(compactNaira(125_000_00)).toBe("₦125K");
    expect(compactNaira(1_250_000_00)).toBe("₦1.3M");
    expect(compactNaira(1_000_000_00)).toBe("₦1M");
    expect(compactNaira(3_400_000_000_00)).toBe("₦3.4B");
  });
});

test.describe("the collection rate", () => {
  test("collected over invoiced, one decimal; 0 when nothing is invoiced; never above 100", () => {
    expect(ratePercent(50, 200)).toBe(25);
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(2, 3)).toBe(66.7);
    expect(ratePercent(0, 0)).toBe(0);
    expect(ratePercent(100, 0)).toBe(0);
    expect(ratePercent(500, 100)).toBe(100); // an overpayment is not a rate above one
  });
});

test.describe("how late", () => {
  const today = new Date("2026-11-18T09:30:00Z");
  const due = (iso: string) => new Date(`${iso}T00:00:00Z`);
  test("no due date, or not past it (the due day itself is not late), is not yet due", () => {
    expect(ageingBucket(null, today)).toBe("notDue");
    expect(ageingBucket(due("2026-11-18"), today)).toBe("notDue");
    expect(ageingBucket(due("2026-12-01"), today)).toBe("notDue");
  });
  test("by whole calendar days past it: 1 to 30, 31 to 60, over 60 (the edges belong to the lower bucket)", () => {
    expect(ageingBucket(due("2026-11-17"), today)).toBe("d1to30");
    expect(ageingBucket(due("2026-10-19"), today)).toBe("d1to30"); // 30 days
    expect(ageingBucket(due("2026-10-18"), today)).toBe("d31to60"); // 31 days
    expect(ageingBucket(due("2026-09-19"), today)).toBe("d31to60"); // 60 days
    expect(ageingBucket(due("2026-09-18"), today)).toBe("d61plus"); // 61 days
  });
  test("a late evening or early morning UTC does not move the day", () => {
    expect(dayOf(new Date("2026-11-18T00:00:00Z"))).toBe(dayOf(new Date("2026-11-18T23:59:59Z")));
    expect(ageingBucket(due("2026-11-17"), new Date("2026-11-18T23:59:59Z"))).toBe("d1to30");
  });
});

test.describe("six months in order", () => {
  test("the last six calendar months ending with this one, across a year end", () => {
    expect(monthKeys(new Date("2026-02-10T00:00:00Z"), 6)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthKeys(new Date("2026-11-18T00:00:00Z"), 1)).toEqual(["2026-11"]);
    expect(monthKeyOf(new Date("2026-03-31T23:59:59Z"))).toBe("2026-03");
  });
  test("every month is present, zero where nothing happened", () => {
    const series = monthSeries(new Date("2026-11-18T00:00:00Z"), 3, new Map([["2026-11", 500]]), new Map([["2026-09", 70]]));
    expect(series).toEqual([
      { month: "2026-09", invoicedKobo: 0, collectedKobo: 70 },
      { month: "2026-10", invoicedKobo: 0, collectedKobo: 0 },
      { month: "2026-11", invoicedKobo: 500, collectedKobo: 0 },
    ]);
  });
});

test.describe("a branch's totals", () => {
  test("invoiced and collected are the sums; outstanding is what Unpaid and Partly paid still owe; overdue is the late part of it", () => {
    const { totals, byStatus } = totalsOf({
      byStatus: { PAID: row(1, 10_000_000, 10_000_000), PARTIALLY_PAID: row(1, 5_000_050, 2_000_025), UNPAID: row(2, 5_000_000, 0) },
      ageing: { notDue: 2_000_000, d1to30: 3_000_000, d31to60: 3_000_025, d61plus: 0 },
      discountsKobo: 500_000,
      waived: 1,
      cancelled: 2,
    });
    expect(totals.invoices).toBe(4);
    expect(totals.invoicedKobo).toBe(20_000_050);
    expect(totals.collectedKobo).toBe(12_000_025);
    expect(totals.outstandingKobo).toBe(3_000_025 + 5_000_000); // partly paid owes 3,000,025; the two unpaid owe 5,000,000
    expect(totals.overdueKobo).toBe(6_000_025);
    expect(totals.discountsKobo).toBe(500_000);
    expect(totals.waived).toBe(1);
    expect(totals.cancelled).toBe(2);
    expect(totals.ratePercent).toBe(60);
    expect(byStatus.UNPAID.count).toBe(2);
  });

  test("an empty branch is all zeros, not NaN", () => {
    const { totals } = totalsOf({ byStatus: {}, ageing: noAgeing(), discountsKobo: 0, waived: 0, cancelled: 0 });
    expect(Object.values(totals).every((n) => Number.isFinite(n))).toBe(true);
    expect(totals).toMatchObject({ invoices: 0, invoicedKobo: 0, collectedKobo: 0, outstandingKobo: 0, overdueKobo: 0, ratePercent: 0 });
  });

  test("the total of several branches adds the money and works the rate out again from the sums, not as an average of rates", () => {
    const small = totalsOf({ byStatus: { PAID: row(1, 100, 100) }, ageing: noAgeing(), discountsKobo: 0, waived: 0, cancelled: 0 }).totals; // 100 %
    const big = totalsOf({ byStatus: { UNPAID: row(9, 900, 0) }, ageing: noAgeing(), discountsKobo: 0, waived: 1, cancelled: 0 }).totals; // 0 %
    const all: Totals = sumTotals([small, big]);
    expect(all.invoicedKobo).toBe(1000);
    expect(all.collectedKobo).toBe(100);
    expect(all.ratePercent).toBe(10); // an average of 100 and 0 would be 50
    expect(all.invoices).toBe(10);
    expect(all.waived).toBe(1);
    expect(sumTotals([]).ratePercent).toBe(0);
  });
});
