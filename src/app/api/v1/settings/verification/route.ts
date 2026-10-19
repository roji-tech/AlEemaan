import { z } from "zod";
import { PupilNameFormat, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { canAdminister, isSuperAdmin } from "@/lib/auth/branch-access";
import { VERIFICATION_KEY, applyVerification, fileRequest, type VerificationValue } from "@/lib/settings/changes";
import { getVerificationPageConfig } from "@/lib/settings/approvals";
import { audit } from "@/lib/academics/structure";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";

const getVerificationQuery = z.object({
  branchId: z.string().optional(),
});

const patchVerificationInput = z
  .strictObject({
    branchId: z.string().nullable().optional(),
    showPupilName: z.boolean().optional(),
    pupilNameFormat: z.nativeEnum(PupilNameFormat).optional(),
    showSubject: z.boolean().optional(),
    showMarks: z.boolean().optional(),
    showGrade: z.boolean().optional(),
    /// Required from an administrator: why the change is needed (it goes to a superadmin).
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

type Query = Parsed<undefined, z.infer<typeof getVerificationQuery>>;
type PatchBody = Parsed<z.infer<typeof patchVerificationInput>, undefined>;

// GET /api/v1/settings/verification?branchId=
// Read verification page config for a branch (or global)
export const GET = withAuth(
  validate({ query: getVerificationQuery }, async (_req, _auth, _ctx, { query }: Query) =>
    structureCall("SETTINGS_VERIFICATION_GET", async () => {
      const config = await getVerificationPageConfig(query.branchId);
      return ok({ config });
    }),
  ),
  { roles: READ_ROLES },
);

// PATCH /api/v1/settings/verification
// A superadmin configures the fields for a branch (or school-wide when branchId is null) and it applies at once. An administrator may propose a change for a branch they
// administer: it needs a reason and waits as a request until a superadmin approves it (the maintainer's decision of 2026-10-15).
export const PATCH = withAuth(
  validate({ body: patchVerificationInput }, async (_req, auth, _ctx, { body }: PatchBody) =>
    structureCall("SETTINGS_VERIFICATION_PATCH", async () => {
      const branchId = body.branchId ?? null;
      const { branchId: _omit, reason, ...fields } = body;
      void _omit;
      const value: VerificationValue = fields;

      if (!(await isSuperAdmin(auth.userId))) {
        if (!branchId) return fail("Only a superadmin can change the school-wide setting. Choose your branch.", 403, "FORBIDDEN");
        if (!(await canAdminister(auth.userId, branchId))) return fail("You don't administer that branch.", 403, "FORBIDDEN");
        if (!reason) {
          return fail("Say why this change is needed: it goes to a superadmin for approval.", 400, "VALIDATION", [
            { path: "body.reason", message: "A reason is required: a superadmin decides what the public page shows." },
          ]);
        }
        const request = await fileRequest({
          key: VERIFICATION_KEY,
          targetType: "VERIFICATION_CONFIG",
          branchId,
          actorUserId: auth.userId,
          reason,
          proposedValue: value,
        });
        return ok({ pending: true, approvalId: request.id }, {}, 202);
      }

      const updated = await prisma.$transaction((tx) => applyVerification(tx, branchId, value));
      await audit(auth.userId, "VERIFICATION_CONFIG_UPDATE", "VerificationPageConfig", updated.id, {
        branchId,
        config: updated,
      });
      return ok({ config: updated });
    }),
  ),
  { roles: [Role.ADMIN] },
);
