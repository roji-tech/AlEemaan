import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { brand } from "@/lib/brand";
import { maskEmail } from "@/lib/auth/mask-email";
import { mayAdminister, type AdminScope } from "@/lib/auth/branch-access";
import { INVITATION_TTL_MS, hashInvitationToken, newInvitationToken } from "./token";
import { invitationStatus, isLiveInvitation, type InvitationStatus } from "./status";
import { accountFitsRecord, ensureStaffRecord } from "@/lib/academics/staff-accounts";
import { LIVE_STAFF } from "@/lib/drafts/live";

// Invitations (domain-implementation-plan.md "Build design — Users pages and invitations", a port of Octalve Edu's 0.5.4).
//
//   administrator's side (administrators only — enforced by the routes; a branch administrator is limited by `scope` to their own branches and
//   to roles below ADMIN, a superadmin to nothing): create, resend, revoke, list
//   invitee's side (NO membership yet): preview and accept
//
// Every write is audited IN THE SAME TRANSACTION as the change, so a row never exists without its audit entry nor the entry without the
// row — and no audit row ever carries a token, a hash or a password. (Unlike Octalve Edu there is one school: no tenant context, no
// row-level security, no "invitation context" — the hash of the token IS the lookup.)

const PUBLIC_SELECT = {
  id: true,
  email: true,
  role: true,
  branchId: true,
  createdAt: true,
  sentAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  branch: { select: { name: true } },
  invitedBy: { select: { name: true } },
} satisfies Prisma.InvitationSelect;

type InvitationRow = Prisma.InvitationGetPayload<{ select: typeof PUBLIC_SELECT }>;

/// What the API returns about an invitation: never the token, never its hash.
export type PublicInvitation = {
  id: string;
  email: string;
  role: Role;
  branchId: string;
  branchName: string;
  invitedByName: string | null;
  createdAt: Date;
  /// When the link was sent; null for a draft (task 0101 D2).
  sentAt: Date | null;
  /// Null for a draft: there is no link yet, so nothing runs out.
  expiresAt: Date | null;
  status: InvitationStatus;
};

const toPublic = (row: InvitationRow, now: Date = new Date()): PublicInvitation => ({
  id: row.id,
  email: row.email,
  role: row.role,
  branchId: row.branchId,
  branchName: row.branch.name,
  invitedByName: row.invitedBy?.name ?? null,
  createdAt: row.createdAt,
  sentAt: row.sentAt,
  expiresAt: row.expiresAt,
  status: invitationStatus(row, now),
});

/// The invitations a caller may see and act on: a superadmin all of them; a branch administrator those of their own branches, and never one
/// that would make an ADMIN (they cannot create or touch one, so they do not see one either).
const visibleTo = (scope: AdminScope): Prisma.InvitationWhereInput =>
  scope.superAdmin ? {} : { branchId: { in: [...scope.branchIds] }, role: { not: "ADMIN" } };

// --- the administrator's side ---------------------------------------------------------------------------------------------

export type CreateInvitationResult =
  | { ok: true; invitation: PublicInvitation; token: string }
  | { ok: false; reason: "ALREADY_MEMBER" | "DEACTIVATED_MEMBER" | "INVALID_BRANCH" | "OUT_OF_SCOPE" | "ADMIN_ONLY" };

type Authority = { ok: true; branchName: string } | { ok: false; reason: "INVALID_BRANCH" | "OUT_OF_SCOPE" | "ADMIN_ONLY" };

/// May this caller invite someone, as this role, to this branch? THE rule, in one place: the single invitation, the bulk and the several-branches request all ask it, so none of them
/// can drift from the others. An unknown branch is `INVALID_BRANCH`; a branch the caller does not administer is `OUT_OF_SCOPE`; only a superadmin makes an administrator. The branch's name
/// comes back only when the caller IS allowed, so a refusal never carries the name of a branch they may not see.
async function authorityToInvite(
  tx: Prisma.TransactionClient,
  input: { role: Role; branchId: string },
  scope: AdminScope,
): Promise<Authority> {
  const branch = await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true } });
  if (!branch) return { ok: false, reason: "INVALID_BRANCH" };
  if (!mayAdminister(scope, input.branchId)) return { ok: false, reason: "OUT_OF_SCOPE" };
  if (input.role === "ADMIN" && !scope.superAdmin) return { ok: false, reason: "ADMIN_ONLY" }; // only a superadmin makes an administrator
  return { ok: true, branchName: branch.name };
}

