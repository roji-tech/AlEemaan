import { Role, StandingScope, StandingState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, mayAdminister } from "@/lib/auth/branch-access";
import { hasAnotherActiveSuperAdmin } from "@/lib/members/service";
import { asDate, done, namesOf, refuse, today, writeEvent, type HistoryEntry, type Result } from "./common";
import { dayOf, effectiveStanding, mayAct, standingAfter, suspensionEndProblem, type StandingAction } from "./rules";
import { branchAdminMaySuspend } from "./settings-service";

// Standing of a member of staff (task 0045, section 4.3): suspended (until a date, or until lifted) or terminated, in one branch or, for a super admin, in every branch the person
// has. The authority itself already lives in `Membership.deactivatedAt` (every authority check reads it), so a suspension and a termination deactivate the membership and say WHY
// in `standing`; the staff record carries the same standing, and a terminated record is archived (the live filters already drop an archived one).

export type StaffAction = Extract<StandingAction, "SUSPEND" | "LIFT" | "TERMINATE" | "REINSTATE">;
export type StaffTarget = { membershipId: string } | { staffRecordId: string };
export type StaffChange = { reason: string; until?: string | null; scope?: "BRANCH" | "SCHOOL" };

type MembershipRow = {
  id: string;
  userId: string;
  branchId: string;
  role: Role;
  standing: StandingState;
  standingUntil: Date | null;
  deactivatedAt: Date | null;
};
type RecordRow = {
  id: string;
  userId: string | null;
  branchId: string;
  standing: StandingState;
  standingUntil: Date | null;
  archivedAt: Date | null;
};
type Unit = { branchId: string; membership: MembershipRow | null; record: RecordRow | null };

const MEMBERSHIP = {
  id: true,
  userId: true,
  branchId: true,
  role: true,
  standing: true,
  standingUntil: true,
  deactivatedAt: true,
} as const;
const RECORD = { id: true, userId: true, branchId: true, standing: true, standingUntil: true, archivedAt: true } as const;

type Reader = Pick<typeof prisma, "membership" | "staffRecord">;

/// The one unit (a membership and/or a staff record, in one branch) a target names.
async function unitOf(db: Reader, target: StaffTarget): Promise<Unit | null> {
  if ("membershipId" in target) {
    const membership = await db.membership.findUnique({ where: { id: target.membershipId }, select: MEMBERSHIP });
    if (!membership) return null;
    const record = await db.staffRecord.findFirst({
      where: { userId: membership.userId, branchId: membership.branchId },
      select: RECORD,
      orderBy: { createdAt: "desc" },
    });
    return { branchId: membership.branchId, membership, record };
  }
  const record = await db.staffRecord.findUnique({ where: { id: target.staffRecordId }, select: RECORD });
  if (!record) return null;
  const membership = record.userId
    ? await db.membership.findUnique({
        where: { userId_branchId: { userId: record.userId, branchId: record.branchId } },
        select: MEMBERSHIP,
      })
    : null;
  return { branchId: record.branchId, membership, record };
}

/// Every unit a person has, one per branch (for a school-wide action).
async function unitsOfUser(db: Reader, userId: string): Promise<Unit[]> {
  const [memberships, records] = await Promise.all([
    db.membership.findMany({ where: { userId }, select: MEMBERSHIP }),
    db.staffRecord.findMany({ where: { userId }, select: RECORD, orderBy: { createdAt: "asc" } }),
  ]);
  const byBranch = new Map<string, Unit>();
  for (const membership of memberships) byBranch.set(membership.branchId, { branchId: membership.branchId, membership, record: null });
  for (const record of records) {
    const unit = byBranch.get(record.branchId);
    if (unit) unit.record = record;
    else byBranch.set(record.branchId, { branchId: record.branchId, membership: null, record });
  }
  return [...byBranch.values()];
}

const storedOf = (unit: Unit) => ({
  standing: (unit.membership?.standing ?? unit.record?.standing ?? StandingState.ACTIVE) as StandingState,
  until: ((unit.membership?.standingUntil ?? unit.record?.standingUntil)
    ? dayOf((unit.membership?.standingUntil ?? unit.record?.standingUntil)!)
    : null) as string | null,
});

/// The state an action leads to for this unit, or null when it does not apply to it.
function nextFor(unit: Unit, action: StaffAction): StandingState | null {
  const stored = storedOf(unit);
  // Lifting works on what is stored (a suspension whose end date has passed can still be cleared); everything else on what applies today.
  const current = action === "LIFT" ? stored.standing : effectiveStanding(stored.standing, stored.until, today());
  // Someone who was only deactivated (not suspended) is reactivated on the Users page, not suspended.
  if (action === "SUSPEND" && unit.membership?.deactivatedAt && stored.standing === StandingState.ACTIVE) return null;
  return standingAfter(action, "STAFF", current) as StandingState | null;
}

