import { EnrollmentStatus, SessionStatus, StandingState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, mayAdminister } from "@/lib/auth/branch-access";
import { asDate, done, namesOf, refuse, today, writeEvent, type HistoryEntry, type Result } from "./common";
import { dayOf, effectiveStanding, mayAct, standingAfter, suspensionEndProblem, type StandingAction } from "./rules";
import { branchAdminMaySuspend } from "./settings-service";

// Standing of a pupil (task 0045, section 4.3): suspended (until a date, or until lifted) or expelled. Suspension changes nothing on the enrolment; expulsion sets the pupil's
// ACTIVE enrolment to EXPELLED, which takes them off every list that selects pupils by ACTIVE enrolment (attendance rolls, invoice generation, result sheets, promotion).

export type StudentAction = Extract<StandingAction, "SUSPEND" | "LIFT" | "EXPEL" | "REINSTATE">;
export type StudentChange = { reason: string; until?: string | null };

const NOUN: Record<StudentAction, string> = { SUSPEND: "suspend", LIFT: "lift the suspension of", EXPEL: "expel", REINSTATE: "reinstate" };
const AUDIT_ONLY = (action: StudentAction) =>
  action === "SUSPEND" ? "suspended" : action === "LIFT" ? "not suspended" : action === "EXPEL" ? "already expelled" : "not expelled";

export async function changeStudentStanding(
  actorUserId: string,
  studentId: string,
  action: StudentAction,
  input: StudentChange,
): Promise<Result<{ standing: string; until: string | null }>> {
  const scope = await adminScope(actorUserId);
  const known = await prisma.studentRecord.findUnique({ where: { id: studentId }, select: { branchId: true } });
  // A pupil of a branch the person does not administer answers like one that does not exist.
  if (!known || !mayAdminister(scope, known.branchId)) return refuse(404, "NOT_FOUND", "That student was not found.");

  const refusal = mayAct(
    action,
    { userId: actorUserId, superAdmin: scope.superAdmin, adminOfBranch: true },
    { scope: "BRANCH", branchAdminMaySuspend: await branchAdminMaySuspend(known.branchId) },
  );
  if (refusal)
    return refuse(
      403,
      "FORBIDDEN",
      `Only a super admin can ${NOUN[action]} a student${action === "SUSPEND" || action === "LIFT" ? " here: the school has taken that from branch administrators" : ""}.`,
    );

  const until = action === "SUSPEND" ? (input.until ?? null) : null;
  if (action === "SUSPEND") {
    const problem = suspensionEndProblem(until, today());
    if (problem) return refuse(400, "VALIDATION", problem, [{ path: "body.until", message: problem }]);
  }

  return prisma.$transaction(async (tx): Promise<Result<{ standing: string; until: string | null }>> => {
    await tx.$queryRaw`SELECT "id" FROM "StudentRecord" WHERE "id" = ${studentId} FOR UPDATE`;
    const student = await tx.studentRecord.findUniqueOrThrow({ where: { id: studentId } });
    if (student.archivedAt) return refuse(409, "ARCHIVED", "Restore this student first: an archived student's standing can't be changed.");
    const storedUntil = student.standingUntil ? dayOf(student.standingUntil) : null;
    // Lifting works on what is stored (a suspension whose end date has passed can still be cleared); everything else on what applies today.
    const current = action === "LIFT" ? student.standing : effectiveStanding(student.standing, storedUntil, today());
    const next = standingAfter(action, "STUDENT", current) as StandingState | null;
    if (!next) return refuse(409, "NOT_APPLICABLE", `That doesn't apply: this student is ${AUDIT_ONLY(action)}.`);

    await tx.studentRecord.update({
      where: { id: studentId },
      data: { standing: next, standingUntil: next === StandingState.SUSPENDED && until ? asDate(until) : null },
    });
    if (action === "EXPEL") {
      await tx.studentEnrollment.updateMany({
        where: { studentId, status: EnrollmentStatus.ACTIVE },
        data: { status: EnrollmentStatus.EXPELLED },
      });
    } else if (action === "REINSTATE") {
      const session = await tx.academicSession.findFirst({
        where: { branchId: student.branchId, status: SessionStatus.ACTIVE, archivedAt: null },
        select: { id: true },
      });
      // Back on the roll only in the session that is running; otherwise they are enrolled the normal way.
      if (session)
        await tx.studentEnrollment.updateMany({
          where: { studentId, sessionId: session.id, status: EnrollmentStatus.EXPELLED },
          data: { status: EnrollmentStatus.ACTIVE },
        });
    }
    await writeEvent(
      tx,
      {
        subject: "STUDENT",
        studentId,
        branchId: student.branchId,
        action,
        reason: input.reason,
        endsOn: until,
        decidedByUserId: actorUserId,
      },
      {
        targetType: "StudentRecord",
        targetId: studentId,
        before: { standing: student.standing, until: storedUntil },
        after: { standing: next, until },
      },
    );
    return done({ standing: next, until });
  });
}

export async function studentStandingHistory(
  actorUserId: string,
  studentId: string,
): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> {
  const scope = await adminScope(actorUserId);
  const student = await prisma.studentRecord.findUnique({
    where: { id: studentId },
    select: { branchId: true, standing: true, standingUntil: true },
  });
  if (!student || !mayAdminister(scope, student.branchId)) return refuse(404, "NOT_FOUND", "That student was not found.");
  const rows = await prisma.standingEvent.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
  const names = await namesOf(
    prisma,
    rows.map((row) => row.decidedByUserId),
  );
  return done({
    standing: student.standing,
    until: student.standingUntil ? dayOf(student.standingUntil) : null,
    events: rows.map((row) => ({
      id: row.id,
      action: row.action,
      scope: row.scope,
      reason: row.reason,
      startsOn: dayOf(row.startsOn),
      endsOn: row.endsOn ? dayOf(row.endsOn) : null,
      decidedBy:
        row.decidedByUserId === "system"
          ? "The school's records (the end date passed)"
          : (names.get(row.decidedByUserId) ?? "A person who has left"),
      at: row.createdAt.toISOString(),
    })),
  });
}
