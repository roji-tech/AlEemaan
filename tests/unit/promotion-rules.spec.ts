import { PromotionDecision } from "@prisma/client";
import { test, expect } from "@playwright/test";
import {
  computeStudentSessionAverage,
  evaluatePromotionRecommendation,
  resolveNextClassGroup,
  resolveTargetArm,
  validateSessionPromotionEligibility,
  defaultPromotionSessions,
  sessionAfter,
  sessionPairProblem,
} from "@/lib/promotion/rules";

test.describe("Student Promotion Pure Rules (Unit)", () => {
  test.describe("computeStudentSessionAverage", () => {
    test("calculates exact mean across 3 terms", () => {
      const avg = computeStudentSessionAverage([60, 70, 80]);
      expect(avg).toBe(70.0);
    });

    test("calculates exact mean across 2 terms", () => {
      const avg = computeStudentSessionAverage([55, 65]);
      expect(avg).toBe(60.0);
    });

    test("handles single term with results found", () => {
      const avg = computeStudentSessionAverage([78.5]);
      expect(avg).toBe(78.5);
    });

    test("ignores null, undefined and NaN entries", () => {
      const avg = computeStudentSessionAverage([60, null, undefined, 80]);
      expect(avg).toBe(70.0);
    });

    test("returns null when all terms are null or empty", () => {
      expect(computeStudentSessionAverage([])).toBeNull();
      expect(computeStudentSessionAverage([null, undefined])).toBeNull();
    });

    test("rounds result to 2 decimal places", () => {
      const avg = computeStudentSessionAverage([61, 62, 64]);
      expect(avg).toBe(62.33);
    });
  });

  test.describe("evaluatePromotionRecommendation", () => {
    test("recommends PROMOTED when overall average >= default pass mark (50%)", () => {
      const res = evaluatePromotionRecommendation(52.5, false);
      expect(res.decision).toBe(PromotionDecision.PROMOTED);
      expect(res.reason).toContain("meets pass mark");
    });

    test("recommends GRADUATED when overall average >= pass mark in terminal class", () => {
      const res = evaluatePromotionRecommendation(68.0, true);
      expect(res.decision).toBe(PromotionDecision.GRADUATED);
      expect(res.reason).toContain("qualifies for graduation");
    });

    test("recommends REPEATED when overall average < pass mark", () => {
      const res = evaluatePromotionRecommendation(49.9, false);
      expect(res.decision).toBe(PromotionDecision.REPEATED);
      expect(res.reason).toContain("below pass mark");
    });

    test("respects custom pass mark threshold", () => {
      const resFail = evaluatePromotionRecommendation(58.0, false, 60.0);
      expect(resFail.decision).toBe(PromotionDecision.REPEATED);

      const resPass = evaluatePromotionRecommendation(60.0, false, 60.0);
      expect(resPass.decision).toBe(PromotionDecision.PROMOTED);
    });

    test("recommends REPEATED when overall average is null", () => {
      const res = evaluatePromotionRecommendation(null, false);
      expect(res.decision).toBe(PromotionDecision.REPEATED);
      expect(res.reason).toContain("No published term scores");
    });
  });

  test.describe("resolveNextClassGroup", () => {
    const classes = [
      { id: "c1", name: "Primary 1", sortOrder: 10 },
      { id: "c2", name: "Primary 2", sortOrder: 20 },
      { id: "c3", name: "Primary 3", sortOrder: 30 },
      { id: "c4", name: "Primary 4 (Archived)", sortOrder: 40, archivedAt: new Date() },
      { id: "c5", name: "Primary 5", sortOrder: 50 },
    ];

    test("resolves next non-archived class with next higher sortOrder", () => {
      const res1 = resolveNextClassGroup(classes[0], classes);
      expect(res1.isTerminalClass).toBe(false);
      expect(res1.nextClass?.id).toBe("c2");

      // Skipping archived c4
      const res3 = resolveNextClassGroup(classes[2], classes);
      expect(res3.isTerminalClass).toBe(false);
      expect(res3.nextClass?.id).toBe("c5");
    });

    test("identifies terminal graduating class when no higher class exists", () => {
      const res = resolveNextClassGroup(classes[4], classes);
      expect(res.isTerminalClass).toBe(true);
      expect(res.nextClass).toBeNull();
    });
  });

  test.describe("resolveTargetArm", () => {
    const targetArms = [
      { id: "arm-a", name: "Diamond" },
      { id: "arm-b", name: "Gold" },
      { id: "arm-c", name: "Silver" },
    ];

    test("matches arm by name (case-insensitive)", () => {
      expect(resolveTargetArm("gold", targetArms)).toBe("arm-b");
      expect(resolveTargetArm("DIAMOND", targetArms)).toBe("arm-a");
    });

    test("falls back to first arm if source arm has no name match", () => {
      expect(resolveTargetArm("Bronze", targetArms)).toBe("arm-a");
      expect(resolveTargetArm(null, targetArms)).toBe("arm-a");
    });

    test("returns null if target class has no arms", () => {
      expect(resolveTargetArm("Gold", [])).toBeNull();
    });
  });

  test.describe("validateSessionPromotionEligibility", () => {
    test("allows promotion when current period is 3rd Term (max ordinal = 3)", () => {
      const periods = [
        { ordinal: 1, isCurrent: false },
        { ordinal: 2, isCurrent: false },
        { ordinal: 3, isCurrent: true },
      ];
      const res = validateSessionPromotionEligibility(periods);
      expect(res.eligible).toBe(true);
      expect(res.finalPeriodOrdinal).toBe(3);
    });

    test("blocks promotion when current period is not final term", () => {
      const periods = [
        { ordinal: 1, isCurrent: false },
        { ordinal: 2, isCurrent: true },
        { ordinal: 3, isCurrent: false },
      ];
      const res = validateSessionPromotionEligibility(periods);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("Promotion is gated to the final term");
    });

    test("allows promotion for 2-term sessions (Arabic branches) on 2nd Term", () => {
      const periods = [
        { ordinal: 1, isCurrent: false },
        { ordinal: 2, isCurrent: true },
      ];
      const res = validateSessionPromotionEligibility(periods);
      expect(res.eligible).toBe(true);
      expect(res.finalPeriodOrdinal).toBe(2);
    });
  });

  // The sessions list arrives newest first; the console used its first two entries as source and target, i.e. evaluated the newer session and enrolled into the older one.
  test.describe("which sessions a rollover starts with", () => {
    const s2425 = { id: "s2425", startDate: "2024-09-01", status: "CLOSED" };
    const s2526 = { id: "s2526", startDate: "2025-09-01", status: "ACTIVE" };
    const s2627 = { id: "s2627", startDate: "2026-09-01", status: "PLANNED" };

    test("the active session is evaluated and the one that begins after it is the target, whatever order the list comes in", () => {
      for (const list of [
        [s2627, s2526, s2425],
        [s2425, s2526, s2627],
        [s2526, s2627, s2425],
      ]) {
        expect(defaultPromotionSessions(list)).toEqual({ sourceId: "s2526", targetId: "s2627" });
      }
    });

    test("with no active session, the second newest is evaluated and the newest is the target", () => {
      const quiet = [s2627, { ...s2526, status: "CLOSED" }, s2425];
      expect(defaultPromotionSessions(quiet)).toEqual({ sourceId: "s2526", targetId: "s2627" });
    });

    test("the newest session being active leaves no target (the next session has to be created first)", () => {
      expect(defaultPromotionSessions([{ ...s2627, status: "ACTIVE" }, s2526])).toEqual({ sourceId: "s2627", targetId: "" });
    });

    test("one session, or none", () => {
      expect(defaultPromotionSessions([s2526])).toEqual({ sourceId: "s2526", targetId: "" });
      expect(defaultPromotionSessions([])).toEqual({ sourceId: "", targetId: "" });
    });

    test("sessionAfter is the session that begins next, or empty", () => {
      expect(sessionAfter([s2627, s2526, s2425], "s2425")).toBe("s2526");
      expect(sessionAfter([s2627, s2526, s2425], "s2627")).toBe("");
      expect(sessionAfter([s2627, s2526, s2425], "unknown")).toBe("");
    });

    test("a pair is refused when it is the same session or the target does not begin after the source", () => {
      expect(sessionPairProblem(s2526, s2627)).toBeNull();
      expect(sessionPairProblem(s2526, s2526)).toMatch(/different/);
      expect(sessionPairProblem(s2627, s2526)).toMatch(/begin after/);
      expect(sessionPairProblem(s2526, { id: "twin", startDate: "2025-09-01" })).toMatch(/begin after/);
    });
  });
});
