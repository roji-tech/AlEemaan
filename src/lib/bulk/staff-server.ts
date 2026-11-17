import type { Problem } from "./types";
import { EMAIL_TAKEN } from "@/lib/academics/staff";
import { staffEntity, type StaffRow } from "./staff";
import type { ServerKind } from "./server";

// The server half of the staff kind (task 0084): the one thing only the database knows (a live record in the branch already uses the email) and the save.

export type StaffBulkCtx = { branchId: string };

export const staffKind: ServerKind<StaffRow, StaffBulkCtx> = {
  entity: staffEntity,
  auditAction: "STAFF_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId }),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    const emails = rows.flatMap((r) => (r.row.email ? [r.row.email] : []));
    if (emails.length === 0) return found;
    // A live record's email is unique per branch, case-insensitively (the partial index StaffRecord_email_live): archived records do not count.
    const taken = await db.staffRecord.findMany({
      where: { branchId: ctx.branchId, archivedAt: null, email: { in: emails, mode: "insensitive" } },
      select: { email: true },
    });
    const used = new Set(taken.map((t) => t.email?.toLowerCase()));
    for (const r of rows)
      if (r.row.email && used.has(r.row.email.toLowerCase())) found.set(r.line, [{ column: "email", message: EMAIL_TAKEN }]);
    return found;
  },
  async save(tx, rows, ctx, actorUserId) {
    for (const { row } of rows) {
      const created = await tx.staffRecord.create({
        data: {
          branchId: ctx.branchId,
          category: row.category,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone ?? null,
          email: row.email ?? null,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STAFF_CREATED",
          targetType: "StaffRecord",
          targetId: created.id,
          afterValue: { category: row.category, branchId: ctx.branchId },
        },
      });
    }
  },
};
