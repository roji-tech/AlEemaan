import { Prisma } from "@prisma/client";

// Every question bank change that matters is written to QuestionBankAudit, in the SAME transaction as the change: who, what, when, and the old and new value. The table
// is append-only (a trigger refuses UPDATE and DELETE; migration 20261019210000). `branchId` null means a school-wide change. An absent old or new value is stored as
// SQL NULL ("nothing before" / "cleared").

type Tx = Prisma.TransactionClient;

export type BankAuditEntry = {
  branchId?: string | null;
  itemId?: string | null;
  actorUserId?: string | null;
  entity: "ITEM" | "REVIEWER" | "SETTING";
  action: string;
  /// The setting key, or the reviewer row's id, when the entity is not an item.
  ref?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  reason?: string | null;
};

export function writeBankAudit(tx: Tx, entry: BankAuditEntry) {
  return tx.questionBankAudit.create({
    data: {
      branchId: entry.branchId ?? null,
      itemId: entry.itemId ?? null,
      actorUserId: entry.actorUserId ?? null,
      entity: entry.entity,
      action: entry.action,
      ref: entry.ref ?? null,
      oldValue: entry.oldValue ?? undefined,
      newValue: entry.newValue ?? undefined,
      reason: entry.reason ?? null,
    },
  });
}
