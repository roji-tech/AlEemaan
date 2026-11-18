import "@/lib/zod-csp";
import { z } from "zod";

// The rules for an invitation's fields with NO database in them, so the single form, the route and the bulk entry (task 0084) run the same ones.

export const inviteEmail = z
  .string({ error: "Enter an email address." })
  .trim()
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.")
  .toLowerCase();

/// The database's `Role` values (a unit test pins that they are the same list).
export const ROLE_VALUES = ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF", "STUDENT", "PARENT"] as const;
export const inviteRole = z.enum(ROLE_VALUES, { error: "Choose a role." });

/// One person, one role, SEVERAL branches in one request (task 0092): the most a request may name. The route's schema and the invite dialog use the same number.
export const MAX_INVITATION_BRANCHES = 10;

/// A branch id as the API takes it (the same bounds as `branchIdField` in `lib/members/http`).
export const inviteBranchId = z.string().min(1).max(64);

/// The body of `POST /api/v1/invitations`: `{ email, role, branchId }` (one branch, the original contract) OR `{ email, role, branchIds }` (one to ten distinct branches, task 0092), never both and
/// never neither. Strict: a key that is not named is refused. Here, with no database and no server in it, so the rules are one unit test away.
export const invitationBody = z
  .strictObject({
    email: inviteEmail,
    role: inviteRole,
    branchId: inviteBranchId.optional(),
    branchIds: z
      .array(inviteBranchId, { error: "Choose the branches." })
      .min(1, "Choose at least one branch.")
      .max(MAX_INVITATION_BRANCHES, `Choose at most ${MAX_INVITATION_BRANCHES} branches at a time.`)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.branchId !== undefined && value.branchIds !== undefined) {
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Send one branch or a list of branches, not both." });
    } else if (value.branchId === undefined && value.branchIds === undefined) {
      ctx.addIssue({ code: "custom", path: ["branchId"], message: "Choose a branch." });
    } else if (value.branchIds && new Set(value.branchIds).size !== value.branchIds.length) {
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Choose each branch once." });
    }
  });
