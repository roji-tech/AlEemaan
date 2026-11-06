import { z } from "zod";
import { ID_PATTERN } from "@/lib/api/ids";

/// The body of a ceiling switch's PATCH (`programs.enabled`, `standing.branchAdminMaySuspend`, ...): the school's value or one branch's. `.strict()`: an unknown key is refused.
export const switchSettingSchema = z
  .object({
    scope: z.enum(["GLOBAL", "BRANCH"]),
    branchId: z.string().regex(ID_PATTERN, "The branch is not valid").optional(),
    /// null removes the stored value (back to the default, on).
    enabled: z.boolean().nullable(),
    reason: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine(
    (value) => (value.scope === "BRANCH") === (value.branchId !== undefined),
    "A branch value names the branch and a school value does not",
  );
