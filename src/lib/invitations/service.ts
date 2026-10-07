import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { brand } from "@/lib/brand";
import { maskEmail } from "@/lib/auth/mask-email";
import { INVITATION_TTL_MS, hashInvitationToken, newInvitationToken } from "./token";
import { invitationStatus, isLiveInvitation, type InvitationStatus } from "./status";

// Invitations (domain-implementation-plan.md "Build design — Users pages and invitations", a port of Octalve Edu's 0.5.4).
//
//   administrator's side (ADMIN only — enforced by the routes): create, resend, revoke, list
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
  expiresAt: Date;
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
  expiresAt: row.expiresAt,
  status: invitationStatus(row, now),
});

// --- the administrator's side ---------------------------------------------------------------------------------------------

export type CreateInvitationResult =
  | { ok: true; invitation: PublicInvitation; token: string }
  | { ok: false; reason: "ALREADY_MEMBER" | "DEACTIVATED_MEMBER" | "INVALID_BRANCH" };

/// Invites `input.email`. One open invitation per address: an earlier open one is revoked (and audited) first, and a partial unique index
/// is the guarantee under concurrency — an advisory lock on the address serialises two administrators inviting the same person at the same
/// instant, so the loser revokes the winner's instead of failing on the index. Only ever tells the administrator about THIS school: an
/// address that already holds a membership (or had one deactivated) is named as such.
export async function createInvitation(
  actorUserId: string,
  input: { email: string; role: Role; branchId: string },
): Promise<CreateInvitationResult> {
  return prisma.$transaction(async (tx) => {
    // (`$executeRaw`: the lock function returns `void`, which `$queryRaw` cannot deserialise.)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invitation:${input.email}`}::text))`;

    const branch = await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
    if (!branch) return { ok: false, reason: "INVALID_BRANCH" } as const;

    // The membership check looks at the PERSON, not the branch: one active membership per person is the rule these pages keep.
    const memberships = await tx.membership.findMany({ where: { user: { email: input.email } }, select: { deactivatedAt: true } });
    if (memberships.some((m) => !m.deactivatedAt)) return { ok: false, reason: "ALREADY_MEMBER" } as const;
    if (memberships.length > 0) return { ok: false, reason: "DEACTIVATED_MEMBER" } as const;

    const now = new Date();
    const earlier = await tx.invitation.findMany({
      where: { email: input.email, acceptedAt: null, revokedAt: null },
      select: { id: true },
    });
    for (const old of earlier) {
      await tx.invitation.update({ where: { id: old.id }, data: { revokedAt: now } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "INVITATION_REVOKED",
          targetType: "Invitation",
          targetId: old.id,
          afterValue: { email: input.email },
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
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      },
      select: PUBLIC_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "INVITATION_CREATED",
        targetType: "Invitation",
        targetId: created.id,
        afterValue: { email: input.email, role: input.role, branchId: input.branchId },
      },
    });
    return { ok: true, invitation: toPublic(created, now), token } as const;
  });
}

/// A fresh link and a fresh seven days for an invitation that is still open (pending OR expired); the earlier link stops working at once.
/// `null` when there is no such open invitation (accepted, revoked, unknown: one answer).
export async function resendInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<{ invitation: PublicInvitation; token: string } | null> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.invitation.findFirst({
      where: { id: invitationId, acceptedAt: null, revokedAt: null },
      select: { id: true, email: true },
    });
    if (!open) return null;
    const now = new Date();
    const token = newInvitationToken();
    const updated = await tx.invitation.update({
      where: { id: open.id },
      data: { tokenHash: hashInvitationToken(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) },
      select: PUBLIC_SELECT,
    });
    await tx.auditLog.create({
      data: { actorUserId, action: "INVITATION_RESENT", targetType: "Invitation", targetId: open.id, afterValue: { email: open.email } },
    });
    return { invitation: toPublic(updated, now), token };
  });
}

/// Ends an open invitation. The conditional update is the gate: it changes exactly one row or the answer is "no such open invitation".
export async function revokeInvitation(actorUserId: string, invitationId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.invitation.findUnique({ where: { id: invitationId }, select: { email: true } });
    const claimed = await tx.invitation.updateMany({
      where: { id: invitationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "INVITATION_REVOKED",
        targetType: "Invitation",
        targetId: invitationId,
        afterValue: { email: target?.email ?? null },
      },
    });
    return true;
  });
}

/// The open invitations (pending, and expired ones that can still be resent), newest first.
export async function listOpenInvitations(page: {
  skip: number;
  take: number;
}): Promise<{ invitations: PublicInvitation[]; total: number }> {
  const where: Prisma.InvitationWhereInput = { acceptedAt: null, revokedAt: null };
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

      const memberships = account ? await tx.membership.findMany({ where: { userId: account.id }, select: { deactivatedAt: true } }) : [];
      if (memberships.some((m) => !m.deactivatedAt)) throw new Abort("ALREADY_MEMBER");
      if (memberships.length > 0) throw new Abort("INVALID"); // deactivated: reactivation is the way back, not an old link

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