/// The membership rule for ONE branch, shared by the single and the several-branches invitation. The rule is per (person, branch): a person may belong to several branches (plan, "a person may
/// belong to several branches"). Refused: an active membership in THIS branch; a deactivated one in this branch; or deactivated memberships and no active one anywhere (a deactivated person
/// comes back by reactivation, never by a new link).
async function membershipRefusal(
  tx: Prisma.TransactionClient,
  email: string,
  branchId: string,
): Promise<"ALREADY_MEMBER" | "DEACTIVATED_MEMBER" | null> {
  const memberships = await tx.membership.findMany({
    where: { user: { email } },
    select: { branchId: true, deactivatedAt: true },
  });
  if (memberships.some((m) => m.branchId === branchId && !m.deactivatedAt)) return "ALREADY_MEMBER";
  const anyActive = memberships.some((m) => !m.deactivatedAt);
  if (memberships.some((m) => m.branchId === branchId) || (memberships.length > 0 && !anyActive)) return "DEACTIVATED_MEMBER";
  return null;
}

/// Revokes (and audits) whatever open invitation the address still holds for the branch, then creates the new one and audits it: the write half, shared by the single and the several-branches
/// invitation. Everything that could refuse has been asked before this runs.
async function writeInvitation(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  input: { email: string; role: Role; branchId: string; staffRecordId?: string },
  now: Date,
): Promise<{ invitation: PublicInvitation; token: string }> {
  const earlier = await tx.invitation.findMany({
    where: { email: input.email, branchId: input.branchId, acceptedAt: null, revokedAt: null }, // (a different branch's open invitation stays)
    select: { id: true, role: true },
  });
  for (const old of earlier) {
    await tx.invitation.update({ where: { id: old.id }, data: { revokedAt: now } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "INVITATION_REVOKED",
        targetType: "Invitation",
        targetId: old.id,
        afterValue: { email: input.email, role: old.role, branchId: input.branchId },
        reason: "replaced by a new invitation",
      },
    });
  }

  const token = newInvitationToken();
  const created = await tx.invitation.create({
    data: {
      email: input.email,
      role: input.role,
      branchId: input.branchId,
      tokenHash: hashInvitationToken(token),
      invitedById: actorUserId,
      sentAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      ...(input.staffRecordId ? { staffRecordId: input.staffRecordId } : {}),
    },
    select: PUBLIC_SELECT,
  });
  await tx.auditLog.create({
    data: {
      actorUserId,
      action: "INVITATION_CREATED",
      targetType: "Invitation",
      targetId: created.id,
      afterValue: {
        email: input.email,
        role: input.role,
        branchId: input.branchId,
        ...(input.staffRecordId ? { staffRecordId: input.staffRecordId } : {}),
      },
    },
  });
  return { invitation: toPublic(created, now), token };
}

const lockAddress = (tx: Prisma.TransactionClient, email: string) =>
  // (`$executeRaw`: the lock function returns `void`, which `$queryRaw` cannot deserialise.)
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invitation:${email}`}::text))`;

/// Invites `input.email` to a branch. One open invitation per (address, branch): an earlier open one is revoked (and audited) first, and a partial unique index
/// is the guarantee under concurrency — an advisory lock on the address serialises two administrators inviting the same person at the same
/// instant, so the loser revokes the winner's instead of failing on the index. Only ever tells the administrator about THIS school: an
/// address that already holds a membership (or had one deactivated) is named as such.
export async function createInvitation(
  actorUserId: string,
  input: { email: string; role: Role; branchId: string },
  scope: AdminScope,
): Promise<CreateInvitationResult> {
  return prisma.$transaction((tx) => createInvitationIn(tx, actorUserId, input, scope));
}

