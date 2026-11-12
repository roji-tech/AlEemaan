import { Prisma, StandingEventAction, StandingScope, StandingSubject } from "@prisma/client";
import type { ErrorDetail } from "@/lib/api/envelope";
import { dayOf, type StandingAction } from "./rules";

// Shared by the standing services: the result type, the history write, and the day.

export type Failure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string; details?: ErrorDetail[] };
export type Result<T> = { ok: true; data: T } | Failure;
export const refuse = (status: Failure["status"], code: string, message: string, details?: ErrorDetail[]): Failure => ({
  ok: false,
  status,
  code,
  message,
  details,
});
export const done = <T>(data: T): Result<T> => ({ ok: true, data });

/// A calendar day as a Date at UTC midnight (what a `@db.Date` column holds).
export const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
export const today = (): string => dayOf(new Date());

const EVENT_ACTION: Record<StandingAction, StandingEventAction> = {
  SUSPEND: StandingEventAction.SUSPENDED,
  LIFT: StandingEventAction.LIFTED,
  EXPEL: StandingEventAction.EXPELLED,
  TERMINATE: StandingEventAction.TERMINATED,
  REINSTATE: StandingEventAction.REINSTATED,
};

export type EventInput = {
  subject: StandingSubject;
  studentId?: string | null;
  staffRecordId?: string | null;
  membershipId?: string | null;
  /// A person of a program who has no school record (subject PARTICIPANT).
  participantId?: string | null;
  userId?: string | null;
  branchId: string;
  action: StandingAction;
  scope?: StandingScope;
  reason: string;
  endsOn?: string | null;
  decidedByUserId: string;
};

/// The only place a StandingEvent is written (the database refuses every update and delete of one). Also writes the AuditLog row, in the same transaction, as members already do.
export async function writeEvent(
  tx: Prisma.TransactionClient,
  event: EventInput,
  audit: { targetType: string; targetId: string; before: Prisma.InputJsonValue; after: Prisma.InputJsonValue },
) {
  const start = today();
  await tx.standingEvent.create({
    data: {
      subject: event.subject,
      studentId: event.studentId ?? null,
      staffRecordId: event.staffRecordId ?? null,
      membershipId: event.membershipId ?? null,
      participantId: event.participantId ?? null,
      userId: event.userId ?? null,
      branchId: event.branchId,
      action: EVENT_ACTION[event.action],
      scope: event.scope ?? StandingScope.BRANCH,
      reason: event.reason,
      startsOn: asDate(start),
      endsOn: event.endsOn ? asDate(event.endsOn) : null,
      decidedByUserId: event.decidedByUserId,
    },
  });
  await tx.auditLog.create({
    data: {
      actorUserId: event.decidedByUserId,
      action: `${event.subject}_${EVENT_ACTION[event.action]}`,
      targetType: audit.targetType,
      targetId: audit.targetId,
      beforeValue: audit.before,
      afterValue: audit.after,
      reason: event.reason,
    },
  });
}

export type HistoryEntry = {
  id: string;
  action: StandingEventAction;
  scope: StandingScope;
  reason: string;
  startsOn: string;
  endsOn: string | null;
  decidedBy: string;
  at: string;
};

export async function namesOf(tx: Pick<Prisma.TransactionClient, "user">, ids: string[]): Promise<Map<string, string>> {
  const users = await tx.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Someone"]));
}
