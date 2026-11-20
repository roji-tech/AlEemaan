import type { Problem } from "./types";
import { CATALOG_TAKEN } from "@/lib/academics/subject-catalog-rules";
import { subjectCatalogEntity, type SubjectCatalogRow } from "./subject-catalog";
import type { ServerKind } from "./server";

// The server half of the catalogue kind (task 0119): a LIVE catalogue entry already has the name (ignoring capitals) or the code (the same two unique indexes the single form hits), and
// the save, with the audit entry the single form writes. Superadmin only: the route decides that.

export const subjectCatalogKind: ServerKind<SubjectCatalogRow, Record<string, never>> = {
  entity: subjectCatalogEntity,
  auditAction: "SUBJECT_CATALOG_BULK_IMPORTED",
  async check(db, rows) {
    const found = new Map<number, Problem[]>();
    const live = await db.subjectCatalog.findMany({ where: { archivedAt: null }, select: { name: true, code: true } });
    const names = new Set(live.map((s) => s.name.toLowerCase()));
    const codes = new Set(live.flatMap((s) => (s.code ? [s.code] : [])));
    for (const { line, row } of rows) {
      const problems: Problem[] = [];
      if (names.has(row.name.toLowerCase())) problems.push({ column: "name", message: CATALOG_TAKEN });
      if (row.code && codes.has(row.code)) problems.push({ column: "code", message: CATALOG_TAKEN });
      if (problems.length > 0) found.set(line, problems);
    }
    return found;
  },
  async save(tx, rows, _ctx, actorUserId) {
    for (const { row } of rows) {
      const created = await tx.subjectCatalog.create({
        data: { name: row.name, code: row.code ?? null, tags: row.tags },
        select: { id: true, name: true, code: true, tags: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "SUBJECT_CATALOG_CREATED",
          targetType: "SubjectCatalog",
          targetId: created.id,
          afterValue: { name: created.name, code: created.code, tags: created.tags },
        },
      });
    }
  },
};