/// `createInvitation` inside a transaction the caller owns, so a bulk can create many and roll all of them back together (task 0084). The advisory lock per address is held until that transaction ends.
export async function createInvitationIn(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  /// `staffRecordId`: the staff record the invitation is sent from (task 0114); accepting links the new account to it. The caller has checked that it is a record of `branchId`.
  input: { email: string; role: Role; branchId: string; staffRecordId?: string },
  scope: AdminScope,
): Promise<CreateInvitationResult> {
  await lockAddress(tx, input.email);

  const authority = await authorityToInvite(tx, input, scope);
  if (!authority.ok) return { ok: false, reason: authority.reason } as const;
  const refusal = await membershipRefusal(tx, input.email, input.branchId);
  if (refusal) return { ok: false, reason: refusal } as const;

  const written = await writeInvitation(tx, actorUserId, input, new Date());
  return { ok: true, ...written } as const;
}

export type CreateInvitationsResult =
  | { ok: true; invitations: { invitation: PublicInvitation; token: string }[] }
  /// The request itself was refused: a branch that does not exist, one the caller does not administer, an administrator invited by someone who is not a superadmin. No branch is named.
  | { ok: false; reason: "INVALID_BRANCH" | "OUT_OF_SCOPE" | "ADMIN_ONLY" }
  /// A branch the caller DOES administer cannot take this person; its name is given so the sentence can say which. ALREADY_INVITED: a link to that branch is still waiting.
  | { ok: false; reason: "ALREADY_MEMBER" | "DEACTIVATED_MEMBER" | "ALREADY_INVITED"; branchName: string };

/// Invites one address, as one role, to several branches: ALL of them or NONE (task 0092). Everything that could refuse is asked for EVERY branch before anything is written, in this order:
/// the authority to invite to each (the very rule of a single invitation, so a branch the caller may not see is refused before any branch is named), then each branch's own conflicts (a
/// membership, a deactivation, a link still waiting). A refusal writes nothing; the writes then run in the caller's transaction, so a failure of the database undoes all of them. The advisory lock
/// on the address is the single invitation's, so two requests for the same person queue instead of interleaving.
export async function createInvitationsIn(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  input: { email: string; role: Role; branchIds: readonly string[] },
  scope: AdminScope,
): Promise<CreateInvitationsResult> {
  await lockAddress(tx, input.email);

  const names = new Map<string, string>();
  for (const branchId of input.branchIds) {
    const authority = await authorityToInvite(tx, { role: input.role, branchId }, scope);
    if (!authority.ok) return { ok: false, reason: authority.reason };
    names.set(branchId, authority.branchName);
  }

  const now = new Date();
  // A link still waiting is not replaced here (a single invitation replaces it): someone who asks for several branches at once is told which one already has a link.
  const waiting = await tx.invitation.findMany({
    where: { email: input.email, branchId: { in: [...input.branchIds] }, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { branchId: true },
  });
  const waitingIn = new Set(waiting.map((w) => w.branchId));
  for (const branchId of input.branchIds) {
    const branchName = names.get(branchId)!;
    const refusal = await membershipRefusal(tx, input.email, branchId);
    if (refusal) return { ok: false, reason: refusal, branchName };
    if (waitingIn.has(branchId)) return { ok: false, reason: "ALREADY_INVITED", branchName };
  }

  const invitations: { invitation: PublicInvitation; token: string }[] = [];
  for (const branchId of input.branchIds) {
    invitations.push(await writeInvitation(tx, actorUserId, { email: input.email, role: input.role, branchId }, now));
  }
  return { ok: true, invitations };
}

export async function createInvitations(
  actorUserId: string,
  input: { email: string; role: Role; branchIds: readonly string[] },
  scope: AdminScope,
): Promise<CreateInvitationsResult> {
  return prisma.$transaction((tx) => createInvitationsIn(tx, actorUserId, input, scope));
}

/// A fresh link and a fresh seven days for an invitation that is still open (pending OR expired); the earlier link stops working at once.
/// `null` when there is no such open invitation (accepted, revoked, unknown: one answer).
export async function resendInvitation(
  actorUserId: string,
  invitationId: string,
  scope: AdminScope,
): Promise<{ invitation: PublicInvitation; token: string } | null> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.invitation.findFirst({
      // A draft has no link to renew: it is sent (`sendDraftInvitation`), not resent.
      where: { id: invitationId, acceptedAt: null, revokedAt: null, tokenHash: { not: null }, ...visibleTo(scope) },
      select: { id: true, email: true },
    });
    if (!open) return null;
    const now = new Date();
    const token = newInvitationToken();
    const updated = await tx.invitation.update({
      where: { id: open.id },
      data: { tokenHash: hashInvitationToken(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS), sentAt: now },
      select: PUBLIC_SELECT,
    });
    await tx.auditLog.create({
      data: { actorUserId, action: "INVITATION_RESENT", targetType: "Invitation", targetId: open.id, afterValue: { email: open.email } },
    });
    return { invitation: toPublic(updated, now), token };
  });
}

