import { StandingState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { asDate, today, writeEvent } from "./common";

/// A suspension of a member of staff ends by itself, with no background job (design note 0045, section 4.5): suspending deactivates the membership (which is how every authority
/// check already works), so the lift happens at the one moment a person becomes signed in. For each of the person's memberships still suspended whose end date has passed, the
/// membership is reactivated and the standing cleared (and the staff record's), with a history row written by "system". Returns how many were lifted.
export async function liftEndedSuspensions(userId: string): Promise<number> {
  const due = await prisma.membership.findMany({
    where: { userId, standing: StandingState.SUSPENDED, standingUntil: { lt: asDate(today()) } },
    select: { id: true },
  });
  let lifted = 0;
  for (const { id } of due) {
    const did = await prisma.$transaction(async (tx) => {
      const [membership] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Membership" WHERE "id" = ${id} FOR UPDATE`;
      if (!membership) return false;
      const fresh = await tx.membership.findUniqueOrThrow({ where: { id } });
      // Re-checked under the lock: someone may have lifted, extended or terminated it a moment ago.
      if (fresh.standing !== StandingState.SUSPENDED || !fresh.standingUntil || fresh.standingUntil >= asDate(today())) return false;
      const record = await tx.staffRecord.findFirst({ where: { userId, branchId: fresh.branchId, standing: StandingState.SUSPENDED } });
      await tx.membership.update({ where: { id }, data: { deactivatedAt: null, standing: StandingState.ACTIVE, standingUntil: null } });
      if (record) await tx.staffRecord.update({ where: { id: record.id }, data: { standing: StandingState.ACTIVE, standingUntil: null } });
      await writeEvent(
        tx,
        {
          subject: "STAFF",
          membershipId: id,
          staffRecordId: record?.id ?? null,
          userId,
          branchId: fresh.branchId,
          action: "LIFT",
          reason: "The suspension's end date has passed.",
          decidedByUserId: "system",
        },
        {
          targetType: "Membership",
          targetId: id,
          before: { standing: "SUSPENDED", until: fresh.standingUntil.toISOString().slice(0, 10) },
          after: { standing: "ACTIVE", until: null },
        },
      );
      return true;
    });
    if (did) lifted++;
  }
  return lifted;
}
