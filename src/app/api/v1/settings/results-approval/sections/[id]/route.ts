import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { isPlausibleId } from "@/lib/api/ids";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { updateSection } from "@/lib/academics/approver-settings";
import { approverSettingsFailure, proofRefusal, settingsWriteLimited, updateSectionBody } from "@/lib/academics/approver-settings-http";

type PatchBody = Parsed<z.infer<typeof updateSectionBody>, undefined>;
type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/settings/results-approval/sections/[id]   { name?, sortOrder?, archived?, stepUp }   Superadmin only. Rename, reorder, archive or restore. Archiving ends what the section
// granted; the scopes that name it stay on record and cover nothing until it is restored.
export const PATCH = withAuth(
  validate({ body: updateSectionBody }, async (_req, admin: { userId: string }, ctx: Ctx, { body }: PatchBody) =>
    structureCall("SETTINGS_SECTION_UPDATE", async () => {
      const { id } = await ctx.params;
      if (!isPlausibleId(id)) return notFound("Section");
      const limited = await settingsWriteLimited(admin.userId);
      if (limited) return limited;
      const { stepUp, ...patch } = body;
      const refused = await proofRefusal(admin.userId, stepUp);
      if (refused) return refused;
      const result = await updateSection(admin.userId, id, patch);
      return result.ok ? ok({ section: result.section, changed: result.changed }) : approverSettingsFailure(result.reason, result.what);
    }),
  ),
  { superAdmin: true },
);
