import { after } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { offsetMeta, parseOffsetPagination } from "@/lib/api/pagination";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { createInvitation, listOpenInvitations } from "@/lib/invitations/service";
import { mailInvitation } from "@/lib/invitations/mail";
import { branchIdField, emailField, roleField, scopeOrForbidden } from "@/lib/members/http";

// /api/v1/invitations                                                  (Users pages — a port of Octalve Edu's 0.5.4)
//   GET   the open invitations (pending, and expired ones that can be resent) — never a token or its hash
//   POST  invite an address — administrators only (a branch administrator: their own branches, roles below ADMIN); a hashed, single-use, seven-day link is emailed AFTER the response
// The answer is the same whether or not the address has an account: the administrator learns only whether that person already holds a
// membership here (or had one deactivated), never who is registered.
const CREATES_PER_WINDOW = 30; // per administrator per 5 minutes
const PER_ADDRESS = 3; // per address per 5 minutes: you can resend, not hammer

const body = z.strictObject({ email: emailField, role: roleField, branchId: branchIdField });

export const GET = withAuth(
  async (req, auth) => {
    const page = parseOffsetPagination(req.nextUrl.searchParams);
    if (!page.ok)
      return fail(
        "Some of the query parameters are not valid.",
        400,
        "VALIDATION",
        page.issues.map((i) => ({ ...i, path: `query.${i.path}` })),
      );
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const { invitations, total } = await listOpenInvitations(page, scope);
    return ok({ invitations }, offsetMeta({ page: page.page, limit: page.limit, total }));
  },
  { roles: ["ADMIN"] },
);

export const POST = withAuth(
  validate({ body }, async (_req, auth: AuthContext, _ctx: unknown, { body: input }) => {
    if (!(await reserveAttempt(`invite:create:${auth.userId}`, CREATES_PER_WINDOW))) {
      return fail("Too many invitations. Please try again in a few minutes.", 429, "RATE_LIMITED");
    }
    if (!(await reserveAttempt(`invite:to:${input.email}`, PER_ADDRESS))) {
      return fail("That address was invited several times just now. Please wait a few minutes.", 429, "RATE_LIMITED");
    }
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
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
  }),
  { roles: ["ADMIN"] },
);