export async function changeStaffStanding(
  actorUserId: string,
  target: StaffTarget,
  action: StaffAction,
  input: StaffChange,
): Promise<Result<{ branches: { branchId: string; standing: string }[]; signedOut: boolean }>> {
  const scope = await adminScope(actorUserId);
  const base = await unitOf(prisma, target);
  // A member of a branch the person does not administer answers like one that does not exist.
  if (!base || !mayAdminister(scope, base.branchId)) return refuse(404, "NOT_FOUND", "That member of staff was not found.");

  const userId = base.membership?.userId ?? base.record?.userId ?? null;
  const requested = input.scope ?? "BRANCH";
  if (requested === "SCHOOL" && !userId)
    return refuse(400, "VALIDATION", "A school-wide action needs a person who has a sign-in.", [
      { path: "body.scope", message: "This staff record has no sign-in." },
    ]);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true, name: true } }) : null;
  const refusal = mayAct(
    action,
    { userId: actorUserId, superAdmin: scope.superAdmin, adminOfBranch: true },
    {
      scope: requested,
      branchAdminMaySuspend: await branchAdminMaySuspend(base.branchId),
      targetUserId: userId,
      targetIsAdmin: base.membership?.role === Role.ADMIN || Boolean(user?.isSuperAdmin),
    },
  );
  if (refusal === "SELF") return refuse(409, "SELF", "You can't change your own standing. Ask another administrator.");
  if (refusal) return refuse(403, "FORBIDDEN", "You don't have permission to do that.");

  const until = action === "SUSPEND" ? (input.until ?? null) : null;
  if (action === "SUSPEND") {
    const problem = suspensionEndProblem(until, today());
    if (problem) return refuse(400, "VALIDATION", problem, [{ path: "body.until", message: problem }]);
  }

  return prisma.$transaction(async (tx): Promise<Result<{ branches: { branchId: string; standing: string }[]; signedOut: boolean }>> => {
    // One change to a person's standing at a time: their memberships (or their record, for one with no sign-in) are locked for the rest of the transaction.
    if (userId) await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "userId" = ${userId} FOR UPDATE`;
    else if (base.record) await tx.$queryRaw`SELECT "id" FROM "StaffRecord" WHERE "id" = ${base.record.id} FOR UPDATE`;

    const all = requested === "SCHOOL" && userId ? await unitsOfUser(tx, userId) : [(await unitOf(tx, target)) ?? base];
    const plan = all
      .map((unit) => ({ unit, next: nextFor(unit, action) }))
      .filter((entry): entry is { unit: Unit; next: StandingState } => entry.next !== null);
    if (plan.length === 0) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: nothing is in the state this needs.");

    // Taking a membership away from the last active super admin would leave the school with none: the same guard as deactivating one.
    const deactivating = action === "SUSPEND" || action === "TERMINATE";
    const takenAway = deactivating ? plan.filter((entry) => entry.unit.membership && !entry.unit.membership.deactivatedAt).length : 0;
    if (userId && user?.isSuperAdmin && takenAway > 0) {
      const active = await tx.membership.count({ where: { userId, deactivatedAt: null } });
      if (active - takenAway <= 0 && !(await hasAnotherActiveSuperAdmin(tx, userId))) {
        return refuse(409, "LAST_SUPERADMIN", "This is the school's last super admin. Make someone else a super admin first.");
      }
    }

    const now = new Date();
    for (const { unit, next } of plan) {
      const standingUntil = next === StandingState.SUSPENDED && until ? asDate(until) : null;
      const before = { standing: storedOf(unit).standing, until: storedOf(unit).until };
      if (unit.membership) {
        const deactivatedAt = next === StandingState.ACTIVE ? null : (unit.membership.deactivatedAt ?? now);
        await tx.membership.update({ where: { id: unit.membership.id }, data: { standing: next, standingUntil, deactivatedAt } });
      }
      if (unit.record) {
        const archivedAt =
          next === StandingState.TERMINATED ? (unit.record.archivedAt ?? now) : action === "REINSTATE" ? null : unit.record.archivedAt;
        await tx.staffRecord.update({ where: { id: unit.record.id }, data: { standing: next, standingUntil, archivedAt } });
      }
      await writeEvent(
        tx,
        {
          subject: "STAFF",
          staffRecordId: unit.record?.id ?? null,
          membershipId: unit.membership?.id ?? null,
          userId,
          branchId: unit.branchId,
          action,
          scope: requested === "SCHOOL" ? StandingScope.SCHOOL : StandingScope.BRANCH,
          reason: input.reason,
          endsOn: until,
          decidedByUserId: actorUserId,
        },
        {
          targetType: unit.membership ? "Membership" : "StaffRecord",
          targetId: (unit.membership?.id ?? unit.record?.id)!,
          before,
          after: { standing: next, until },
        },
      );
    }

    // If that was the person's last active membership their sessions go with it, as deactivating does.
    let signedOut = false;
    if (userId && takenAway > 0 && (await tx.membership.count({ where: { userId, deactivatedAt: null } })) === 0) {
      await tx.session.deleteMany({ where: { userId } });
      signedOut = true;
    }
    return done({ branches: plan.map((entry) => ({ branchId: entry.unit.branchId, standing: entry.next })), signedOut });
  });
}

export async function staffStandingHistory(
  actorUserId: string,
  target: StaffTarget,
): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> {
  const scope = await adminScope(actorUserId);
  const unit = await unitOf(prisma, target);
  if (!unit || !mayAdminister(scope, unit.branchId)) return refuse(404, "NOT_FOUND", "That member of staff was not found.");
  const ids = [
    unit.membership ? { membershipId: unit.membership.id } : null,
    unit.record ? { staffRecordId: unit.record.id } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const rows =
    ids.length === 0
      ? []
      : await prisma.standingEvent.findMany({ where: { OR: ids }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
  const names = await namesOf(
    prisma,
    rows.map((row) => row.decidedByUserId),
  );
  const stored = storedOf(unit);
  return done({
    standing: stored.standing,
    until: stored.until,
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