/// Ends an open invitation. The conditional update is the gate: it changes exactly one row or the answer is "no such open invitation".
export async function revokeInvitation(actorUserId: string, invitationId: string, scope: AdminScope): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.invitation.findUnique({
      where: { id: invitationId },
      select: { email: true, role: true, branchId: true, tokenHash: true },
    });
    const claimed = await tx.invitation.updateMany({
      where: { id: invitationId, acceptedAt: null, revokedAt: null, ...visibleTo(scope) },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        actorUserId,
        // A draft that is thrown away is its own event (task 0101 D2); both are read by the history (task 0117).
        action: target?.tokenHash === null ? "INVITATION_DRAFT_DELETED" : "INVITATION_REVOKED",
        targetType: "Invitation",
        targetId: invitationId,
        // Who it was for, and what it was for: the history of invitations (task 0117) is read from these rows.
        afterValue: { email: target?.email ?? null, role: target?.role ?? null, branchId: target?.branchId ?? null },
        reason: target?.tokenHash === null ? "draft deleted" : "revoked by an administrator",
      },
    });
    return true;
  });
}

// --- drafts (task 0101 D2) ------------------------------------------------------------------------------------------------
// A draft invitation is saved, not sent: no token, no expiry, no e-mail (`tokenHash`, `expiresAt` and `sentAt` are all null together, a CHECK holds it). Sending it makes the link and
// e-mails it. A draft is the open invitation of its (address, branch) as far as the unique index goes (`Invitation_one_live_per_address_branch` counts every invitation that is neither
// accepted nor revoked), so there is one per pair: saving a draft for a pair that already has a DRAFT updates it; one that already has a SENT open invitation is refused (revoke or resend that
// first: a draft must never silently kill a live link). A draft never matches an accept link (no token) and is never "accepted" or "expired".

export type DraftRefusal = "ALREADY_MEMBER" | "DEACTIVATED_MEMBER" | "INVALID_BRANCH" | "OUT_OF_SCOPE" | "ADMIN_ONLY" | "OPEN_EXISTS";
export type SaveDraftResult = { ok: true; invitation: PublicInvitation; created: boolean } | { ok: false; reason: DraftRefusal };

/// Saves a draft inside a transaction the caller owns (a bulk saves many and rolls them all back together). The authority and the membership rules are the single invitation's.
export async function saveDraftIn(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  input: { email: string; role: Role; branchId: string; staffRecordId?: string },
  scope: AdminScope,
): Promise<SaveDraftResult> {
  await lockAddress(tx, input.email);
  const authority = await authorityToInvite(tx, input, scope);
  if (!authority.ok) return { ok: false, reason: authority.reason };
  const refusal = await membershipRefusal(tx, input.email, input.branchId);
  if (refusal) return { ok: false, reason: refusal };
  const now = new Date();
  const open = await tx.invitation.findFirst({
    where: { email: input.email, branchId: input.branchId, acceptedAt: null, revokedAt: null },
    select: { id: true, tokenHash: true },
  });
  if (open && open.tokenHash !== null) return { ok: false, reason: "OPEN_EXISTS" };
  if (open) {
    const updated = await tx.invitation.update({
      where: { id: open.id },
      data: { role: input.role, invitedById: actorUserId, staffRecordId: input.staffRecordId ?? null },
      select: PUBLIC_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "INVITATION_DRAFT_SAVED",
        targetType: "Invitation",
        targetId: open.id,
        afterValue: { email: input.email, role: input.role, branchId: input.branchId, updated: true },
      },
    });
    return { ok: true, invitation: toPublic(updated, now), created: false };
  }
  const created = await tx.invitation.create({
    data: {
      email: input.email,
      role: input.role,
      branchId: input.branchId,
      invitedById: actorUserId,
      ...(input.staffRecordId ? { staffRecordId: input.staffRecordId } : {}),
    },
    select: PUBLIC_SELECT,
  });
  await tx.auditLog.create({
    data: {
      actorUserId,
      action: "INVITATION_DRAFT_SAVED",
      targetType: "Invitation",
      targetId: created.id,
      afterValue: {
        email: input.email,
        role: input.role,
        branchId: input.branchId,
        ...(input.staffRecordId ? { staffRecordId: input.staffRecordId } : {}),
      },
    },
  });
  return { ok: true, invitation: toPublic(created, now), created: true };
}

