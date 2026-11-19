import { test, expect } from "@playwright/test";
import { Prisma } from "@prisma/client";
import {
  discountFor,
  isPercent,
  liveOn,
  paidByScholarship,
  peakPercent,
  percentText,
  planDiscounts,
  scholarshipTotal,
  statusAfterDiscounts,
  totalPercent,
} from "@/lib/scholarships/rules";
import { activePupilFilters, pupilFilterQuery, readPupilFilters } from "@/lib/students/list-filters";
import { pupilEntity, toPercent } from "@/lib/bulk/pupils";
import { validateRows } from "@/lib/bulk/validate";
import { exportValues } from "@/lib/bulk/list-export";
import { totalsOf, sumTotals } from "@/lib/finance/stats";

// Task 0113 S1, the pure parts: a share is a whole percent from 1 to 100, a pupil's live shares never pass 100, when a scholarship is live, what it takes off an invoice (to the kobo, never more
// than what is left), when an invoice is "Paid by scholarship", the pupil filter, the import columns and the figure kept apart from what was collected.

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const share = (
  percent: number,
  startsOn: string | null = null,
  endsOn: string | null = null,
  endedAt: string | null = null,
  id?: string,
) => ({
  id,
  percent,
  startsOn,
  endsOn,
  endedAt,
});

test.describe("a share", () => {
  test("is a whole number from 1 to 100", () => {
    for (const ok of [1, 50, 100]) expect(isPercent(ok)).toBe(true);
    for (const bad of [0, -5, 101, 12.5, NaN, "50", null, undefined]) expect(isPercent(bad), String(bad)).toBe(false);
  });
  test("is said as a percent, or Full for 100", () => {
    expect(percentText(50)).toBe("50%");
    expect(percentText(100)).toBe("Full");
  });
});

test.describe("when a scholarship is live", () => {
  test("not ended, started (or no start), not past its last day (or no end); the first and last days count", () => {
    const day = "2026-11-19";
    expect(liveOn({ startsOn: null, endsOn: null, endedAt: null }, day)).toBe(true);
    expect(liveOn({ startsOn: "2026-11-19", endsOn: "2026-11-19", endedAt: null }, day)).toBe(true);
    expect(liveOn({ startsOn: "2026-11-20", endsOn: null, endedAt: null }, day)).toBe(false); // not started
    expect(liveOn({ startsOn: null, endsOn: "2026-11-18", endedAt: null }, day)).toBe(false); // past its last day
    expect(liveOn({ startsOn: null, endsOn: null, endedAt: "2026-11-01T00:00:00Z" }, day)).toBe(false); // ended
  });
  test("the live shares add up, leaving out the one being changed", () => {
    const list = [
      share(50, null, null, null, "a"),
      share(30, null, null, null, "b"),
      share(20, null, "2026-01-01", null, "c"),
      share(40, null, null, "2026-02-02", "d"),
    ];
    expect(totalPercent(list, "2026-11-19")).toBe(80); // c is past, d ended
    expect(totalPercent(list, "2026-11-19", "a")).toBe(30);
  });
});

test.describe("the most a pupil's scholarships add up to (never over 100 on any day)", () => {
  test("overlapping days add; days that never overlap do not", () => {
    const a = share(60, "2026-09-01", "2026-12-31", null, "a");
    expect(peakPercent([a], { percent: 40, startsOn: null, endsOn: null })).toBe(100); // open ended overlaps a: 100 is allowed
    expect(peakPercent([a], { percent: 41, startsOn: null, endsOn: null })).toBe(101);
    expect(peakPercent([a], { percent: 60, startsOn: "2027-01-01", endsOn: null })).toBe(60); // starts after a ends
  });
  test("a share that starts later inside the candidate's days still counts", () => {
    const later = share(70, "2026-10-01", null, null, "l");
    expect(peakPercent([later], { percent: 40, startsOn: "2026-09-01", endsOn: "2026-12-31" })).toBe(110);
    expect(peakPercent([later], { percent: 40, startsOn: "2026-09-01", endsOn: "2026-09-30" })).toBe(40);
  });
  test("an ended scholarship and the one being changed do not count", () => {
    const ended = share(90, null, null, "2026-05-05", "e");
    const self = share(50, null, null, null, "s");
    expect(peakPercent([ended, self], { percent: 100, startsOn: null, endsOn: null }, "s")).toBe(100);
  });
});

test.describe("what a scholarship takes off", () => {
  test("a percent of the fees, to the kobo, half rounded up", () => {
    expect(discountFor("45000", 50).toString()).toBe("22500");
    expect(discountFor("100.01", 50).toString()).toBe("50.01"); // 50.005 -> 50.01
    expect(discountFor("33333.33", 33).toFixed(2)).toBe("11000.00");
    expect(discountFor("1000", 100).toString()).toBe("1000");
  });
  test("two shares never take off more than there is, even with rounding", () => {
    const plan = planDiscounts(
      "100.01",
      [
        { id: "a", percent: 50 },
        { id: "b", percent: 50 },
      ],
      "100.01",
    );
    expect(plan.map((p) => p.amount.toString())).toEqual(["50.01", "50"]); // the second is cut by the kobo the first rounded up
    expect(plan.reduce((n, p) => n.add(p.amount), D(0)).lte("100.01")).toBe(true);
  });
  test("never more than the room left (an invoice part paid), and a full scholarship takes exactly the balance", () => {
    const plan = planDiscounts("10000", [{ id: "full", percent: 100 }], "4000");
    expect(plan.map((p) => p.amount.toString())).toEqual(["4000"]);
    expect(planDiscounts("10000", [{ id: "a", percent: 50 }], "0")).toEqual([]);
    expect(planDiscounts("10000", [], "10000")).toEqual([]);
  });
});

