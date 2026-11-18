import type { Problem } from "./types";
import { SUBJECT_TAKEN } from "@/lib/academics/structure-rules";
import { subjectEntity, type SubjectRow } from "./subjects";
import type { ServerKind } from "./server";

// The server half of the subject kind (task 0084): what only the database knows (a LIVE subject of the branch already has the name, ignoring capitals, or the code: the same two unique
// indexes the single form hits) and the save, with the audit entry the single form writes.

export type SubjectBulkCtx = { branchId: string };

export const subjectKind: ServerKind<SubjectRow, SubjectBulkCtx> = {
  entity: subjectEntity,
  auditAction: "SUBJECT_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId }),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    const live = await db.subject.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { name: true, code: true } });
    const names = new Set(live.map((s) => s.name.toLowerCase()));
    const codes = new Set(live.flatMap((s) => (s.code ? [s.code] : [])));
    for (const { line, row } of rows) {
      const problems: Problem[] = [];
      if (names.has(row.name.toLowerCase())) problems.push({ column: "name", message: SUBJECT_TAKEN });
      if (row.code && codes.has(row.code)) problems.push({ column: "code", message: SUBJECT_TAKEN });
      if (problems.length > 0) found.set(line, problems);
    }
    return found;
  },
  async save(tx, rows, ctx, actorUserId) {
    for (const { row } of rows) {
      const created = await tx.subject.create({
        data: { branchId: ctx.branchId, name: row.name, code: row.code ?? null },
        select: { id: true, name: true, code: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "SUBJECT_CREATED",
          targetType: "Subject",
          targetId: created.id,
          afterValue: { name: created.name, code: created.code, branchId: ctx.branchId },
        },
      });
    }
  },
};
