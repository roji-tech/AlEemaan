import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { audit } from "@/lib/academics/structure";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { structureCall } from "@/lib/academics/structure-http";

const getSelfApprovalQuery = z.object({
  branchId: z.string().min(1, "branchId is required"),
});

const grantSelfApprovalInput = z.strictObject({
  branchId: z.string().min(1, "branchId is required"),
  adminUserId: z.string().min(1, "adminUserId is required"),
  unseenReviewerUserId: z.string().nullable().optional(),
});

const revokeSelfApprovalInput = z.strictObject({
  branchId: z.string().min(1, "branchId is required"),
  adminUserId: z.string().min(1, "adminUserId is required"),
});

type Query = Parsed<undefined, z.infer<typeof getSelfApprovalQuery>>;
type PostBody = Parsed<z.infer<typeof grantSelfApprovalInput>, undefined>;
type DeleteBody = Parsed<z.infer<typeof revokeSelfApprovalInput>, undefined>;

// GET /api/v1/settings/self-approval?branchId=
// Superadmin sees all grants including unseen reviewer; regular admin only sees their own status (reviewer redacted)
export const GET = withAuth(
  validate(
    { query: getSelfApprovalQuery },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "administer" }, async (_req, auth, _ctx, { query }) =>
      structureCall("SETTINGS_SELF_APPROVAL_GET", async () => {
        const superAdmin = await isSuperAdmin(auth.userId);

        if (superAdmin) {
          const grants = await prisma.adminSelfApprovalGrant.findMany({
            where: { branchId: query.branchId },
            include: {
              adminUser: { select: { id: true, name: true, email: true } },
              unseenReviewer: { select: { id: true, name: true, email: true } },
              grantedBy: { select: { id: true, name: true } },
            },
            orderBy: { grantedAt: "desc" },
          });

          return ok({
            grants: grants.map((g) => ({
              id: g.id,
              branchId: g.branchId,
              adminUser: g.adminUser,
              active: g.revokedAt === null,
              grantedAt: g.grantedAt.toISOString(),
              revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
              grantedBy: g.grantedBy,
              unseenReviewer: g.unseenReviewer,
            })),
          });
        }

        // Branch admin: only check own status, unseen reviewer strictly redacted
        const myGrant = await prisma.adminSelfApprovalGrant.findUnique({
          where: {
            branchId_adminUserId: { branchId: query.branchId, adminUserId: auth.userId },
          },
        });

        return ok({
          hasSelfApproval: myGrant !== null && myGrant.revokedAt === null,
        });
      }),
    ),
  ),
  { roles: [Role.ADMIN] },
);

// POST /api/v1/settings/self-approval - Superadmin only: grant or update self-approval
export const POST = withAuth(
  validate({ body: grantSelfApprovalInput }, async (_req, auth, _ctx, { body }: PostBody) =>
    structureCall("SETTINGS_SELF_APPROVAL_GRANT", async () => {
      // Verify target is an admin of the branch
      const adminMembership = await prisma.membership.findFirst({
        where: {
          userId: body.adminUserId,
          branchId: body.branchId,
          role: Role.ADMIN,
        },
      });

      if (!adminMembership) {
        return fail("Target user is not an administrator of this branch", 400, "BAD_REQUEST");
      }

      // If unseen reviewer specified, verify user exists
      if (body.unseenReviewerUserId) {
        const reviewer = await prisma.user.findUnique({
          where: { id: body.unseenReviewerUserId },
        });
        if (!reviewer) {
          return fail("Specified unseen reviewer user does not exist", 404, "NOT_FOUND");
        }
      }

      const grant = await prisma.adminSelfApprovalGrant.upsert({
        where: {
          branchId_adminUserId: {
            branchId: body.branchId,
            adminUserId: body.adminUserId,
          },
        },
        create: {
          branchId: body.branchId,
          adminUserId: body.adminUserId,
          grantedBySuperadminId: auth.userId,
          unseenReviewerUserId: body.unseenReviewerUserId ?? null,
          grantedAt: new Date(),
          revokedAt: null,
        },
        update: {
          grantedBySuperadminId: auth.userId,
          unseenReviewerUserId: body.unseenReviewerUserId ?? null,
          revokedAt: null,
        },
        include: {
          adminUser: { select: { id: true, name: true, email: true } },
          unseenReviewer: { select: { id: true, name: true, email: true } },
        },
      });

      await audit(auth.userId, "ADMIN_SELF_APPROVAL_GRANTED", "AdminSelfApprovalGrant", grant.id, {
        branchId: body.branchId,
        adminUserId: body.adminUserId,
        hasUnseenReviewer: Boolean(body.unseenReviewerUserId),
      });

      return ok(
        {
          grant: {
            id: grant.id,
            branchId: grant.branchId,
            adminUser: grant.adminUser,
            active: true,
            grantedAt: grant.grantedAt.toISOString(),
            unseenReviewer: grant.unseenReviewer,
          },
        },
        {},
        201,
      );
    }),
  ),
  { superAdmin: true },
);

// DELETE /api/v1/settings/self-approval - Superadmin only: revoke self-approval grant
export const DELETE = withAuth(
  validate({ body: revokeSelfApprovalInput }, async (_req, auth, _ctx, { body }: DeleteBody) =>
    structureCall("SETTINGS_SELF_APPROVAL_REVOKE", async () => {
      const existing = await prisma.adminSelfApprovalGrant.findUnique({
        where: {
          branchId_adminUserId: {
            branchId: body.branchId,
            adminUserId: body.adminUserId,
          },
        },
      });

      if (!existing) {
        return fail("Grant does not exist", 404, "NOT_FOUND");
      }

      const revoked = await prisma.adminSelfApprovalGrant.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

      await audit(auth.userId, "ADMIN_SELF_APPROVAL_REVOKED", "AdminSelfApprovalGrant", revoked.id, {
        branchId: body.branchId,
        adminUserId: body.adminUserId,
      });

      return ok({ revoked: true, revokedAt: revoked.revokedAt?.toISOString() });
    }),
  ),
  { superAdmin: true },
);
