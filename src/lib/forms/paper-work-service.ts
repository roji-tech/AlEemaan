import { prisma } from "@/lib/db";
import {
  FormAudienceKind,
  FormKind,
  FormStatus,
  TurnInStatus,
} from "@prisma/client";
import {
  PaperWorkInput,
  validatePaperWorkInput,
  determineTurnInStatus,
  canPupilRequestMarking,
  computeRollCallSummary,
  RollCallSummary,
} from "./paper-work";

export class PaperWorkError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "PaperWorkError";
  }
}

/**
 * Creates a new paper work assignment and auto-provisions the roll-call roster
 * for all active pupils in the targeted class groups.
 */
export async function createPaperWork(
  branchId: string,
  staffUserId: string,
  input: PaperWorkInput
) {
  const validation = validatePaperWorkInput(input);
  if (!validation.valid) {
    throw new PaperWorkError(validation.errors.join(" "), 400);
  }

  return await prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        branchId,
        kind: FormKind.PAPER_WORK,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        status: FormStatus.PUBLISHED,
        opensAt: input.opensAt ? new Date(input.opensAt) : new Date(),
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        maxDurationMinutes: input.maxDurationMinutes || null,
        createdById: staffUserId,
      },
    });

    await tx.formAudience.create({
      data: {
        branchId,
        formId: form.id,
        kind: FormAudienceKind.MEMBERS,
        roles: ["STUDENT"] as never,
        classGroupIds: input.classGroupIds as never,
      },
    });

    // Query all active enrolled students in targeted class groups
    const enrollments = await tx.studentEnrollment.findMany({
      where: {
        branchId,
        status: "ACTIVE",
        classArm: {
          classGroupId: { in: input.classGroupIds },
        },
      },
      select: {
        studentId: true,
      },
      distinct: ["studentId"],
    });

    if (enrollments.length > 0) {
      await tx.formTurnIn.createMany({
        data: enrollments.map((e) => ({
          branchId,
          formId: form.id,
          studentId: e.studentId,
          status: TurnInStatus.PENDING,
        })),
        skipDuplicates: true,
      });

      // Audit initial roster provisioning
      const createdTurnIns = await tx.formTurnIn.findMany({
        where: { branchId, formId: form.id },
        select: { id: true, studentId: true },
      });

      if (createdTurnIns.length > 0) {
        await tx.formTurnInAudit.createMany({
          data: createdTurnIns.map((t) => ({
            branchId,
            turnInId: t.id,
            formId: form.id,
            studentId: t.studentId,
            status: TurnInStatus.PENDING,
            action: "ROSTER_PROVISIONED",
            actorUserId: staffUserId,
          })),
        });
      }
    }

    return {
      ...form,
      rosterCount: enrollments.length,
    };
  });
}

/**
 * Lists paper work assignments for staff members with roll-call counters.
 */