/// Saves one address, as one role, as a draft for each of several branches: ALL or NONE (the several-branches invitation's rule).
export async function saveDrafts(
  actorUserId: string,
  input: { email: string; role: Role; branchIds: readonly string[] },
  scope: AdminScope,
): Promise<{ ok: true; invitations: PublicInvitation[] } | { ok: false; reason: DraftRefusal; branchName?: string }> {
  return prisma.$transaction(async (tx) => {
    const saved: PublicInvitation[] = [];
    for (const branchId of input.branchIds) {
      const result = await saveDraftIn(tx, actorUserId, { email: input.email, role: input.role, branchId }, scope);
      if (!result.ok) {
        const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { name: true } });
        // The name is given only for a branch the caller administers (the refusal came from this branch's own state), never for one they may not see.
        return {
          ok: false as const,
          reason: result.reason,
          ...(result.reason === "INVALID_BRANCH" || result.reason === "OUT_OF_SCOPE" ? {} : { branchName: branch?.name }),
        };
      }
      saved.push(result.invitation);
    }
    return { ok: true as const, invitations: saved };
  });
}

export type SendDraftResult =
  | { ok: true; invitation: PublicInvitation; token: string }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_MEMBER" | "DEACTIVATED_MEMBER" | "OUT_OF_SCOPE" | "ADMIN_ONLY" };

/// Sends a draft: makes the link (token, hash, seven days) and records when. The authority and the membership rule are asked again (the person may have joined since it was saved). The
/// caller e-mails the token after the commit. `NOT_FOUND` for anything that is not a draft the caller can see (a sent, accepted or revoked invitation, another branch's draft, an unknown id).
export async function sendDraftInvitation(actorUserId: string, invitationId: string, scope: AdminScope): Promise<SendDraftResult> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.invitation.findFirst({
      where: { id: invitationId, acceptedAt: null, revokedAt: null, tokenHash: null, ...visibleTo(scope) },
      select: { id: true, email: true, role: true, branchId: true },
    });
    if (!draft) return { ok: false, reason: "NOT_FOUND" } as const;
    await lockAddress(tx, draft.email);
    const authority = await authorityToInvite(tx, draft, scope);
    if (!authority.ok) return { ok: false, reason: authority.reason === "INVALID_BRANCH" ? "NOT_FOUND" : authority.reason } as const;
    const refusal = await membershipRefusal(tx, draft.email, draft.branchId);
    if (refusal) return { ok: false, reason: refusal } as const;
    const now = new Date();
    const token = newInvitationToken();
    const claimed = await tx.invitation.updateMany({
      where: { id: draft.id, tokenHash: null, acceptedAt: null, revokedAt: null },
      data: {
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        sentAt: now,
        invitedById: actorUserId,
      },
    });
    if (claimed.count !== 1) return { ok: false, reason: "NOT_FOUND" } as const; // two administrators sent it at once: one sends it
    const sent = await tx.invitation.findUniqueOrThrow({ where: { id: draft.id }, select: PUBLIC_SELECT });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "INVITATION_DRAFT_SENT",
        targetType: "Invitation",
        targetId: draft.id,
        afterValue: { email: draft.email, role: draft.role, branchId: draft.branchId },
      },
    });
    return { ok: true, invitation: toPublic(sent, now), token } as const;
  });
}

