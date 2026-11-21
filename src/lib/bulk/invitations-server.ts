import type { Role } from "@prisma/client";
import type { AdminScope } from "@/lib/auth/branch-access";
import { createInvitationIn, saveDraftIn } from "@/lib/invitations/service";
import { mailInvitation } from "@/lib/invitations/mail";
import { invitationEntity, type InvitationRow } from "./invitations";
import { BulkChangedError, type ServerKind } from "./server";
import { usesDepartments } from "@/lib/academics/departments-setting";
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

    // A department (task 0127): staff roles only; matched by name (any capitals) to a live department of the branch; ignored (see `notes`) while the branch does not use departments.
    if (rows.some((r) => r.row.department) && (await usesDepartments(ctx.branchId))) {
      const live = await db.department.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { name: true } });
      const names = new Set(live.map((d) => d.name.toLowerCase()));
      for (const r of rows) {
        if (!r.row.department) continue;
        if (r.row.role === "STUDENT" || r.row.role === "PARENT")
          add(r.line, { column: "department", message: "A department is for staff: leave it empty for a student or a parent." });
        else if (!names.has(r.row.department.toLowerCase()))
          add(r.line, { column: "department", message: `This branch has no department called "${r.row.department}".` });
      }
    }

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
    const withDepartment = rows.filter((r) => r.row.department);
    const departmentNotes =
      withDepartment.length > 0 && !(await usesDepartments(ctx.branchId))
        ? new Map(
            withDepartment.map((r) => [r.line, "The department is ignored: this branch does not use departments."] as [number, string]),
          )
        : new Map<number, string>();
    const open = await db.invitation.findMany({
      where: { branchId: ctx.branchId, email: { in: rows.map((r) => r.row.email) }, acceptedAt: null, revokedAt: null },
      select: { email: true },
    });
    const has = new Set(open.map((o) => o.email));
    // A draft never replaces a SENT open invitation (it is refused: revoke or resend that first); it only updates an earlier draft.
    const replaced = new Map(
      rows
        .filter((r) => has.has(r.row.email))
        .map(
          (r) =>
            [r.line, ctx.asDraft ? "Already has an open invitation or draft." : "Will replace the open invitation."] as [number, string],
        ),
    );
    return new Map([...departmentNotes, ...replaced]);
  },
  async save(tx, rows, ctx, actorUserId) {
    const branch = await tx.branch.findUnique({ where: { id: ctx.branchId }, select: { name: true } });
    const departments = (await usesDepartments(ctx.branchId))
      ? new Map(
          (await tx.department.findMany({ where: { branchId: ctx.branchId, archivedAt: null }, select: { id: true, name: true } })).map(
            (d) => [d.name.toLowerCase(), d.id] as [string, string],
          ),
        )
      : new Map<string, string>();
    const departmentOf = (department?: string) => (department ? departments.get(department.toLowerCase()) : undefined);
    const sent: { email: string; token: string; role: Role }[] = [];
    if (ctx.asDraft) {
      for (const { row } of rows) {
        const result = await saveDraftIn(
          tx,
          actorUserId,
          { email: row.email, role: row.role, branchId: ctx.branchId, departmentId: departmentOf(row.department) },
          ctx.scope,
        );
        if (!result.ok) throw new BulkChangedError(result.reason);
      }
      return async () => {}; // nothing to e-mail: the drafts are sent later
    }
    for (const { row } of rows) {
      const result = await createInvitationIn(
        tx,
        actorUserId,
        { email: row.email, role: row.role, branchId: ctx.branchId, departmentId: departmentOf(row.department) },
        ctx.scope,
      );
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
