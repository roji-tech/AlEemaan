import { z } from "zod";
import { PupilNameFormat } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
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
// Superadmin only: configure verification fields for a branch (or global when branchId is null)
export const PATCH = withAuth(
  validate({ body: patchVerificationInput }, async (_req, auth, _ctx, { body }: PatchBody) =>
    structureCall("SETTINGS_VERIFICATION_PATCH", async () => {
      const branchId = body.branchId ?? null;

      const existing = branchId
        ? await prisma.verificationPageConfig.findUnique({ where: { branchId } })
        : await prisma.verificationPageConfig.findFirst({ where: { branchId: null } });

      const updated = existing
        ? await prisma.verificationPageConfig.update({
            where: { id: existing.id },
            data: {
              ...(body.showPupilName !== undefined ? { showPupilName: body.showPupilName } : {}),
              ...(body.pupilNameFormat !== undefined ? { pupilNameFormat: body.pupilNameFormat } : {}),
              ...(body.showSubject !== undefined ? { showSubject: body.showSubject } : {}),
              ...(body.showMarks !== undefined ? { showMarks: body.showMarks } : {}),
              ...(body.showGrade !== undefined ? { showGrade: body.showGrade } : {}),
            },
          })
        : await prisma.verificationPageConfig.create({
            data: {
              branchId,
              showPupilName: body.showPupilName ?? true,
              pupilNameFormat: body.pupilNameFormat ?? PupilNameFormat.FIRST_LAST_INITIAL,
              showSubject: body.showSubject ?? true,
              showMarks: body.showMarks ?? false,
              showGrade: body.showGrade ?? false,
            },
          });

      await audit(auth.userId, "VERIFICATION_CONFIG_UPDATE", "VerificationPageConfig", updated.id, {
        branchId,
        config: updated,
      });

      return ok({ config: updated });
    }),
  ),
  { superAdmin: true },
);
