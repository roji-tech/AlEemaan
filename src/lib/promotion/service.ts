import { prisma as db } from "@/lib/db";
import { EnrollmentStatus, PromotionDecision, DecisionMode, PromotionBatchStatus, ResultStatus } from "@prisma/client";
import {
  computeStudentSessionAverage,
  evaluatePromotionRecommendation,
  resolveNextClassGroup,
  resolveTargetArm,
  validateSessionPromotionEligibility,
  sessionPairProblem,
  DEFAULT_PASS_MARK,
} from "./rules";
import type { PromotionPreviewQuery, ExecutePromotionInput } from "./validation";

/// A request that cannot be a rollover (a session of another branch, a target before the source, an override that names nobody in the class...). The routes answer it with
/// `status` and the message, which says what to change; it is never a 500.
export class PromotionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "PromotionError";
  }
}

/// Both sessions belong to the branch and the pair can be a rollover.
async function checkSessions(branchId: string, sourceSessionId: string, targetSessionId: string) {
  const sessions = await db.academicSession.findMany({
    where: { branchId, id: { in: [sourceSessionId, targetSessionId] } },
    select: { id: true, startDate: true },
  });
  const source = sessions.find((x) => x.id === sourceSessionId);
  const target = sessions.find((x) => x.id === targetSessionId);
  if (!source) throw new PromotionError("The source session was not found in this branch.", 404);
  if (!target) throw new PromotionError("The target session was not found in this branch.", 404);
  const problem = sessionPairProblem(source, target);
  if (problem) throw new PromotionError(problem);
}

export interface StudentPreviewRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  currentArmId: string | null;
  currentArmName: string | null;
  termAverages: Record<number, number | null>;
  overallAverage: number | null;
  recommendedDecision: PromotionDecision;
  recommendationReason: string;
  targetClassArmId: string | null;
  targetClassArmName: string | null;
  isAlreadyEnrolledInTargetSession: boolean;
}

export interface PromotionPreviewResponse {
  sourceClassGroup: {
    id: string;
    name: string;
    sortOrder: number;
  };
  targetClassGroup: {
    id: string;
    name: string;
    sortOrder: number;
  } | null;
  isTerminalClass: boolean;
  passMark: number;
  academicPeriods: {
    id: string;
    ordinal: number;
    label: string;
    isCurrent: boolean;
  }[];
  eligibility: {
    eligible: boolean;
    finalPeriodOrdinal: number;
    reason?: string;
  };
  targetArms: {
    id: string;
    name: string;
  }[];
  students: StudentPreviewRow[];
  summary: {
    totalEvaluated: number;
    totalPromoted: number;
    totalRepeated: number;
    totalGraduated: number;
  };
}

/**
 * Computes a dry-run preview of student performance and recommended promotion actions.
 */
