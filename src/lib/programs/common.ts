import { Prisma, SettingScope, type Program } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ErrorDetail } from "@/lib/api/envelope";
import { canManage, viewerOf, type ProgramViewer } from "./access";
import { PROGRAMS_ENABLED_KEY, isEditableStatus, parseEnabled } from "./rules";

// Shared by the programs services: the result type, the audit write, the lock, and the one guard every change goes through.

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

export const NOT_FOUND = "That program was not found.";

type Json = Prisma.InputJsonValue;
export type AuditEntry = {
  programId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Json | null;
  after?: Json | null;
  reason?: string | null;
};

/// Append-only: this is the only place a ProgramAudit row is written, and nothing updates or deletes one.
export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.programAudit.create({
    data: {
      programId: entry.programId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      beforeValue: entry.before ?? Prisma.DbNull,
      afterValue: entry.after ?? Prisma.DbNull,
      reason: entry.reason ?? null,
    },
  });
}

/// One structure change at a time per program: a row lock on the program, so "remove this level" cannot race "add a group at this level", and two clients cannot both
/// pass the same count check.
async function lockProgram(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Program" WHERE "id" = ${id} FOR UPDATE`;
  return rows.length > 0;
}

/// The school's own value of `programs.enabled`, or undefined when none is stored (= on).
export async function schoolEnabled(client: Pick<typeof prisma, "settingValue"> = prisma): Promise<boolean | undefined> {
  const row = await client.settingValue.findFirst({
    where: { scope: SettingScope.GLOBAL, key: PROGRAMS_ENABLED_KEY },
    select: { value: true },
  });
  return row ? parseEnabled(row.value) : undefined;
}

type ChangeContext = { tx: Prisma.TransactionClient; program: Program; viewer: ProgramViewer };

/// `need`: "super" a super admin; "manage" a super admin or a program admin; "people" (slice P2) also an administrator of a branch the program runs in - the work then limits itself
/// to the people through THEIR branches; "attend" (slice P3) anyone with a place in the program, and the work then checks the group the person may mark. Runs a change to one program. Order: who you are (404 for a program you have no place in, 403 for one you may read but not change), whether programs are switched
/// off (409), then - inside a transaction that holds the program's lock - whether the program can still be changed (409). `work` must make its checks BEFORE its first
/// write: a refusal it returns does not undo writes already made.
export async function change<T>(
  actorUserId: string,
  programId: string,
  need: "manage" | "super" | "people" | "attend",
  work: (context: ChangeContext) => Promise<Result<T>>,
  options: { allowArchived?: boolean } = {},
): Promise<Result<T>> {
  const viewer = await viewerOf(actorUserId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  if (need === "super" ? viewer.level !== "SUPER" : need === "manage" ? !canManage(viewer) : need === "people" && viewer.level === "STAFF")
    return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
  if ((await schoolEnabled()) === false) return refuse(409, "PROGRAMS_OFF", "Programs are switched off for the school.");
  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await lockProgram(tx, programId))) return refuse(404, "NOT_FOUND", NOT_FOUND);
      const program = await tx.program.findUniqueOrThrow({ where: { id: programId } });
      if (!options.allowArchived && !isEditableStatus(program.status)) {
        return refuse(
          409,
          "PROGRAM_READ_ONLY",
          program.status === "ARCHIVED"
            ? "This program is archived. Restore it to change it."
            : "This program has ended and can't be changed.",
        );
      }
      return work({ tx, program, viewer });
    });
  } catch (error) {
    // The database's own unique indexes are the last word on names (two clients saving the same name at once).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return refuse(409, "DUPLICATE", "That name is already in use.");
    throw error;
  }
}
