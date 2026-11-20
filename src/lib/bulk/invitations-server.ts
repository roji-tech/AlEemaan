import type { Role } from "@prisma/client";
import type { AdminScope } from "@/lib/auth/branch-access";
import { createInvitationIn, saveDraftIn } from "@/lib/invitations/service";
import { mailInvitation } from "@/lib/invitations/mail";
import { invitationEntity, type InvitationRow } from "./invitations";
import { BulkChangedError, type ServerKind } from "./server";
import type { Problem } from "./types";

// The server half of the invitation kind (task 0084): what only the database knows (already a member, deactivated, an open invitation that a save would replace; the same rules as one
// invitation, in the same words) and the save, which is `createInvitationIn` for every row inside the bulk's one transaction. The e-mails go out AFTER the commit.

/// `asDraft` (task 0101 D2): save every row as a DRAFT invitation (nothing is e-mailed until each is sent). Default: send.
export type InvitationBulkCtx = { branchId: string; scope: AdminScope; inviterName: string | null; asDraft?: boolean };
const ALREADY_MEMBER = "That person is already a member.";
const DEACTIVATED = "That person was deactivated. Reactivate them instead.";
const ADMIN_ONLY = "Only a superadmin can invite an administrator.";

export const invitationKind: ServerKind<InvitationRow, InvitationBulkCtx> = {
  entity: invitationEntity,
  auditAction: "INVITATIONS_BULK_IMPORTED",
  auditDetail: (ctx) => ({ branchId: ctx.branchId, asDraft: ctx.asDraft === true }),
  async check(db, rows, ctx) {
    const found = new Map<number, Problem[]>();
    const add = (line: number, p: Problem) => found.set(line, [...(found.get(line) ?? []), p]);
    for (const r of rows) if (r.row.role === "ADMIN" && !ctx.scope.superAdmin) add(r.line, { column: "role", message: ADMIN_ONLY });

    const emails = rows.map((r) => r.row.email);
    const memberships = await db.membership.findMany({
      where: { user: { email: { in: emails } } },
      select: { branchId: true, deactivatedAt: true, user: { select: { email: true } } },
    });
    for (const r of rows) {
      const mine = memberships.filter((m) => m.user.email === r.row.email);
      // The same rule as one invitation: an active membership here is a member; a deactivated one here, or deactivated ones and no active one anywhere, is a person to reactivate.
      if (mine.some((m) => m.branchId === ctx.branchId && !m.deactivatedAt)) add(r.line, { column: "email", message: ALREADY_MEMBER });
      else if (mine.some((m) => m.branchId === ctx.branchId) || (mine.length > 0 && !mine.some((m) => !m.deactivatedAt)))
        add(r.line, { column: "email", message: DEACTIVATED });
    }
    return found;
  },
  async notes(db, rows, ctx) {
    const open = await db.invitation.findMany({
      where: { branchId: ctx.branchId, email: { in: rows.map((r) => r.row.email) }, acceptedAt: null, revokedAt: null },
      select: { email: true },
    });
    const has = new Set(open.map((o) => o.email));
    // A draft never replaces a SENT open invitation (it is refused: revoke or resend that first); it only updates an earlier draft.
    return new Map(
      rows
        .filter((r) => has.has(r.row.email))
        .map((r) => [r.line, ctx.asDraft ? "Already has an open invitation or draft." : "Will replace the open invitation."]),
    );
  },
  async save(tx, rows, ctx, actorUserId) {
    const branch = await tx.branch.findUnique({ where: { id: ctx.branchId }, select: { name: true } });
    const sent: { email: string; token: string; role: Role }[] = [];
    if (ctx.asDraft) {
      for (const { row } of rows) {
        const result = await saveDraftIn(tx, actorUserId, { email: row.email, role: row.role, branchId: ctx.branchId }, ctx.scope);
        if (!result.ok) throw new BulkChangedError(result.reason);
      }
      return async () => {}; // nothing to e-mail: the drafts are sent later
    }
    for (const { row } of rows) {
      const result = await createInvitationIn(tx, actorUserId, { email: row.email, role: row.role, branchId: ctx.branchId }, ctx.scope);
      // Everything was true a moment ago, when the rows were checked in this very transaction: if it is not now, nothing is saved and the person is told to check again.
      if (!result.ok) throw new BulkChangedError(result.reason);
      sent.push({ email: row.email, token: result.token, role: row.role });
    }
    return async () => {
      for (const s of sent) {
        try {
          await mailInvitation({ ...s, branchName: branch?.name ?? "", inviterName: ctx.inviterName });
        } catch (error) {
          console.error("[invitations] mail failed:", error instanceof Error ? error.message : error);
        }
      }
    };
  },
};