export async function previewPromotion(query: PromotionPreviewQuery): Promise<PromotionPreviewResponse> {
  const { branchId, sourceSessionId, targetSessionId, sourceClassGroupId, passMark } = query;

  await checkSessions(branchId, sourceSessionId, targetSessionId);

  // 1. Fetch source class and all classes in branch for progression resolution
  const allClasses = await db.classGroup.findMany({
    where: { branchId },
    select: { id: true, name: true, sortOrder: true, archivedAt: true },
  });

  const sourceClass = allClasses.find((c) => c.id === sourceClassGroupId);
  if (!sourceClass) {
    throw new PromotionError("The source class was not found in this branch.", 404);
  }

  const { nextClass, isTerminalClass } = resolveNextClassGroup(sourceClass, allClasses);

  // 2. Fetch target class arms if non-terminal
  const targetArms = nextClass
    ? await db.classArm.findMany({
        where: { branchId, classGroupId: nextClass.id, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // 3. Fetch academic periods for the source session to inspect term breakdown
  const periods = await db.academicPeriod.findMany({
    where: { branchId, sessionId: sourceSessionId },
    select: { id: true, ordinal: true, label: true, isCurrent: true },
    orderBy: { ordinal: "asc" },
  });

  const eligibility = validateSessionPromotionEligibility(periods);

  // 4. Fetch students currently actively enrolled in the source class group
  const activeEnrollments = await db.studentEnrollment.findMany({
    where: {
      branchId,
      sessionId: sourceSessionId,
      status: EnrollmentStatus.ACTIVE,
      classArm: { classGroupId: sourceClassGroupId },
    },
    include: {
      student: {
        select: { id: true, admissionNo: true, firstName: true, lastName: true },
      },
      classArm: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });

  // 5. Fetch published results for all enrolled students in this session
  const studentIds = activeEnrollments.map((e) => e.studentId);
  const results = await db.result.findMany({
    where: {
      branchId,
      studentId: { in: studentIds },
      period: { sessionId: sourceSessionId },
      status: { in: [ResultStatus.PUBLISHED, ResultStatus.LOCKED] },
    },
    select: {
      studentId: true,
      periodId: true,
      total: true,
      maxScore: true,
      period: {
        select: { ordinal: true },
      },
    },
  });

  // 6. Check existing enrollments in target session (for idempotency check)
  const existingTargetEnrollments = await db.studentEnrollment.findMany({
    where: {
      branchId,
      sessionId: targetSessionId,
      studentId: { in: studentIds },
    },
    select: { studentId: true },
  });
  const alreadyEnrolledStudentIds = new Set(existingTargetEnrollments.map((e) => e.studentId));

  // 7. Group results per student and period ordinal
  // studentId -> ordinal -> scores: number[]
  const scoresByStudentAndOrdinal = new Map<string, Map<number, number[]>>();

  for (const r of results) {
    if (!scoresByStudentAndOrdinal.has(r.studentId)) {
      scoresByStudentAndOrdinal.set(r.studentId, new Map());
    }
    const studentMap = scoresByStudentAndOrdinal.get(r.studentId)!;
    const ord = r.period.ordinal;
    if (!studentMap.has(ord)) {
      studentMap.set(ord, []);
    }
    const total = Number(r.total);
    const maxScore = Number(r.maxScore) || 100;
    const percentage = maxScore > 0 ? (total / maxScore) * 100 : total;
    studentMap.get(ord)!.push(percentage);
  }

  // 8. Build student preview evaluation rows
  let totalPromoted = 0;
  let totalRepeated = 0;
  let totalGraduated = 0;

  const students: StudentPreviewRow[] = activeEnrollments.map((enrol) => {
    const sMap = scoresByStudentAndOrdinal.get(enrol.studentId);
    const termAverages: Record<number, number | null> = {};
    const ordinalsList: (number | null)[] = [];

    for (const p of periods) {
      const scores = sMap?.get(p.ordinal);
      if (scores && scores.length > 0) {
        const termAvg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
        termAverages[p.ordinal] = termAvg;
        ordinalsList.push(termAvg);
      } else {
        termAverages[p.ordinal] = null;
        ordinalsList.push(null);
      }
    }

    const overallAverage = computeStudentSessionAverage(ordinalsList);
    const recommendation = evaluatePromotionRecommendation(overallAverage, isTerminalClass, passMark);

    if (recommendation.decision === PromotionDecision.PROMOTED) totalPromoted++;
    else if (recommendation.decision === PromotionDecision.GRADUATED) totalGraduated++;
    else totalRepeated++;

    const targetArmId =
      recommendation.decision === PromotionDecision.PROMOTED ? resolveTargetArm(enrol.classArm?.name, targetArms) : enrol.classArmId;

    const targetArm = targetArms.find((a) => a.id === targetArmId);

    return {
      studentId: enrol.student.id,
      admissionNo: enrol.student.admissionNo,
      firstName: enrol.student.firstName,
      lastName: enrol.student.lastName,
      currentArmId: enrol.classArmId,
      currentArmName: enrol.classArm?.name || null,
      termAverages,
      overallAverage,
      recommendedDecision: recommendation.decision,
      recommendationReason: recommendation.reason,
      targetClassArmId: targetArmId,
      targetClassArmName: targetArm?.name || enrol.classArm?.name || null,
      isAlreadyEnrolledInTargetSession: alreadyEnrolledStudentIds.has(enrol.student.id),
    };
  });

  return {
    sourceClassGroup: {
      id: sourceClass.id,
      name: sourceClass.name,
      sortOrder: sourceClass.sortOrder,
    },
    targetClassGroup: nextClass
      ? {
          id: nextClass.id,
          name: nextClass.name,
          sortOrder: nextClass.sortOrder,
        }
      : null,
    isTerminalClass,
    passMark,
    academicPeriods: periods,
    eligibility,
    targetArms,
    students,
    summary: {
      totalEvaluated: students.length,
      totalPromoted,
      totalRepeated,
      totalGraduated,
    },
  };
}

/// What an override may ask for: only a pupil who is in the class for the source session, no "promoted" where there is no next class, and an arm that really belongs to the
/// class the pupil goes to (the next class for a promotion, the same class for a repeat) and is still in use. Each refusal names the pupil and says what to change.
async function checkOverrides(
  branchId: string,
  preview: PromotionPreviewResponse,
  overrides: Map<string, { studentId: string; decision: PromotionDecision; targetClassArmId?: string | null }>,
) {
  const roster = new Map(preview.students.map((row) => [row.studentId, row]));
  const armIds = [...new Set([...overrides.values()].map((o) => o.targetClassArmId).filter((id): id is string => Boolean(id)))];
  const arms = armIds.length
    ? await db.classArm.findMany({ where: { branchId, id: { in: armIds } }, select: { id: true, classGroupId: true, archivedAt: true } })
    : [];
  const armById = new Map(arms.map((a) => [a.id, a]));

  for (const o of overrides.values()) {
    const row = roster.get(o.studentId);
    if (!row)
      throw new PromotionError(
        "An override names a pupil who is not in this class for the source session. Generate the preview again.",
        409,
      );
    const name = `${row.firstName} ${row.lastName}`;
    if (o.decision === PromotionDecision.PROMOTED && !preview.targetClassGroup) {
      throw new PromotionError(
        `${name} cannot be promoted: ${preview.sourceClassGroup.name} has no next class. Graduate or repeat them instead.`,
      );
    }
    if (o.targetClassArmId) {
      const goesTo =
        o.decision === PromotionDecision.PROMOTED
          ? preview.targetClassGroup
          : o.decision === PromotionDecision.REPEATED
            ? preview.sourceClassGroup
            : null;
      const arm = armById.get(o.targetClassArmId);
      if (!goesTo) throw new PromotionError(`${name} is not moving to a class, so there is no arm to choose.`);
      if (!arm || arm.archivedAt || arm.classGroupId !== goesTo.id) {
        throw new PromotionError(`The arm chosen for ${name} is not an active arm of ${goesTo.name}.`);
      }
    }
  }
}

/**
 * Commits a promotion batch, updating student enrollments atomically with idempotency guards.
 */
export async function executePromotion(input: ExecutePromotionInput, actorId: string) {
  const {
    branchId,
    sourceSessionId,
    targetSessionId,
    sourceClassGroupId,
    targetClassGroupId,
    passMark = DEFAULT_PASS_MARK,
    overrides = [],
    notes,
  } = input;

  // Run a dry-run preview to resolve calculations and recommendations
  const preview = await previewPromotion({
    branchId,
    sourceSessionId,
    targetSessionId,
    sourceClassGroupId,
    passMark,
  });

  // The class the pupils move to is whatever the branch's progression says NOW; a screen that was opened before a class was added or archived must be refreshed, not obeyed.
  if (targetClassGroupId !== undefined && (targetClassGroupId ?? null) !== (preview.targetClassGroup?.id ?? null)) {
    throw new PromotionError("The class these pupils move to has changed since the preview was made. Generate the preview again.", 409);
  }

  const overrideMap = new Map(overrides.map((o) => [o.studentId, o]));
  await checkOverrides(branchId, preview, overrideMap);

  return await db.$transaction(async (tx) => {
    // 1. Create PromotionBatch header
    const batch = await tx.promotionBatch.create({
      data: {
        branchId,
        sourceSessionId,
        targetSessionId,
        sourceClassGroupId,
        targetClassGroupId: preview.targetClassGroup?.id ?? null,
        status: PromotionBatchStatus.COMMITTED,
        passMark,
        totalEvaluated: preview.students.length,
        totalPromoted: 0,
        totalRepeated: 0,
        totalGraduated: 0,
        executedById: actorId,
        notes: notes || null,
      },
    });

    let countPromoted = 0;
    let countRepeated = 0;
    let countGraduated = 0;

    // 2. Process each student
    for (const student of preview.students) {
      const override = overrideMap.get(student.studentId);
      const decision = override ? override.decision : student.recommendedDecision;
      const decisionMode = override ? DecisionMode.OVERRIDDEN : DecisionMode.AUTOMATIC;
      const overrideReason = override?.overrideReason || null;

      // Find current source enrollment
      const sourceEnrollment = await tx.studentEnrollment.findUnique({
        where: {
          studentId_sessionId: {
            studentId: student.studentId,
            sessionId: sourceSessionId,
          },
        },
      });

      // Already dealt with (by an earlier rollover of this class, or by hand): leave it alone, so running the same rollover twice changes nothing the second time.
      if (!sourceEnrollment || sourceEnrollment.status !== EnrollmentStatus.ACTIVE) {
        continue;
      }

      // Map decision to source enrollment status update
      const updatedSourceStatus: EnrollmentStatus =
        decision === PromotionDecision.PROMOTED
          ? EnrollmentStatus.PROMOTED
          : decision === PromotionDecision.GRADUATED
            ? EnrollmentStatus.ALUMNI
            : decision === PromotionDecision.WITHDRAWN
              ? EnrollmentStatus.WITHDRAWN
              : EnrollmentStatus.REPEATED;

      // A compare-and-set: only a still-ACTIVE enrolment is changed. Two rollovers of the same class that run at the same moment both see the pupils as active in their
      // preview; the row lock makes the second one find it already dealt with here (count 0), so each pupil is processed once.
      const moved = await tx.studentEnrollment.updateMany({
        where: { id: sourceEnrollment.id, status: EnrollmentStatus.ACTIVE },
        data: { status: updatedSourceStatus },
      });
      if (moved.count === 0) continue;

      if (decision === PromotionDecision.PROMOTED) countPromoted++;
      else if (decision === PromotionDecision.GRADUATED) countGraduated++;
      else if (decision !== PromotionDecision.WITHDRAWN) countRepeated++;

      let targetEnrollmentId: string | null = null;

      // Create or update target enrollment for promoted or repeating students
      if (decision === PromotionDecision.PROMOTED || decision === PromotionDecision.REPEATED) {
        const isPromoted = decision === PromotionDecision.PROMOTED;
        const targetClassGroup = isPromoted ? preview.targetClassGroup : preview.sourceClassGroup;

        // The arm follows the FINAL decision: the matching arm of the next class for a promotion, the pupil's own arm for a repeat. (The preview's arm belongs to the
        // advised decision, which an override may have changed.) An arm the admin chose wins; checkOverrides has already shown it belongs to the right class.
        const effectiveArmId =
          override?.targetClassArmId || (isPromoted ? resolveTargetArm(student.currentArmName, preview.targetArms) : student.currentArmId);

        if (targetClassGroup) {
          const targetArm = effectiveArmId
            ? await tx.classArm.findUnique({
                where: {
                  branchId_id: { branchId, id: effectiveArmId },
                },
              })
            : null;

          // Upsert target enrollment to ensure idempotency
          const targetEnrollment = await tx.studentEnrollment.upsert({
            where: {
              studentId_sessionId: {
                studentId: student.studentId,
                sessionId: targetSessionId,
              },
            },
            create: {
              studentId: student.studentId,
              branchId,
              sessionId: targetSessionId,
              className: targetClassGroup.name,
              arm: targetArm?.name || student.currentArmName,
              classArmId: targetArm?.id || null,
              status: EnrollmentStatus.ACTIVE,
            },
            update: {
              className: targetClassGroup.name,
              arm: targetArm?.name || student.currentArmName,
              classArmId: targetArm?.id || null,
              status: EnrollmentStatus.ACTIVE,
            },
          });

          targetEnrollmentId = targetEnrollment.id;
        }
      }

      // Record audit history
      await tx.promotionRecord.create({
        data: {
          batchId: batch.id,
          studentId: student.studentId,
          sourceEnrollmentId: sourceEnrollment.id,
          targetEnrollmentId,
          overallAverage: student.overallAverage,
          termAverages: student.termAverages,
          decision,
          decisionMode,
          overrideReason,
        },
      });
    }

    // 3. Update summary metrics on batch
    const updatedBatch = await tx.promotionBatch.update({
      where: { id: batch.id },
      data: {
        totalPromoted: countPromoted,
        totalRepeated: countRepeated,
        totalGraduated: countGraduated,
      },
      include: {
        sourceSession: { select: { id: true, label: true } },
        targetSession: { select: { id: true, label: true } },
        sourceClassGroup: { select: { id: true, name: true } },
        targetClassGroup: { select: { id: true, name: true } },
        executedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return updatedBatch;
  });
}

/**
 * Lists past promotion batches for a branch.
 */
export async function listPromotionBatches(branchId: string) {
  return await db.promotionBatch.findMany({
    where: { branchId },
    include: {
      sourceSession: { select: { id: true, label: true } },
      targetSession: { select: { id: true, label: true } },
      sourceClassGroup: { select: { id: true, name: true } },
      targetClassGroup: { select: { id: true, name: true } },
      executedBy: { select: { id: true, name: true, email: true } },
      _count: {
        select: { records: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves details of a specific promotion batch including evaluated student records.
 */
export async function getPromotionBatch(branchId: string, batchId: string) {
  const batch = await db.promotionBatch.findUnique({
    where: {
      branchId_id: { branchId, id: batchId },
    },
    include: {
      sourceSession: { select: { id: true, label: true } },
      targetSession: { select: { id: true, label: true } },
      sourceClassGroup: { select: { id: true, name: true } },
      targetClassGroup: { select: { id: true, name: true } },
      executedBy: { select: { id: true, name: true, email: true } },
      records: {
        include: {
          student: {
            select: { id: true, admissionNo: true, firstName: true, lastName: true },
          },
          sourceEnrollment: true,
          targetEnrollment: true,
        },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      },
    },
  });

  if (!batch) return null;
  // A record keeps the decision that was TAKEN, not the advice. The advice is a pure function of the stored average, the batch's pass mark and whether the batch had a class to
  // move to, so the history can show both without a second copy of it in the database.
  const terminal = batch.targetClassGroupId === null;
  return {
    ...batch,
    records: batch.records.map((record) => ({
      ...record,
      recommendedDecision: evaluatePromotionRecommendation(record.overallAverage, terminal, batch.passMark).decision,
    })),
  };
}
