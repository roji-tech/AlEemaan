import { z } from "zod";
import { prisma } from "@/lib/db";
import { SessionStatus, PeriodKind } from "@prisma/client";

export const createSessionSchema = z
  .object({
    branchId: z.string().min(1, "Branch ID is required"),
    label: z.string().trim().min(4, "Session label must be at least 4 characters").max(30),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status: z.nativeEnum(SessionStatus).optional().default(SessionStatus.PLANNED),
    termsCount: z.number().int().min(1).max(4).optional(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "Session end date must be after start date",
    path: ["endDate"],
  });

export const updateSessionSchema = z
  .object({
    label: z.string().trim().min(4).max(30).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    status: z.nativeEnum(SessionStatus).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate > data.startDate;
      }
      return true;
    },
    {
      message: "Session end date must be after start date",
      path: ["endDate"],
    },
  );

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export async function listSessions(branchId?: string) {
  return prisma.academicSession.findMany({
    where: branchId ? { branchId, archivedAt: null } : { archivedAt: null },
    include: {
      branch: { select: { id: true, name: true } },
      periods: {
        where: { archivedAt: null },
        orderBy: { ordinal: "asc" },
      },
    },
    orderBy: { startDate: "desc" },
  });
}

export async function getSession(id: string) {
  return prisma.academicSession.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true } },
      periods: {
        where: { archivedAt: null },
        orderBy: { ordinal: "asc" },
      },
    },
  });
}

export async function createSession(input: CreateSessionInput) {
  const data = createSessionSchema.parse(input);

  // 1. Verify branch exists
  const branch = await prisma.branch.findUnique({
    where: { id: data.branchId },
  });
  if (!branch) {
    throw new Error(`Branch with ID "${data.branchId}" does not exist.`);
  }

  // 2. Check label uniqueness per branch
  const existing = await prisma.academicSession.findUnique({
    where: {
      branchId_label: {
        branchId: data.branchId,
        label: data.label,
      },
    },
  });
  if (existing) {
    throw new Error(`An academic session with label "${data.label}" already exists for branch "${branch.name}".`);
  }

  // 3. Determine number of terms based on branch convention (Arabic = 2 terms, English = 3 terms)
  const isArabicBranch = branch.name.toLowerCase().includes("arabic");
  const defaultTerms = isArabicBranch ? 2 : 3;
  const numTerms = data.termsCount ?? defaultTerms;

  // 4. Compute default date windows for each term
  const startMs = data.startDate.getTime();
  const endMs = data.endDate.getTime();
  const durationMs = endMs - startMs;
  const termDurationMs = Math.floor(durationMs / numTerms);

  const termOrdinals = Array.from({ length: numTerms }, (_, i) => i + 1);
  const termLabels = ["1st Term", "2nd Term", "3rd Term", "4th Term"];

  return prisma.$transaction(async (tx) => {
    // If activating this session, deactivate other sessions on this branch
    if (data.status === SessionStatus.ACTIVE) {
      await tx.academicSession.updateMany({
        where: { branchId: data.branchId, status: SessionStatus.ACTIVE },
        data: { status: SessionStatus.CLOSED },
      });
    }

    const session = await tx.academicSession.create({
      data: {
        branchId: data.branchId,
        label: data.label,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
      },
    });

    for (const ord of termOrdinals) {
      const termStart = new Date(startMs + (ord - 1) * termDurationMs);
      const termEnd = ord === numTerms ? data.endDate : new Date(startMs + ord * termDurationMs - 86400000); // 1 day before next term
      const label = termLabels[ord - 1] || `Term ${ord}`;

      await tx.academicPeriod.create({
        data: {
          branchId: data.branchId,
          sessionId: session.id,
          kind: PeriodKind.TERM,
          ordinal: ord,
          label,
          startDate: termStart,
          endDate: termEnd,
          isCurrent: ord === 1 && data.status === SessionStatus.ACTIVE,
        },
      });
    }

    return tx.academicSession.findUnique({
      where: { id: session.id },
      include: {
        branch: { select: { id: true, name: true } },
        periods: { orderBy: { ordinal: "asc" } },
      },
    });
  });
}

export async function updateSession(id: string, input: UpdateSessionInput) {
  const data = updateSessionSchema.parse(input);

  const session = await prisma.academicSession.findUnique({
    where: { id },
  });
  if (!session) {
    throw new Error(`Academic session with ID "${id}" not found.`);
  }

  return prisma.$transaction(async (tx) => {
    // If activating, close existing active session for this branch
    if (data.status === SessionStatus.ACTIVE && session.status !== SessionStatus.ACTIVE) {
      await tx.academicSession.updateMany({
        where: {
          branchId: session.branchId,
          status: SessionStatus.ACTIVE,
          id: { not: id },
        },
        data: { status: SessionStatus.CLOSED },
      });
    }

    const updated = await tx.academicSession.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, name: true } },
        periods: { orderBy: { ordinal: "asc" } },
      },
    });

    return updated;
  });
}

export async function setCurrentPeriod(branchId: string, periodId: string) {
  const period = await prisma.academicPeriod.findUnique({
    where: { id: periodId },
    include: { session: true },
  });

  if (!period) {
    throw new Error(`Academic period "${periodId}" not found.`);
  }
  if (period.branchId !== branchId) {
    throw new Error(`Period does not belong to branch "${branchId}".`);
  }

  return prisma.$transaction(async (tx) => {
    // Reset all periods in this branch to isCurrent: false
    await tx.academicPeriod.updateMany({
      where: { branchId },
      data: { isCurrent: false },
    });

    // Set target period to isCurrent: true
    const updated = await tx.academicPeriod.update({
      where: { id: periodId },
      data: { isCurrent: true },
      include: { session: true },
    });

    // Ensure parent session is ACTIVE
    if (period.session.status !== SessionStatus.ACTIVE) {
      await tx.academicSession.updateMany({
        where: {
          branchId,
          status: SessionStatus.ACTIVE,
          id: { not: period.sessionId },
        },
        data: { status: SessionStatus.CLOSED },
      });

      await tx.academicSession.update({
        where: { id: period.sessionId },
        data: { status: SessionStatus.ACTIVE },
      });
    }

    return updated;
  });
}