export async function listPaperWorkForStaff(
  branchId: string,
  options?: { classGroupId?: string; status?: FormStatus }
) {
  const forms = await prisma.form.findMany({
    where: {
      branchId,
      kind: FormKind.PAPER_WORK,
      status: options?.status,
    },
    include: {
      audiences: true,
      turnIns: {
        select: {
          status: true,
          requestedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = options?.classGroupId
    ? forms.filter((f) => {
        const cIds = (f.audiences[0]?.classGroupIds as string[]) || [];
        return Array.isArray(cIds) && cIds.includes(options.classGroupId!);
      })
    : forms;

  return filtered.map((form) => {
    const summary: RollCallSummary = computeRollCallSummary(form.turnIns);
    return {
      id: form.id,
      branchId: form.branchId,
      kind: form.kind,
      title: form.title,
      instructions: form.instructions,
      status: form.status,
      opensAt: form.opensAt,
      closesAt: form.closesAt,
      maxDurationMinutes: form.maxDurationMinutes,
      createdById: form.createdById,
      closedById: form.closedById,
      closedAt: form.closedAt,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
      audiences: form.audiences,
      summary,
    };
  });
}

/**
 * Retrieves full paper work details and student roll call roster for a teacher.
 */
export async function getPaperWorkForStaff(branchId: string, formId: string) {
  const form = await prisma.form.findFirst({
    where: {
      branchId,
      id: formId,
      kind: FormKind.PAPER_WORK,
    },
    include: {
      audiences: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      closedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  const turnIns = await prisma.formTurnIn.findMany({
    where: { branchId, formId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          admissionNo: true,
        },
      },
      markedBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: [
      { student: { lastName: "asc" } },
      { student: { firstName: "asc" } },
    ],
  });

  const summary = computeRollCallSummary(turnIns);

  return {
    form,
    summary,
    turnIns,
  };
}

/**
 * Updates a single student's paper work roll call status.
 */
export async function updateTurnIn(
  branchId: string,
  staffUserId: string,
  formId: string,
  studentId: string,
  data: {
    status: TurnInStatus;
    note?: string | null;
  }
) {
  const form = await prisma.form.findFirst({
    where: { branchId, id: formId, kind: FormKind.PAPER_WORK },
    select: { id: true, closesAt: true },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  const turnIn = await prisma.formTurnIn.findFirst({
    where: { branchId, formId, studentId },
  });

  if (!turnIn) {
    throw new PaperWorkError("Student turn-in record not found.", 404);
  }

  const evaluatedStatus = determineTurnInStatus(form, data.status);

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.formTurnIn.update({
      where: {
        branchId_id: {
          branchId,
          id: turnIn.id,
        },
      },
      data: {
        status: evaluatedStatus,
        markedById: staffUserId,
        markedAt: new Date(),
        note: data.note !== undefined ? data.note : turnIn.note,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
          },
        },
        markedBy: {
          select: { id: true, name: true },
        },
      },
    });

    await tx.formTurnInAudit.create({
      data: {
        branchId,
        turnInId: turnIn.id,
        formId,
        studentId,
        status: evaluatedStatus,
        action: "STATUS_UPDATED",
        actorUserId: staffUserId,
        note: data.note || null,
      },
    });

    return updated;
  });
}

/**
 * Batch updates roll call status for multiple students on a paper work assignment.
 */
export async function batchUpdateTurnIns(
  branchId: string,
  staffUserId: string,
  formId: string,
  updates: Array<{
    studentId: string;
    status: TurnInStatus;
    note?: string | null;
  }>
) {
  const form = await prisma.form.findFirst({
    where: { branchId, id: formId, kind: FormKind.PAPER_WORK },
    select: { id: true, closesAt: true },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  return await prisma.$transaction(async (tx) => {
    let updatedCount = 0;

    for (const item of updates) {
      const turnIn = await tx.formTurnIn.findFirst({
        where: { branchId, formId, studentId: item.studentId },
      });

      if (!turnIn) continue;

      const evaluatedStatus = determineTurnInStatus(form, item.status);

      await tx.formTurnIn.update({
        where: {
          branchId_id: {
            branchId,
            id: turnIn.id,
          },
        },
        data: {
          status: evaluatedStatus,
          markedById: staffUserId,
          markedAt: new Date(),
          note: item.note !== undefined ? item.note : turnIn.note,
        },
      });

      await tx.formTurnInAudit.create({
        data: {
          branchId,
          turnInId: turnIn.id,
          formId,
          studentId: item.studentId,
          status: evaluatedStatus,
          action: "BATCH_STATUS_UPDATED",
          actorUserId: staffUserId,
          note: item.note || null,
        },
      });

      updatedCount++;
    }

    return { updatedCount };
  });
}

/**
 * Synchronizes newly enrolled pupils into the paper work roll call roster.
 */
export async function syncRosterForPaperWork(branchId: string, formId: string) {
  const form = await prisma.form.findFirst({
    where: { branchId, id: formId, kind: FormKind.PAPER_WORK },
    include: { audiences: true },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  const rawClassGroupIds = form.audiences[0]?.classGroupIds;
  const classGroupIds = Array.isArray(rawClassGroupIds)
    ? (rawClassGroupIds as string[])
    : [];

  if (classGroupIds.length === 0) {
    return { addedCount: 0 };
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      branchId,
      status: "ACTIVE",
      classArm: {
        classGroupId: { in: classGroupIds },
      },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  const existingTurnIns = await prisma.formTurnIn.findMany({
    where: { branchId, formId },
    select: { studentId: true },
  });

  const existingSet = new Set(existingTurnIns.map((t) => t.studentId));
  const missingStudents = enrollments.filter((e) => !existingSet.has(e.studentId));

  if (missingStudents.length === 0) {
    return { addedCount: 0 };
  }

  await prisma.formTurnIn.createMany({
    data: missingStudents.map((e) => ({
      branchId,
      formId,
      studentId: e.studentId,
      status: TurnInStatus.PENDING,
    })),
    skipDuplicates: true,
  });

  return { addedCount: missingStudents.length };
}

/**
 * Closes paper work manually by teacher.
 */
export async function closePaperWork(
  branchId: string,
  staffUserId: string,
  formId: string
) {
  const form = await prisma.form.findFirst({
    where: { branchId, id: formId, kind: FormKind.PAPER_WORK },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  return await prisma.form.update({
    where: {
      branchId_id: {
        branchId,
        id: formId,
      },
    },
    data: {
      status: FormStatus.CLOSED,
      closedById: staffUserId,
      closedAt: new Date(),
    },
  });
}

/**
 * Lists available paper work assignments for a pupil in their student portal.
 */
export async function listAvailablePaperWorkForPupil(
  branchId: string,
  studentId: string
) {
  // Resolve pupil's active class group
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      branchId,
      studentId,
      status: "ACTIVE",
    },
    orderBy: { enrolledAt: "desc" },
    include: { classArm: { select: { classGroupId: true } } },
  });

  const pupilClassGroupId = enrollment?.classArm?.classGroupId ?? null;
  if (!pupilClassGroupId) {
    return [];
  }

  const forms = await prisma.form.findMany({
    where: {
      branchId,
      kind: FormKind.PAPER_WORK,
      status: { in: [FormStatus.PUBLISHED, FormStatus.CLOSED] },
    },
    include: {
      audiences: true,
      turnIns: {
        where: { studentId },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const available = forms.filter((f) => {
    const audience = f.audiences[0];
    if (!audience) return true;
    const cIds = (audience.classGroupIds as string[]) || [];
    return Array.isArray(cIds) && cIds.includes(pupilClassGroupId);
  });

  return available.map((form) => {
    const turnIn = form.turnIns[0] || null;
    return {
      id: form.id,
      title: form.title,
      instructions: form.instructions,
      status: form.status,
      opensAt: form.opensAt,
      closesAt: form.closesAt,
      maxDurationMinutes: form.maxDurationMinutes,
      myTurnIn: turnIn
        ? {
            status: turnIn.status,
            requestedAt: turnIn.requestedAt,
            markedAt: turnIn.markedAt,
          }
        : null,
    };
  });
}

/**
 * Gets details of a single paper work assignment for a pupil.
 */
export async function getPaperWorkForPupil(
  branchId: string,
  studentId: string,
  formId: string
) {
  const form = await prisma.form.findFirst({
    where: {
      branchId,
      id: formId,
      kind: FormKind.PAPER_WORK,
    },
    include: {
      audiences: true,
      turnIns: {
        where: { studentId },
        take: 1,
      },
    },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  const turnIn = form.turnIns[0];
  if (!turnIn) {
    throw new PaperWorkError("You are not on the roll call for this paper work.", 403);
  }

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    status: form.status,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    maxDurationMinutes: form.maxDurationMinutes,
    myTurnIn: {
      status: turnIn.status,
      requestedAt: turnIn.requestedAt,
      markedAt: turnIn.markedAt,
      note: turnIn.note,
    },
  };
}

/**
 * Pupil requests marking on a pending paper work assignment.
 */
export async function requestMarkingForPupil(
  branchId: string,
  studentId: string,
  formId: string
) {
  const form = await prisma.form.findFirst({
    where: {
      branchId,
      id: formId,
      kind: FormKind.PAPER_WORK,
    },
    select: {
      id: true,
      status: true,
      opensAt: true,
      closesAt: true,
      closedAt: true,
    },
  });

  if (!form) {
    throw new PaperWorkError("Paper work not found.", 404);
  }

  const turnIn = await prisma.formTurnIn.findFirst({
    where: { branchId, formId, studentId },
  });

  if (!turnIn) {
    throw new PaperWorkError("You are not enrolled on this paper work roll call.", 403);
  }

  const check = canPupilRequestMarking(turnIn, form);
  if (!check.allowed) {
    throw new PaperWorkError(check.reason || "Marking request not allowed.", 400);
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.formTurnIn.update({
      where: {
        branchId_id: {
          branchId,
          id: turnIn.id,
        },
      },
      data: {
        requestedAt: new Date(),
      },
    });

    await tx.formTurnInAudit.create({
      data: {
        branchId,
        turnInId: turnIn.id,
        formId,
        studentId,
        status: turnIn.status,
        action: "MARKING_REQUESTED",
        actorUserId: null,
      },
    });

    return updated;
  });
}
