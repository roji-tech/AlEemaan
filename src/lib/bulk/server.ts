import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { validateRows } from "./validate";
import type { BulkEntity, Problem, RowVerdict, SourceRow } from "./types";

// The server half of the bulk entry (task 0084 D2 d and e). SERVER ONLY: this imports the database.
//
// A kind supplies its shared row rules (`entity`), what only the database can answer (`check`), and the save. This runs the shared rules AGAIN (the browser's word is never taken),
// then `check`; a dry run stops there and writes nothing. A real run does all of it again INSIDE one transaction (the data may have changed since the dry run) and saves every row
// or none: any problem, from any rule, is returned for every row and nothing is written.

export type Tx = Prisma.TransactionClient | PrismaClient;
export type CheckedRow<Row> = { line: number; row: Row };

export type ServerKind<Row, Ctx> = {
  entity: BulkEntity<Row>;
  /// Problems that only the database knows, by row number (a clash with a saved record, a name that does not exist). Called with the transaction on a real run.
  check: (db: Tx, rows: CheckedRow<Row>[], ctx: Ctx) => Promise<Map<number, Problem[]>>;
  /// Writes every row, inside the transaction, with one audit entry per row. The bulk's own audit entry is written by the caller of this function.
  save: (tx: Prisma.TransactionClient, rows: CheckedRow<Row>[], ctx: Ctx, actorUserId: string) => Promise<void>;
  /// The action name of the one audit entry for the whole bulk.
  auditAction: string;
  /// What the bulk entry records about itself besides the count.
  auditDetail?: (ctx: Ctx) => Prisma.InputJsonObject;
};

export type BulkRequest = { dryRun: boolean; rows: { line: number; values: Record<string, string> }[] };
export type BulkOutcome =
  | { kind: "dry-run"; verdicts: RowVerdict[] }
  | { kind: "saved"; saved: number; verdicts: RowVerdict[] }
  | { kind: "blocked"; verdicts: RowVerdict[] }
  | { kind: "changed" };

function merge(verdicts: RowVerdict[], found: Map<number, Problem[]>): RowVerdict[] {
  return verdicts.map((v) => {
    const extra = found.get(v.line);
    return extra && extra.length > 0 ? { line: v.line, status: "error", problems: [...v.problems, ...extra] } : v;
  });
}

async function verdictsFor<Row, Ctx>(kind: ServerKind<Row, Ctx>, db: Tx, ctx: Ctx, rows: SourceRow[]) {
  const checked = validateRows(kind.entity, rows);
  const found = checked.ok.length > 0 ? await kind.check(db, checked.ok, ctx) : new Map<number, Problem[]>();
  return { verdicts: merge(checked.verdicts, found), ok: checked.ok };
}

export async function runBulk<Row, Ctx>(kind: ServerKind<Row, Ctx>, ctx: Ctx, request: BulkRequest, actorUserId: string): Promise<BulkOutcome> {
  const rows: SourceRow[] = request.rows.map((r) => ({ line: r.line, values: r.values }));
  if (request.dryRun) return { kind: "dry-run", verdicts: (await verdictsFor(kind, prisma, ctx, rows)).verdicts };

  try {
    return await prisma.$transaction(async (tx): Promise<BulkOutcome> => {
      const { verdicts, ok } = await verdictsFor(kind, tx, ctx, rows);
      if (verdicts.some((v) => v.status === "error")) return { kind: "blocked", verdicts };
      await kind.save(tx, ok, ctx, actorUserId);
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: kind.auditAction,
          targetType: "BulkImport",
          targetId: kind.entity.id,
          afterValue: { count: ok.length, ...(kind.auditDetail?.(ctx) ?? {}) },
        },
      });
      return { kind: "saved", saved: ok.length, verdicts };
    });
  } catch (error) {
    // The database's own unique rules are the last word under a race: a second administrator saving the same email at the same instant. Nothing was written.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { kind: "changed" };
    throw error;
  }
}