/// The ids of the drafts a caller may see and send, oldest first, at most `limit` (for "Send all drafts").
export async function listDraftIds(scope: AdminScope, limit: number): Promise<string[]> {
  const rows = await prisma.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null, tokenHash: null, ...visibleTo(scope) },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  return rows.map((r) => r.id);
}

/// Changes a draft's role or address. Only a draft: a sent invitation is revoked and made again, never edited. The new address is asked the membership rule and must not already have an open
/// invitation to the branch (the unique index answers `OPEN_EXISTS`).
export async function updateDraftInvitation(
  actorUserId: string,
  invitationId: string,
  patch: { email?: string; role?: Role },
  scope: AdminScope,
): Promise<{ ok: true; invitation: PublicInvitation } | { ok: false; reason: "NOT_FOUND" | DraftRefusal }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const draft = await tx.invitation.findFirst({
        where: { id: invitationId, acceptedAt: null, revokedAt: null, tokenHash: null, ...visibleTo(scope) },
        select: { id: true, email: true, role: true, branchId: true },
      });
      if (!draft) return { ok: false, reason: "NOT_FOUND" } as const;
      const next = { email: patch.email ?? draft.email, role: patch.role ?? draft.role };
      await lockAddress(tx, next.email);
      const authority = await authorityToInvite(tx, { role: next.role, branchId: draft.branchId }, scope);
      if (!authority.ok) return { ok: false, reason: authority.reason } as const;
      if (next.email !== draft.email) {
        const refusal = await membershipRefusal(tx, next.email, draft.branchId);
        if (refusal) return { ok: false, reason: refusal } as const;
      }
      const updated = await tx.invitation.update({ where: { id: draft.id }, data: next, select: PUBLIC_SELECT });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "INVITATION_DRAFT_SAVED",
          targetType: "Invitation",
          targetId: draft.id,
          afterValue: { email: next.email, role: next.role, branchId: draft.branchId, updated: true },
        },
      });
      return { ok: true, invitation: toPublic(updated, new Date()) } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "OPEN_EXISTS" };
    throw error;
  }
}

/// One invitation that is no longer open (task 0117): accepted, revoked, or run out. `revokedByName` and `revokedAt` come from the audit row of the revoke.
export type HistoricInvitation = PublicInvitation & {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  revokedByName: string | null;
  /// "revoked by an administrator" or "replaced by a new invitation".
  revokedWhy: string | null;
};

/// The history of invitations that are not open (accepted, revoked, expired without being accepted), newest first, with who revoked and why (read from the `INVITATION_REVOKED` audit
/// rows). Scoped like the open list: a branch administrator sees their own branches' and never an administrator's.
export async function listInvitationHistory(
  page: { skip: number; take: number },
  scope: AdminScope,
): Promise<{ invitations: HistoricInvitation[]; total: number }> {
  const now = new Date();
  const where: Prisma.InvitationWhereInput = {
    OR: [{ acceptedAt: { not: null } }, { revokedAt: { not: null } }, { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }],
    ...visibleTo(scope),
  };
  const [total, rows] = await Promise.all([
    prisma.invitation.count({ where }),
    prisma.invitation.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
  ]);
  const revokedIds = rows.filter((r) => r.revokedAt).map((r) => r.id);
  const audits =
    revokedIds.length === 0
      ? []
      : await prisma.auditLog.findMany({
          where: {
            action: { in: ["INVITATION_REVOKED", "INVITATION_DRAFT_DELETED"] },
            targetType: "Invitation",
            targetId: { in: revokedIds },
          },
          select: { targetId: true, actorUserId: true, reason: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
  const actors =
    audits.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: [...new Set(audits.map((a) => a.actorUserId))] } },
          select: { id: true, name: true, email: true },
        });
  const nameOf = new Map(actors.map((u) => [u.id, u.name || u.email]));
  const auditOf = new Map<string, (typeof audits)[number]>();
  for (const a of audits) if (!auditOf.has(a.targetId)) auditOf.set(a.targetId, a); // newest first: the latest revoke of an invitation
  return {
    invitations: rows.map((row) => {
      const audit = auditOf.get(row.id);
      return {
        ...toPublic(row, now),
        acceptedAt: row.acceptedAt,
        revokedAt: row.revokedAt,
        revokedByName: audit ? (nameOf.get(audit.actorUserId) ?? null) : null,
        revokedWhy: audit?.reason ?? null,
      };
    }),
    total,
  };
}

