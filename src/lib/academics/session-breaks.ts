import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "./sessions";
import { validateBreak, type BreakDates } from "./session-break-rules";

// Breaks inside a term or semester (task 0098), the database side. The rules are the pure ones in session-break-rules.ts, the same the form uses. Nothing is deleted: a removed break is archived.

export const breakBodySchema = z.strictObject({
  label: z.string().max(200),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
});
export type BreakBody = z.infer<typeof breakBodySchema>;

const day = (value: Date): string => value.toISOString().slice(0, 10);
const at = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const asDates = (b: { label: string; startDate: Date; endDate: Date }): BreakDates => ({
  label: b.label,
  startDate: day(b.startDate),
  endDate: day(b.endDate),
});

/// The breaks of these periods that are still in force, by period. Read only where breaks are shown (the sessions list and a session's detail), so a screen that does not show them never
/// depends on the table.
export async function attachBreaks<T extends { periods: { id: string }[] }>(sessions: T[]) {
  const ids = sessions.flatMap((s) => s.periods.map((p) => p.id));
  const rows = ids.length
    ? await prisma.academicBreak.findMany({
        where: { periodId: { in: ids }, archivedAt: null },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const by = new Map<string, typeof rows>();
  for (const row of rows) by.set(row.periodId, [...(by.get(row.periodId) ?? []), row]);
  return sessions.map((s) => ({ ...s, periods: s.periods.map((p) => ({ ...p, breaks: by.get(p.id) ?? [] })) }));
}

/// A period, its session's days (a period saved without a last day falls back to the session's) and its breaks in force; `null` when it does not exist or is archived.
async function loadPeriod(periodId: string) {
  const period = await prisma.academicPeriod.findFirst({
    where: { id: periodId, archivedAt: null },
    include: { session: { select: { id: true, label: true, endDate: true } } },
  });
  if (!period) return null;
  const breaks = await prisma.academicBreak.findMany({ where: { periodId, archivedAt: null }, orderBy: { startDate: "asc" } });
  return { period, breaks, dates: { startDate: day(period.startDate), endDate: day(period.endDate ?? period.session.endDate) } };
}

/// The branch a period or a break belongs to (for the route's authority check); `null` when unknown.
export async function branchOfPeriod(periodId: string): Promise<string | null> {
  return (
    (await prisma.academicPeriod.findFirst({ where: { id: periodId, archivedAt: null }, select: { branchId: true } }))?.branchId ?? null
  );
}
export async function branchOfBreak(breakId: string): Promise<string | null> {
  return (await prisma.academicBreak.findFirst({ where: { id: breakId, archivedAt: null }, select: { branchId: true } }))?.branchId ?? null;
}
export async function getBreak(breakId: string) {
  return prisma.academicBreak.findFirst({ where: { id: breakId, archivedAt: null } });
}

export async function createBreak(periodId: string, input: BreakBody) {
  const data = breakBodySchema.parse(input);
  const loaded = await loadPeriod(periodId);
  if (!loaded) throw new DomainError("That term or semester was not found.");
  const problems = validateBreak(loaded.dates, loaded.breaks.map(asDates), data, loaded.period.label);
  if (problems.length > 0) throw new DomainError(problems[0].message);
  return prisma.academicBreak.create({
    data: {
      branchId: loaded.period.branchId,
      periodId,
      label: data.label.trim(),
      startDate: at(data.startDate),
      endDate: at(data.endDate),
    },
  });
}

export async function updateBreak(breakId: string, input: BreakBody) {
  const data = breakBodySchema.parse(input);
  const current = await getBreak(breakId);
  if (!current) throw new DomainError("That break was not found.");
  const loaded = await loadPeriod(current.periodId);
  if (!loaded) throw new DomainError("That term or semester was not found.");
  const others = loaded.breaks.filter((b) => b.id !== breakId).map(asDates);
  const problems = validateBreak(loaded.dates, others, data, loaded.period.label);
  if (problems.length > 0) throw new DomainError(problems[0].message);
  return prisma.academicBreak.update({
    where: { id: breakId },
    data: { label: data.label.trim(), startDate: at(data.startDate), endDate: at(data.endDate) },
  });
}

export async function removeBreak(breakId: string) {
  const current = await getBreak(breakId);
  if (!current) throw new DomainError("That break was not found.");
  return prisma.academicBreak.update({ where: { id: breakId }, data: { archivedAt: new Date() } });
}

/// The break, the period and the session it sits in, for the announcement text and the audit entry.
export async function describeBreak(breakId: string) {
  return prisma.academicBreak.findUnique({
    where: { id: breakId },
    include: { period: { select: { label: true, session: { select: { label: true } } } }, branch: { select: { name: true } } },
  });
}
