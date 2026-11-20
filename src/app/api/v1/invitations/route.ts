import { after } from "next/server";
import type { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { pagedOk, readPage } from "@/lib/api/paged";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import type { AdminScope } from "@/lib/auth/branch-access";
import {
  createInvitation,
  createInvitations,
  listOpenInvitations,
  saveDraftIn,
  saveDrafts,
  type DraftRefusal,
} from "@/lib/invitations/service";
import { prisma } from "@/lib/db";
import { mailInvitation, mailInvitations } from "@/lib/invitations/mail";
import { invitationBody } from "@/lib/invitations/rules";
import { scopeOrForbidden } from "@/lib/members/http";

// /api/v1/invitations                                                  (Users pages — a port of Octalve Edu's 0.5.4)
//   GET   the open invitations (pending, and expired ones that can be resent) — never a token or its hash
//   POST  invite an address — administrators only (a branch administrator: their own branches, roles below ADMIN); a hashed, single-use, seven-day link is emailed AFTER the response
//         `{ email, role, branchId }` invites to ONE branch (201 `{ invitation }`, the earlier open invitation to that branch is replaced);
//         `draft: true` (task 0101 D2) SAVES the invitation without sending it: no link, no e-mail, no expiry until it is sent (POST /api/v1/invitations/[id]/send or /drafts/send). 201 as above, with
//         `status: "draft"`. A draft never replaces a SENT open invitation for the same address and branch (409 `OPEN_EXISTS`: resend or revoke that one); it updates an earlier draft.
//         `{ email, role, branchIds: [...] }` invites to SEVERAL at once (task 0092; 201 `{ invitations }`): all or none, and refused when ANY branch is one the caller does not administer, one the person
//         already belongs to or one that already has a link waiting. One e-mail lists every branch with one link each. Exactly one of the two fields is allowed.
// The answer is the same whether or not the address has an account: the administrator learns only whether that person already holds a
// membership here (or had one deactivated), never who is registered.
const CREATES_PER_WINDOW = 30; // per administrator per 5 minutes
const PER_ADDRESS = 3; // per address per 5 minutes: you can resend, not hammer
const DRAFTS_PER_WINDOW = 60; // draft saves per administrator per 5 minutes (task 0101 D2): they send nothing, so the limit is looser

export const GET = withAuth(
  async (req, auth) => {
    const page = readPage(req);
    if (page instanceof Response) return page;
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const { invitations, total } = await listOpenInvitations(page, scope);
    return pagedOk("invitations", invitations, page, total);
  },
  { roles: ["ADMIN"] },
);

export const POST = withAuth(
  validate({ body: invitationBody }, async (_req, auth: AuthContext, _ctx: unknown, { body: input }) => {
    const several = input.branchIds !== undefined;
    if (input.draft === true) return saveAsDraft(auth, input, await scopeOrForbidden(auth.userId));
    // Each invitation counts once against the administrator's limit, so naming ten branches is not a way around "30 in five minutes".
    for (let i = 0; i < (input.branchIds?.length ?? 1); i++) {
      if (!(await reserveAttempt(`invite:create:${auth.userId}`, CREATES_PER_WINDOW))) {
        return fail("Too many invitations. Please try again in a few minutes.", 429, "RATE_LIMITED");
      }
    }
    if (!(await reserveAttempt(`invite:to:${input.email}`, PER_ADDRESS))) {
      return fail("That address was invited several times just now. Please wait a few minutes.", 429, "RATE_LIMITED");
    }
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    return several
      ? inviteToSeveral(auth, { email: input.email, role: input.role, branchIds: input.branchIds! }, scope)
      : inviteToOne(auth, { email: input.email, role: input.role, branchId: input.branchId! }, scope);
  }),
  { roles: ["ADMIN"] },
);

async function inviteToOne(auth: AuthContext, input: { email: string; role: Role; branchId: string }, scope: AdminScope) {
  const result = await createInvitation(auth.userId, input, scope);
  if (!result.ok) {
    switch (result.reason) {
      case "ALREADY_MEMBER":
        return fail("That person is already a member.", 409, "ALREADY_MEMBER", [
          { path: "body.email", message: "That person is already a member." },
        ]);
      case "DEACTIVATED_MEMBER":
        return fail("That person was deactivated. Reactivate them instead.", 409, "DEACTIVATED_MEMBER", [
          { path: "body.email", message: "Deactivated — reactivate them instead." },
        ]);
      case "OUT_OF_SCOPE":
        return fail("You can only invite people to the branches you administer.", 403, "FORBIDDEN");
      case "ADMIN_ONLY":
        return fail("Only a superadmin can invite an administrator.", 403, "FORBIDDEN");
      case "INVALID_BRANCH":
        return fail("Choose one of the school's branches.", 400, "VALIDATION", [
          { path: "body.branchId", message: "Choose one of the school's branches." },
        ]);
    }
  }

  after(async () => {
    try {
      await mailInvitation({
        email: input.email,
        token: result.token,
        branchName: result.invitation.branchName,
        role: input.role,
        inviterName: auth.user.name,
      });
    } catch (error) {
      console.error("[invitations] mail failed:", error instanceof Error ? error.message : error);
    }
  });
  return ok({ invitation: result.invitation }, {}, 201);
}

/// The several-branches request (task 0092). The refusals of authority are the single invitation's, word for word, and name no branch (a branch the caller may not see is never named); a conflict in a
/// branch the caller DOES administer is named, because they need to know which one to take out of the list.
async function inviteToSeveral(auth: AuthContext, input: { email: string; role: Role; branchIds: string[] }, scope: AdminScope) {
  const result = await createInvitations(auth.userId, input, scope);
  if (!result.ok) {
    switch (result.reason) {
      case "OUT_OF_SCOPE":
        return fail("You can only invite people to the branches you administer.", 403, "FORBIDDEN");
      case "ADMIN_ONLY":
        return fail("Only a superadmin can invite an administrator.", 403, "FORBIDDEN");
      case "INVALID_BRANCH":
        return fail("Choose only the school's branches.", 400, "VALIDATION", [
          { path: "body.branchIds", message: "Choose only the school's branches." },
        ]);
      case "ALREADY_MEMBER": {
        const message = `That person is already a member of ${result.branchName}. Nothing was sent.`;
        return fail(message, 409, "ALREADY_MEMBER", [{ path: "body.branchIds", message }]);
      }
      case "DEACTIVATED_MEMBER": {
        const message = `That person was deactivated, so they can't be added to ${result.branchName}. Reactivate them instead. Nothing was sent.`;
        return fail(message, 409, "DEACTIVATED_MEMBER", [{ path: "body.branchIds", message }]);
      }
      case "ALREADY_INVITED": {
        const message = `An invitation to ${result.branchName} is already waiting for that address. Revoke it or leave ${result.branchName} out. Nothing was sent.`;
        return fail(message, 409, "INVITATION_PENDING", [{ path: "body.branchIds", message }]);
      }
    }
  }

  after(async () => {
    try {
      await mailInvitations({
        email: input.email,
        role: input.role,
        inviterName: auth.user.name,
        invitations: result.invitations.map((i) => ({ branchName: i.invitation.branchName, token: i.token })),
      });
    } catch (error) {
      console.error("[invitations] mail failed:", error instanceof Error ? error.message : error);
    }
  });
  return ok({ invitations: result.invitations.map((i) => i.invitation) }, {}, 201);
}

/// Saves the invitation as a draft (task 0101 D2). Nothing is mailed. The refusals are the sending path's, word for word, plus `OPEN_EXISTS`.
async function saveAsDraft(
  auth: AuthContext,
  input: { email: string; role: Role; branchId?: string; branchIds?: string[] },
  scope: AdminScope | Response,
): Promise<Response> {
  if (scope instanceof Response) return scope;
  // Saving a draft sends nothing, but it writes rows: it has its own limit (60 per administrator per 5 minutes), counted apart from sending, so drafts cannot be used to fill the table.
  for (let i = 0; i < (input.branchIds?.length ?? 1); i++) {
    if (!(await reserveAttempt(`invite:draft:${auth.userId}`, DRAFTS_PER_WINDOW))) {
      return fail("Too many drafts. Please try again in a few minutes.", 429, "RATE_LIMITED");
    }
  }
  const refuse = (reason: DraftRefusal, branchName?: string): Response => {
    const where = branchName ? ` in ${branchName}` : "";
    switch (reason) {
      case "ALREADY_MEMBER":
        return fail(`That person is already a member${where}.`, 409, "ALREADY_MEMBER", [
          { path: "body.email", message: "That person is already a member." },
        ]);
      case "DEACTIVATED_MEMBER":
        return fail(`That person was deactivated${where}. Reactivate them instead.`, 409, "DEACTIVATED_MEMBER", [
          { path: "body.email", message: "Deactivated: reactivate them instead." },
        ]);
      case "OPEN_EXISTS":
        return fail(`An invitation to that address is already open${where}. Resend or revoke it first.`, 409, "INVITATION_PENDING", [
          { path: "body.email", message: "An invitation is already open." },
        ]);
      case "OUT_OF_SCOPE":
        return fail("You can only invite people to the branches you administer.", 403, "FORBIDDEN");
      case "ADMIN_ONLY":
        return fail("Only a superadmin can invite an administrator.", 403, "FORBIDDEN");
      case "INVALID_BRANCH":
        return fail("Choose one of the school's branches.", 400, "VALIDATION", [
          { path: "body.branchId", message: "Choose one of the school's branches." },
        ]);
    }
  };
  if (input.branchIds) {
    const result = await saveDrafts(auth.userId, { email: input.email, role: input.role, branchIds: input.branchIds }, scope);
    return result.ok ? ok({ invitations: result.invitations }, {}, 201) : refuse(result.reason, result.branchName);
  }
  const result = await prisma.$transaction((tx) =>
    saveDraftIn(tx, auth.userId, { email: input.email, role: input.role, branchId: input.branchId! }, scope),
  );
  return result.ok ? ok({ invitation: result.invitation }, {}, result.created ? 201 : 200) : refuse(result.reason);
}
