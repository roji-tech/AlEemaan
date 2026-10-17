import { z } from "zod";
import { Role, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { structureCall } from "@/lib/academics/structure-http";

const approvalListQuery = z.object({
  branchId: z.string().min(1, "branchId is required"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "DRAFT"]).optional(),
});

type Query = Parsed<undefined, z.infer<typeof approvalListQuery>>;

// GET /api/v1/settings/approval?branchId=&status=
// List approvals for a branch. Administrators of branch or superadmin.
export const GET = withAuth(
  validate(
    { query: approvalListQuery },
    withBranch<Query, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "staff-read" },
      async (_req, auth, _ctx, { query }, branch) =>
        structureCall("SETTINGS_APPROVAL_LIST", async () => {
          const superAdmin = await isSuperAdmin(auth.userId);
          const isAdmin = branch.role === Role.ADMIN || superAdmin;

          // If regular staff (teacher), only see approvals they requested
          const whereClause = {
            branchId: query.branchId,
            ...(query.status ? { status: query.status as SettingStatus } : {}),
            ...(!isAdmin ? { actorUserId: auth.userId } : {}),
          };

          const approvals = await prisma.settingApproval.findMany({
            where: whereClause,
            include: {
              actor: { select: { id: true, name: true, email: true } },
              decider: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
          });

          return ok({
            approvals: approvals.map((a) => {
              const hideDecider = a.visibility === "HIDDEN_TO_SUBJECT" && !isSuperAdmin;
              return {
                id: a.id,
                settingKey: a.settingKey,
                targetType: a.targetType,
                targetId: a.targetId,
                scope: a.scope,
                branchId: a.branchId,
                actor: { id: a.actor.id, name: a.actor.name },
                reason: a.reason,
                status: a.status,
                decider: hideDecider || !a.decider ? null : { id: a.decider.id, name: a.decider.name },
                decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
                decisionReason: a.decisionReason,
                proposedValue: a.proposedValue,
                createdAt: a.createdAt.toISOString(),
                updatedAt: a.updatedAt.toISOString(),
              };
            }),
          });
        }),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