test.describe("an invoice paid by scholarship", () => {
  const sch = (amount: string) => ({ amount, mode: "SCHOLARSHIP" });
  const manual = (amount: string) => ({ amount, mode: "MANUAL_OVERRIDE" });
  test("settled, nothing paid in money, scholarships took the fees off", () => {
    expect(paidByScholarship({ status: "PAID", totalAmount: "0", amountPaid: "0", discounts: [sch("10000")] })).toBe(true);
    expect(paidByScholarship({ status: "PAID", totalAmount: "0", amountPaid: "0", discounts: [sch("6000"), manual("4000")] })).toBe(true);
  });
  test("not when money was paid, when it is not settled, or when no scholarship is in the discounts", () => {
    expect(paidByScholarship({ status: "PAID", totalAmount: "5000", amountPaid: "5000", discounts: [sch("5000")] })).toBe(false);
    expect(paidByScholarship({ status: "UNPAID", totalAmount: "5000", amountPaid: "0", discounts: [sch("5000")] })).toBe(false);
    expect(paidByScholarship({ status: "PAID", totalAmount: "0", amountPaid: "0", discounts: [manual("10000")] })).toBe(false);
    expect(scholarshipTotal([sch("100"), manual("50"), sch("25.5")]).toString()).toBe("125.5");
  });
  test("an invoice whose whole fee scholarships took off is PAID; every other status is what money gave it, a manual discount that reaches the total included", () => {
    expect(statusAfterDiscounts("UNPAID", "0", [sch("10000")])).toBe("PAID");
    expect(statusAfterDiscounts("UNPAID", "5000", [sch("5000")])).toBe("UNPAID");
    expect(statusAfterDiscounts("UNPAID", "0", [manual("10000")])).toBe("UNPAID"); // unchanged
    expect(statusAfterDiscounts("PARTIALLY_PAID", "3000", [sch("2000")])).toBe("PARTIALLY_PAID");
  });
});

test.describe("the pupil filter", () => {
  test("ANY, NONE or a type's id is read from the address and counts as one filter", () => {
    for (const value of ["ANY", "NONE", "ckabc123"]) {
      const read = readPupilFilters(new URLSearchParams(`scholarship=${value}`));
      expect(read.success, value).toBe(true);
      if (read.success) {
        expect(read.data.scholarship).toBe(value);
        expect(activePupilFilters(read.data)).toBe(1);
        expect(pupilFilterQuery(read.data)).toContain(`&scholarship=${value}`);
      }
    }
    expect(readPupilFilters(new URLSearchParams("scholarship=")).success).toBe(true);
    expect(readPupilFilters(new URLSearchParams(`scholarship=${"x".repeat(65)}`)).success).toBe(false);
  });
});

test.describe("the import columns", () => {
  const base = { firstName: "Amina", lastName: "Yusuf", gender: "Female" };
  const one = (values: Record<string, string>) => validateRows(pupilEntity, [{ line: 2, values: { ...base, ...values } }]);
  test("a share reads 50, 50% or blank", () => {
    expect(toPercent("50%")).toBe(50);
    expect(toPercent(" 75 % ")).toBe(75);
    expect(toPercent("")).toBeUndefined();
    expect(toPercent("abc")).toBe("abc");
  });
  test("the type's name and an optional share are carried; a share outside 1 to 100 or a fraction is a problem on that column", () => {
    const ok = one({ scholarship: "Academic merit", scholarshipPercent: "50%" });
    expect(ok.verdicts[0].status).toBe("ready");
    expect(ok.ok[0].row).toMatchObject({ scholarship: "Academic merit", scholarshipPercent: 50 });
    for (const bad of ["0", "101", "12.5", "x"])
      expect(one({ scholarship: "Merit", scholarshipPercent: bad }).verdicts[0].status, bad).toBe("error");
  });
  test("the template has both columns, after Day or boarding", () => {
    const keys = pupilEntity.columns.map((c) => c.key);
    expect(keys.slice(-2)).toEqual(["scholarship", "scholarshipPercent"]);
  });
  test("the export writes the live scholarships' names and their shares added up", () => {
    const row = exportValues.pupils({
      firstName: "A",
      middleName: null,
      lastName: "B",
      gender: "MALE",
      dateOfBirth: null,
      admissionNo: "1",
      className: null,
      arm: null,
      guardianName: null,
      guardianPhone: null,
      guardianEmail: null,
      scholarship: "Academic merit, Hafiz award",
      scholarshipPercent: 75,
    });
    expect([row.scholarship, row.scholarshipPercent]).toEqual(["Academic merit, Hafiz award", "75"]);
  });
});

test.describe("the finance figures", () => {
  const empty = { UNPAID: { count: 0, invoicedKobo: 0, collectedKobo: 0 } };
  const noAgeing = { notDue: 0, d1to30: 0, d31to60: 0, d61plus: 0 };
  test("scholarships are their own figure, never part of what was collected, and add up across branches", () => {
    const one = totalsOf({
      byStatus: { ...empty, PAID: { count: 2, invoicedKobo: 100_000, collectedKobo: 100_000 } },
      ageing: noAgeing,
      discountsKobo: 5_000,
      scholarshipsKobo: 300_000,
      waived: 0,
      cancelled: 0,
    });
    expect(one.totals.scholarshipsKobo).toBe(300_000);
    expect(one.totals.discountsKobo).toBe(5_000);
    expect(one.totals.collectedKobo).toBe(100_000); // collected is payments only
    expect(totalsOf({ byStatus: {}, ageing: noAgeing, discountsKobo: 0, waived: 0, cancelled: 0 }).totals.scholarshipsKobo).toBe(0);
    expect(sumTotals([one.totals, one.totals]).scholarshipsKobo).toBe(600_000);
  });
});
