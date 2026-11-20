import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { adminScope } from "@/lib/auth/branch-access";

// GET   /api/v1/settings/family-secrets   the branches this administrator runs, each with whether its families may still sign in with the date of birth (pupil) or the guardian's
//                                         phone or e-mail besides an access code (task 0113, task 0094 D7). A superadmin: every branch.
// PATCH /api/v1/settings/family-secrets { branchId, legacyPortalSecrets }   switches it for one branch: an administrator of that branch or a superadmin (403 for another branch). Audited.
const body = z.strictObject({ branchId: z.string().trim().min(1).max(64), legacyPortalSecrets: z.boolean() });

export const GET = withAuth(
  async (_req, auth) => {
    const scope = await adminScope(auth.userId);
    const branches = await prisma.branch.findMany({
      where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, legacyPortalSecrets: true },
    });
    return noStore(ok({ branches }));
  },
  { roles: [Role.ADMIN] },
);

export const PATCH = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body: input }) => {
        const before = await prisma.branch.findUniqueOrThrow({ where: { id: input.branchId }, select: { legacyPortalSecrets: true } });
        const branch = await prisma.branch.update({
          where: { id: input.branchId },
          data: { legacyPortalSecrets: input.legacyPortalSecrets },
          select: { id: true, name: true, legacyPortalSecrets: true },
        });
        if (before.legacyPortalSecrets !== input.legacyPortalSecrets) {
          await prisma.auditLog.create({
            data: {
              actorUserId: auth.userId,
              action: "FAMILY_SECRETS_CHANGED",
              targetType: "Branch",
              targetId: input.branchId,
              beforeValue: { legacyPortalSecrets: before.legacyPortalSecrets },
              afterValue: { legacyPortalSecrets: input.legacyPortalSecrets },
            },
          });
        }
        return noStore(ok({ branch }));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
