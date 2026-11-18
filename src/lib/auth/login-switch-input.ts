import { z } from "zod";
import { ID_PATTERN } from "@/lib/api/ids";

/// The most branches one change may name (a school has a handful; the cap only keeps a request bounded).
export const MAX_BRANCHES_PER_CHANGE = 200;

/// The body of PATCH /api/v1/settings/login-switches: which branches (`branchIds`, or `allBranches: true`; exactly one of the two) and either switch or both, real booleans, and nothing else
/// (`strict`: an unknown key is refused, never ignored). Sending only the switch you mean keeps two people who change the two switches at the same time from undoing each other.
/// `allBranches` means every branch the caller may switch: all of them for a superadmin, all of THEIR own for an administrator (never one that is not theirs).
export const loginSwitchesInput = z
  .strictObject({
    branchIds: z
      .array(z.string().regex(ID_PATTERN, "Choose valid branches."))
      .min(1, "Choose at least one branch.")
      .max(MAX_BRANCHES_PER_CHANGE, "Too many branches in one change.")
      .refine((ids) => new Set(ids).size === ids.length, "A branch is named twice.")
      .optional(),
    allBranches: z.literal(true).optional(),
    studentLoginEnabled: z.boolean().optional(),
    parentLoginEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => (value.branchIds !== undefined) !== (value.allBranches !== undefined),
    "Say which branches: either branchIds or allBranches, not both.",
  )
  .refine((value) => value.studentLoginEnabled !== undefined || value.parentLoginEnabled !== undefined, "Say which switch to change.");
export type LoginSwitchesInput = z.infer<typeof loginSwitchesInput>;
