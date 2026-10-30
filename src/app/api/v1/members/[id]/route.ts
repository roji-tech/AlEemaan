import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { branchIdField, isPlausibleId, memberFailure, notFound, roleField, scopeOrForbidden } from "@/lib/members/http";
import { changeMember } from "@/lib/members/service";
import { stepUpFailure, stepUpProofSchema, verifyStepUpProof } from "@/lib/auth/step-up";

// PATCH /api/v1/members/[id]  { role?, branchId?, canApproveResults?, canViewFormResults?, stepUp? }                      (Users pages — a port of Octalve Edu's 0.5.4)
// Change a member's role, branch and/or whether they may approve results — administrators only (a branch administrator: people of their own branches, never an
// administrator or a superadmin, never to ADMIN), audited with before/after. `canApproveResults` (task 0039) is a SUPERADMIN's alone and needs `stepUp`, a fresh proof
// (their password, or the code from their authenticator when two-step verification is on): turning it on gives the person a General scope (the whole branch) for the
// superadmin to narrow; turning it off, a role that cannot hold it, or a move to another branch removes where they approve. The body is STRICT: a key it does not
// name (a `userId`, a `passwordHash`) is refused, never ignored. Authority rules live in lib/members/service.ts: nobody changes themselves, a branch must be one of the
// school's. `[id]` is the MEMBERSHIP's id. `canViewFormResults` lets a member of staff READ the results, answers and turn-ins of the branch's forms (never the answer key, never
// write): an administrator of the member's branch may give it, with the same fresh proof; a move to another branch or a role that is not staff takes it away.
const CHANGES_PER_WINDOW = 60;
type Ctx = { params: Promise<{ id: string }> };

const body = z
  .strictObject({
    role: roleField.optional(),
    branchId: branchIdField.optional(),
    canApproveResults: z.boolean().optional(),
    canViewFormResults: z.boolean().optional(),
    stepUp: stepUpProofSchema.optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.branchId !== undefined ||
      value.canApproveResults !== undefined ||
      value.canViewFormResults !== undefined,
    "Give a role, a branch, whether they approve results, or whether they read form results.",
  )
  .refine((value) => (value.canApproveResults === undefined && value.canViewFormResults === undefined) || value.stepUp !== undefined, {
    message: "Confirm with your password or your authenticator code.",
    path: ["stepUp"],
  });

export const PATCH = withAuth(
  validate({ body }, async (_req, auth: AuthContext, ctx: Ctx, { body: change }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("member");
    if (!(await reserveAttempt(`member:change:${auth.userId}`, CHANGES_PER_WINDOW))) {
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    }
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const { stepUp, ...changes } = change;
    if (changes.canApproveResults !== undefined) {
      if (!scope.superAdmin) return memberFailure("SUPERADMIN_ONLY"); // before a proof is spent on a request that cannot succeed
    }
    if (changes.canApproveResults !== undefined || changes.canViewFormResults !== undefined) {
      const proof = await verifyStepUpProof(auth.userId, stepUp!);
      if (!proof.ok) return stepUpFailure(proof);
    }
    const result = await changeMember(auth.userId, id, changes, scope);
    return result.ok ? ok({ member: result.member, changed: result.changed }) : memberFailure(result.reason);
  }),
  { roles: ["ADMIN"] },
);
