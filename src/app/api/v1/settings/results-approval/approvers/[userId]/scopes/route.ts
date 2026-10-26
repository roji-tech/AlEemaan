import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { isPlausibleId } from "@/lib/api/ids";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { setApproverScopes } from "@/lib/academics/approver-settings";
import { approverSettingsFailure, proofRefusal, setScopesBody, settingsWriteLimited } from "@/lib/academics/approver-settings-http";

type PutBody = Parsed<z.infer<typeof setScopesBody>, undefined>;
type Ctx = { params: Promise<{ userId: string }> };

// PUT /api/v1/settings/results-approval/approvers/[userId]/scopes   { branchId, scopes: [{ kind: "GENERAL" } | { kind: "SECTION", sectionId } | { kind: "CLASS", classGroupId }], stepUp }
// Superadmin only. Replaces where one approver approves in one branch, as a set. The person must hold the permission (409 NOT_AN_APPROVER otherwise); General cannot be combined
// with others; an empty list means "approves nothing". An unchanged set writes no audit row.
export const PUT = withAuth(
  validate({ body: setScopesBody }, async (_req, admin: { userId: string }, ctx: Ctx, { body }: PutBody) =>
    structureCall("SETTINGS_APPROVER_SCOPES", async () => {
      const { userId } = await ctx.params;
      if (!isPlausibleId(userId)) return notFound("Person");
      const limited = await settingsWriteLimited(admin.userId);
      if (limited) return limited;
      const refused = await proofRefusal(admin.userId, body.stepUp);
      if (refused) return refused;
      const result = await setApproverScopes(admin.userId, body.branchId, userId, body.scopes);
      return result.ok ? ok({ changed: result.changed, scopes: result.scopes }) : approverSettingsFailure(result.reason, result.what);
    }),
  ),
  { superAdmin: true },
);
