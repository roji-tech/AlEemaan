import { PromotionDecision } from "@prisma/client";

export const DEFAULT_PASS_MARK = 50.0;

export interface TermAverageInput {
  periodOrdinal: number;
  average: number | null;
}

export interface EvaluationResult {
  decision: PromotionDecision;
  reason: string;
}

export interface ClassGroupMinimal {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt?: Date | null;
}

export interface ClassArmMinimal {
  id: string;
  name: string;
}

/**
 * Computes the overall session average as the arithmetic mean of available term averages.
 * Per legacy specification (§4.6): average of averages across all term result documents found (1, 2, or 3).
 * Returns null if no valid term averages exist.
 */
export function computeStudentSessionAverage(
  termAverages: (number | null | undefined)[]
): number | null {
  const validScores = termAverages.filter(
    (score): score is number => typeof score === "number" && !Number.isNaN(score)
  );

  if (validScores.length === 0) {
    return null;
  }

  const sum = validScores.reduce((acc, score) => acc + score, 0);
  const avg = sum / validScores.length;
  return Math.round(avg * 100) / 100;
}

/**
 * Evaluates whether a student should be promoted, repeat, or graduate based on overall session average.
 */
export function evaluatePromotionRecommendation(
  overallAverage: number | null,
  isTerminalClass: boolean,
  passMark: number = DEFAULT_PASS_MARK
): EvaluationResult {
  if (overallAverage === null) {
    return {
      decision: PromotionDecision.REPEATED,
      reason: "No published term scores found for this session",
    };
  }

  if (overallAverage >= passMark) {
    if (isTerminalClass) {
      return {
        decision: PromotionDecision.GRADUATED,
        reason: `Overall session average (${overallAverage.toFixed(2)}%) qualifies for graduation`,
      };
    }
    return {
      decision: PromotionDecision.PROMOTED,
      reason: `Overall session average (${overallAverage.toFixed(2)}%) meets pass mark (${passMark.toFixed(1)}%)`,
    };
  }

  return {
    decision: PromotionDecision.REPEATED,
    reason: `Overall session average (${overallAverage.toFixed(2)}%) is below pass mark (${passMark.toFixed(1)}%)`,
  };
}

/**
 * Resolves the next class group in progression based on ClassGroup.sortOrder.
 * Higher sortOrder = higher grade rung.
 * If no higher active class exists, the current class is terminal (e.g. SSS 3 / Graduating).
 */
export function resolveNextClassGroup(
  currentClass: ClassGroupMinimal,
  allClasses: ClassGroupMinimal[]
): {
  nextClass: ClassGroupMinimal | null;
  isTerminalClass: boolean;
} {
  const activeClasses = allClasses
    .filter((c) => !c.archivedAt && c.id !== currentClass.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const higherClasses = activeClasses.filter(
    (c) => c.sortOrder > currentClass.sortOrder
  );

  if (higherClasses.length === 0) {
    return {
      nextClass: null,
      isTerminalClass: true,
    };
  }

  return {
    nextClass: higherClasses[0],
    isTerminalClass: false,
  };
}

/**
 * Resolves target class arm for promoted students.
 * Matches arm name if exists in target class (e.g. "Gold" -> "Gold"), otherwise falls back to first arm.
 */
export function resolveTargetArm(
  sourceArmName: string | null | undefined,
  targetArms: ClassArmMinimal[]
): string | null {
  if (targetArms.length === 0) {
    return null;
  }

  if (sourceArmName && sourceArmName.trim().length > 0) {
    const trimmed = sourceArmName.trim().toLowerCase();
    const matched = targetArms.find((a) => a.name.trim().toLowerCase() === trimmed);
    if (matched) {
      return matched.id;
    }
  }

  return targetArms[0].id;
}

/**
 * Validates whether the branch's active period is the final period of the session.
 * Promotion is gated to the final term (e.g. 3rd Term for 3-term sessions, 2nd Term for 2-term sessions).
 */
export function validateSessionPromotionEligibility(
  periods: { ordinal: number; isCurrent: boolean }[]
): {
  eligible: boolean;
  finalPeriodOrdinal: number;
  reason?: string;
} {
  if (periods.length === 0) {
    return {
      eligible: false,
      finalPeriodOrdinal: 1,
      reason: "No academic periods found for session",
    };
  }

  const maxOrdinal = Math.max(...periods.map((p) => p.ordinal));
  const currentPeriod = periods.find((p) => p.isCurrent);

  if (!currentPeriod) {
    return {
      eligible: false,
      finalPeriodOrdinal: maxOrdinal,
      reason: "No current active academic period selected",
    };
  }

  if (currentPeriod.ordinal !== maxOrdinal) {
    return {
      eligible: false,
      finalPeriodOrdinal: maxOrdinal,
      reason: `Promotion is gated to the final term (${maxOrdinal} Term). Current active term is ${currentPeriod.ordinal} Term.`,
    };
  }

  return {
    eligible: true,
    finalPeriodOrdinal: maxOrdinal,
  };
}
