import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { isPlausibleId } from "@/lib/api/ids";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { placeClassGroup } from "@/lib/academics/approver-settings";
import { approverSettingsFailure, placeClassGroupBody, proofRefusal, settingsWriteLimited } from "@/lib/academics/approver-settings-http";

type PutBody = Parsed<z.infer<typeof placeClassGroupBody>, undefined>;
type Ctx = { params: Promise<{ id: string }> };

// PUT /api/v1/settings/results-approval/class-groups/[id]/section   { sectionId: string | null, stepUp }   Superadmin only. Puts a class in a live section of its own branch, or takes
// it out (null). A class is in at most one section, so placing it again moves it.
export const PUT = withAuth(
  validate({ body: placeClassGroupBody }, async (_req, admin: { userId: string }, ctx: Ctx, { body }: PutBody) =>
    structureCall("SETTINGS_CLASS_GROUP_SECTION", async () => {
      const { id } = await ctx.params;
      if (!isPlausibleId(id)) return notFound("Class group");
      const limited = await settingsWriteLimited(admin.userId);
      if (limited) return limited;
      const refused = await proofRefusal(admin.userId, body.stepUp);
      if (refused) return refused;
      const result = await placeClassGroup(admin.userId, id, body.sectionId);
      return result.ok ? ok({ classGroup: result.classGroup, changed: result.changed }) : approverSettingsFailure(result.reason, result.what);
    }),
  ),
  { superAdmin: true },
);