/// The open invitations (pending, and expired ones that can still be resent), newest first.
export async function listOpenInvitations(
  page: { skip: number; take: number },
  scope: AdminScope,
): Promise<{ invitations: PublicInvitation[]; total: number }> {
  const where: Prisma.InvitationWhereInput = { acceptedAt: null, revokedAt: null, ...visibleTo(scope) };
  const [total, rows] = await Promise.all([
    prisma.invitation.count({ where }),
    prisma.invitation.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
  ]);
  const now = new Date();
  return { invitations: rows.map((row) => toPublic(row, now)), total };
}

// --- the invitee's side ---------------------------------------------------------------------------------------------------

/// `viewer`: nobody signed in ("none"), signed in as the invited address's own account ("invitee"), or as someone else ("other").
export type InvitationPreview = {
  schoolName: string;
  branchName: string;
  role: Role;
  maskedEmail: string;
  accountExists: boolean;
  viewer: "none" | "invitee" | "other";
};

/// What the page shows before anyone commits: the school, the branch, the role, and whether this address already has an account (which
/// decides between "choose a password" and "sign in"). The token holder is the invitee, so this is theirs to know; the address is masked
/// anyway. `null` for unknown, used, revoked and expired alike — one answer.
export async function previewInvitation(token: string, viewerUserId: string | null = null): Promise<InvitationPreview | null> {
  const found = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: { ...PUBLIC_SELECT, tokenHash: false },
  });
  if (!found || !isLiveInvitation(found)) return null;
  const account = await prisma.user.findUnique({ where: { email: found.email }, select: { id: true } });
  const viewer = !viewerUserId ? "none" : account?.id === viewerUserId ? "invitee" : "other";
  return {
    schoolName: brand.name,
    branchName: found.branch.name,
    role: found.role,
    maskedEmail: maskEmail(found.email),
    accountExists: Boolean(account),
    viewer,
  };
}

export type AcceptInvitationInput = {
  token: string;
  /// Who is signed in right now (the session's user), or null.
  viewerUserId: string | null;
  /// Required when there is no account for the invited address; ignored otherwise. The password arrives already hashed.
  newAccount?: { name: string; passwordHash: string };
};

export type AcceptInvitationResult =
  | { ok: true; userId: string; newAccount: boolean }
  /// INVALID: unknown, used, revoked, expired — or the address belongs to a DEACTIVATED person (they come back by reactivation, never by an
  /// old link) — one answer. SIGN_IN_REQUIRED: the address has an account and nobody is signed in. WRONG_ACCOUNT: signed in as someone
  /// else. ALREADY_MEMBER: nothing to do (the link is NOT spent). INPUT_REQUIRED: a new account needs a name and a password.
  | { ok: false; reason: "INVALID" | "SIGN_IN_REQUIRED" | "WRONG_ACCOUNT" | "ALREADY_MEMBER" | "INPUT_REQUIRED" };

class Abort extends Error {
  constructor(readonly reason: Extract<AcceptInvitationResult, { ok: false }>["reason"]) {
    super(reason);
  }
}

