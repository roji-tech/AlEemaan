import { z } from "zod";
import { prisma } from "@/lib/db";
import { SessionStatus, PeriodKind } from "@prisma/client";
import { breaksOutside } from "./session-break-rules";
import { MAX_PERIODS, defaultSchedule, isDay, periodLabel, usualCount, validateSchedule, type PeriodDates } from "./session-schedule";

/// A refusal whose message is written FOR the caller (a missing branch, a duplicate label). Routes may return its text; any other exception's text is
/// never returned (ISS-0006) - it can name tables, columns and values.
export class DomainError extends Error {}

export const createSessionSchema = z
  .object({
    branchId: z.string().min(1, "Branch ID is required"),
    label: z.string().trim().min(4, "Session label must be at least 4 characters").max(30),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status: z.nativeEnum(SessionStatus).optional().default(SessionStatus.PLANNED),
    termsCount: z.number().int().min(1).max(4).optional(),
    /// Terms or semesters (task 0097). Terms by default, as before.
    kind: z.nativeEnum(PeriodKind).optional().default(PeriodKind.TERM),
    /// The first and last day of each period, in order (task 0097). Left out, the session's days are shared equally between the periods, as before.
    periods: z
      .array(z.strictObject({ startDate: z.string().max(10), endDate: z.string().max(10) }))
      .min(1)
      .max(MAX_PERIODS)
      .optional(),
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

/// A stored calendar day (midnight UTC) as the text "YYYY-MM-DD".
const day = (value: Date): string => value.toISOString().slice(0, 10);

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
    throw new DomainError(`Branch with ID "${data.branchId}" does not exist.`);
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
    throw new DomainError(`An academic session with label "${data.label}" already exists for branch "${branch.name}".`);
  }

  // 3. The periods: how many (the person's choice, else the branch's usual: Arabic 2, others 3), what they are called (terms or semesters), and their dates (given, else shared equally).
  const kind = data.kind;
  const given = data.periods;
  const numTerms = given ? given.length : (data.termsCount ?? usualCount(branch.name));
  if (given && data.termsCount !== undefined && data.termsCount !== given.length)
    throw new DomainError("The number of periods does not match the dates given.");
  if (kind === PeriodKind.SEMESTER && numTerms !== 2) throw new DomainError("A session of semesters has two semesters.");
  const sessionDays: PeriodDates = { startDate: day(data.startDate), endDate: day(data.endDate) };
  const dates = given ?? defaultSchedule(sessionDays.startDate, sessionDays.endDate, numTerms);
  const names = dates.map((_, i) => periodLabel(kind, i + 1));
  const problems = validateSchedule(sessionDays, dates, names);
  if (problems.length > 0) throw new DomainError(problems[0].message);

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

    for (const [i, d] of dates.entries()) {
      await tx.academicPeriod.create({
        data: {
          branchId: data.branchId,
          sessionId: session.id,
          kind,
          ordinal: i + 1,
          label: names[i],
          startDate: new Date(`${d.startDate}T00:00:00.000Z`),
          endDate: new Date(`${d.endDate}T00:00:00.000Z`),
          isCurrent: i === 0 && data.status === SessionStatus.ACTIVE,
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
    throw new DomainError(`Academic session with ID "${id}" not found.`);
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
    throw new DomainError(`Academic period "${periodId}" not found.`);
  }
  if (period.branchId !== branchId) {
    throw new DomainError(`Period does not belong to branch "${branchId}".`);
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

export const updateScheduleSchema = z.strictObject({
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  periods: z
    .array(z.strictObject({ id: z.string().min(1).max(64), startDate: z.string().max(10), endDate: z.string().max(10) }))
    .min(1)
    .max(MAX_PERIODS),
});
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

/// Sets the dates of a session and of ALL its terms or semesters at once (task 0097), so the whole is checked as one: the session ends after it starts, each period lies inside it, in order,
/// without overlap. Every period of the session must be named exactly once (a period cannot be added or removed here, nor can another session's be touched). Nothing is partly saved: one
/// transaction. The labels, kind and which term is current are not changed.
export async function updateSchedule(id: string, input: UpdateScheduleInput) {
  const data = updateScheduleSchema.parse(input);
  const session = await prisma.academicSession.findUnique({
    where: { id },
    include: { periods: { where: { archivedAt: null }, orderBy: { ordinal: "asc" } } },
  });
  if (!session) throw new DomainError(`Academic session "${id}" not found.`);

  const ids = session.periods.map((p) => p.id);
  const sent = data.periods.map((p) => p.id);
  if (sent.length !== ids.length || new Set(sent).size !== sent.length || !sent.every((x) => ids.includes(x)))
    throw new DomainError("Send the dates of every term or semester of this session, each once.");

  // In the order of the periods, whatever order they were sent in.
  const byId = new Map(data.periods.map((p) => [p.id, p]));
  const ordered = session.periods.map((p) => byId.get(p.id)!);
  const problems = validateSchedule(
    { startDate: data.startDate, endDate: data.endDate },
    ordered,
    session.periods.map((p) => p.label),
  );
  if (problems.length > 0) throw new DomainError(problems[0].message);
  if (![data.startDate, data.endDate, ...ordered.flatMap((p) => [p.startDate, p.endDate])].every(isDay))
    throw new DomainError("Every date must be a calendar day.");

  // A break is never left outside its term (task 0098): moving a term's days past one is refused, naming it. Read here, not in the transaction: breaks are only added or removed by an administrator of this branch.
  const kept = await prisma.academicBreak.findMany({ where: { periodId: { in: ids }, archivedAt: null } });
  for (const p of session.periods) {
    const dates = byId.get(p.id)!;
    const outside = breaksOutside(
      dates,
      kept.filter((b) => b.periodId === p.id).map((b) => ({ label: b.label, startDate: day(b.startDate), endDate: day(b.endDate) })),
    );
    if (outside.length > 0)
      throw new DomainError(
        `${outside[0].label} (${outside[0].startDate} to ${outside[0].endDate}) would fall outside ${p.label}. Move or remove the break first.`,
      );
  }

  const at = (d: string) => new Date(`${d}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    await tx.academicSession.update({ where: { id }, data: { startDate: at(data.startDate), endDate: at(data.endDate) } });
    for (const p of ordered)
      await tx.academicPeriod.update({ where: { id: p.id }, data: { startDate: at(p.startDate), endDate: at(p.endDate) } });
    return tx.academicSession.findUnique({
      where: { id },
      include: { branch: { select: { id: true, name: true } }, periods: { where: { archivedAt: null }, orderBy: { ordinal: "asc" } } },
    });
  });
}
