import { prisma } from "@/lib/db";
import {
  PORTAL_CLOSED_NOTICE,
  loginClosedFor,
  portalLoginClosed,
  targetBranchIds,
  toLoginMembership,
  type BranchChange,
  type BranchLoginRow,
  type OpenAnywhere,
  type SwitchScope,
  type TargetRefusal,
} from "@/lib/auth/login-switch-rules";
import type { LoginSwitchesInput } from "@/lib/auth/login-switch-input";
import type { Portal } from "@/lib/portals";

// Student and parent sign-in switches (task 0091), PER BRANCH, the server side: deciding a sign-in, listing and changing the switches. The rules are pure and live in `login-switch-rules.ts`.
//
// Nothing here is remembered between requests. The per-request session check (`lib/auth/session.ts`) reads each membership's branch in the SAME database round trip as the session (a nested
// join), so a switch that is turned off ends the sessions of that branch's students and parents on their very next request, on every server, with no cache to go stale and no extra query.

const BRANCH_FIELDS = { id: true, name: true, studentLoginEnabled: true, parentLoginEnabled: true } as const;

/// May this person sign in, as far as the switches go? One read of their active memberships with their branches' switches. Called only once the credentials are right (the sign-in route)
/// and again in `completeSignIn`, the one place a session is made, so no way of signing in goes around it.
export async function loginOpenFor(userId: string, isSuperAdmin: boolean): Promise<boolean> {
  const rows = await prisma.membership.findMany({
    where: { userId, deactivatedAt: null },
    relationLoadStrategy: "join",
    select: { role: true, branch: { select: { studentLoginEnabled: true, parentLoginEnabled: true } } },
  });
  return !loginClosedFor({ isSuperAdmin, memberships: rows.map(toLoginMembership) });
}

/// Whether any branch at all has each switch on (for the public sign-in page of a student or parent portal, which does not know the branch before sign-in).
export async function loginOpenAnywhere(): Promise<OpenAnywhere> {
  const [student, parent] = await Promise.all([
    prisma.branch.findFirst({ where: { studentLoginEnabled: true }, select: { id: true } }),
    prisma.branch.findFirst({ where: { parentLoginEnabled: true }, select: { id: true } }),
  ]);
  return { student: student !== null, parent: parent !== null };
}

/// What this portal's sign-in page says when NO branch has opened it, or null (some branch is open, or this is not a student or parent portal). The host decides which portal (the caller
/// passes it); nothing about any person is read.
export async function portalClosedNotice(portal: Portal): Promise<string | null> {
  if (portal !== "student" && portal !== "parent") return null;
  return portalLoginClosed(portal, await loginOpenAnywhere()) ? PORTAL_CLOSED_NOTICE[portal] : null;
}

/// The branches this caller may switch, with both values: every branch for a superadmin, the branches where an administrator holds an active ADMIN membership otherwise.
export async function switchableBranches(scope: SwitchScope): Promise<BranchLoginRow[]> {
  return prisma.branch.findMany({
    where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
    orderBy: { createdAt: "asc" },
    select: BRANCH_FIELDS,
  });
}

export const LOGIN_SWITCH_AUDIT_ACTION = "LOGIN_SWITCHES_CHANGED";

export type SetResult = { ok: true; branches: BranchLoginRow[]; changes: BranchChange[] } | TargetRefusal;

/// Changes the switches of the branches the caller is allowed to name and writes ONE audit entry per branch that changed, all in ONE transaction: every branch or none (a refused request
/// changes nothing), and no change without its record. The branches are locked (`FOR UPDATE`, in id order, so two overlapping changes cannot deadlock) before they are read, so each audit
/// entry shows the true before. A branch whose values are already as asked is left alone and writes nothing. Returns every branch named, as it is now, and the ones that changed.
export async function setLoginSwitches(actorUserId: string, scope: SwitchScope, input: LoginSwitchesInput): Promise<SetResult> {
  return prisma.$transaction(async (tx): Promise<SetResult> => {
    const existing = await tx.branch.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const target = targetBranchIds(
      input,
      scope,
      existing.map((branch) => branch.id),
    );
    if (!target.ok) return target;

    const locked = await tx.$queryRaw<BranchLoginRow[]>`
      SELECT id, name, "studentLoginEnabled", "parentLoginEnabled" FROM public."Branch" WHERE id = ANY(${[...target.ids].sort()}::text[]) ORDER BY id FOR UPDATE`;
    const byId = new Map(locked.map((row) => [row.id, row]));
    // A branch deleted between the two reads: the whole request is refused, nothing is changed.
    if (target.ids.some((id) => !byId.has(id))) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "One of those branches does not exist. Nothing was changed." };
    }

    const branches: BranchLoginRow[] = [];
    const changes: BranchChange[] = [];
    for (const id of target.ids) {
      const row = byId.get(id)!;
      const after = {
        studentLoginEnabled: input.studentLoginEnabled ?? row.studentLoginEnabled,
        parentLoginEnabled: input.parentLoginEnabled ?? row.parentLoginEnabled,
      };
      branches.push({ id, name: row.name, ...after });
      if (after.studentLoginEnabled === row.studentLoginEnabled && after.parentLoginEnabled === row.parentLoginEnabled) continue;
      const before = { studentLoginEnabled: row.studentLoginEnabled, parentLoginEnabled: row.parentLoginEnabled };
      await tx.branch.update({ where: { id }, data: after });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: LOGIN_SWITCH_AUDIT_ACTION,
          targetType: "Branch",
          targetId: id,
          // The branch's name is in both so a row reads on its own; the values are the switches.
          beforeValue: { branchName: row.name, ...before },
          afterValue: { branchName: row.name, ...after },
        },
      });
      changes.push({ id, name: row.name, before, after });
    }
    return { ok: true, branches, changes };
  });
}