/// Accepts the invitation in ONE transaction: read it by the token's hash, claim it with a conditional update, create or find the account,
/// create the membership, audit. Any failure rolls back ALL of it: a refused password or a lost race leaves no user, no membership and an
/// unspent link.
///
/// The rule that matters: an EXISTING account is attached only by its owner — the person signed in as that account. An administrator can
/// never attach a stranger's account, and a token holder who is signed in as someone else is refused.
export async function acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
  const hash = hashInvitationToken(input.token);
  try {
    return await prisma.$transaction(async (tx): Promise<AcceptInvitationResult> => {
      const now = new Date();
      const found = await tx.invitation.findUnique({ where: { tokenHash: hash } });
      if (!found || !isLiveInvitation(found, now)) throw new Abort("INVALID");

      const account = await tx.user.findUnique({ where: { email: found.email }, select: { id: true } });
      if (input.viewerUserId) {
        if (!account || account.id !== input.viewerUserId) throw new Abort("WRONG_ACCOUNT");
      } else if (account) {
        throw new Abort("SIGN_IN_REQUIRED");
      } else if (!input.newAccount) {
        throw new Abort("INPUT_REQUIRED");
      }

      const memberships = account
        ? await tx.membership.findMany({ where: { userId: account.id }, select: { branchId: true, deactivatedAt: true } })
        : [];
      if (memberships.some((m) => m.branchId === found.branchId && !m.deactivatedAt)) throw new Abort("ALREADY_MEMBER");
      // Deactivated in this branch, or deactivated everywhere: reactivation is the way back, not a link. (An active membership in ANOTHER
      // branch is fine — the person is simply joining a second one.)
      if (memberships.some((m) => m.branchId === found.branchId) || (memberships.length > 0 && memberships.every((m) => m.deactivatedAt))) {
        throw new Abort("INVALID");
      }

      // Single use: the conditional update must change exactly one row, so two simultaneous accepts produce one membership.
      const claimed = await tx.invitation.updateMany({
        where: { id: found.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) throw new Abort("INVALID");

      let userId: string;
      if (account) {
        userId = account.id;
      } else {
        try {
          const created = await tx.user.create({
            data: { email: found.email, name: input.newAccount!.name, passwordHash: input.newAccount!.passwordHash, emailVerified: now },
            select: { id: true },
          });
          userId = created.id;
        } catch (error) {
          // An account for this address appeared since the check above: the right path is now "sign in", not "choose a password".
          if (typeof error === "object" && error && (error as { code?: string }).code === "P2002") throw new Abort("SIGN_IN_REQUIRED");
          throw error;
        }
      }

      await tx.membership.create({ data: { userId, branchId: found.branchId, role: found.role } });
      await tx.invitation.update({ where: { id: found.id }, data: { acceptedById: userId } });
      // An invitation sent from a staff record (task 0114) links the new account to that record, in the same transaction: only a live record of THIS branch that has no account yet, whose
      // kind matches the role, and only when this account is not already the account of another record of the branch. Otherwise the membership stands and the record stays as it was (an
      // administrator can still link it from Manage).
      let linkedFromRecord = false;
      if (found.staffRecordId) {
        const record = await tx.staffRecord.findFirst({
          where: { id: found.staffRecordId, branchId: found.branchId, userId: null, ...LIVE_STAFF }, // a record made a draft since is left for the unlisted list
          select: { id: true, category: true },
        });
        const matches = record && accountFitsRecord(found.role, record.category);
        const taken = await tx.staffRecord.count({ where: { branchId: found.branchId, userId } });
        if (record && matches && taken === 0) {
          const linked = await tx.staffRecord.updateMany({ where: { id: record.id, userId: null }, data: { userId } });
          if (linked.count === 1) {
            linkedFromRecord = true;
            await tx.auditLog.create({
              data: {
                actorUserId: userId,
                action: "STAFF_ACCOUNT_LINKED",
                targetType: "StaffRecord",
                targetId: record.id,
                afterValue: { userId, byInvitation: found.id },
              },
            });
          }
        }
      }
      // Any other invitation to a staff role, or one whose record could not be linked (archived since, or of the other kind), puts the person on the branch's staff list (task 0112):
      // their record with the same e-mail is linked, or one is made from their account.
      if (!linkedFromRecord) {
        await ensureStaffRecord(tx, {
          userId,
          branchId: found.branchId,
          role: found.role,
          actorUserId: userId,
          why: `invitation ${found.id}`,
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: "INVITATION_ACCEPTED",
          targetType: "Invitation",
          targetId: found.id,
          afterValue: { role: found.role, branchId: found.branchId, newAccount: !account },
        },
      });
      return { ok: true, userId, newAccount: !account };
    });
  } catch (error) {
    if (error instanceof Abort) return { ok: false, reason: error.reason };
    throw error;
  }
}
