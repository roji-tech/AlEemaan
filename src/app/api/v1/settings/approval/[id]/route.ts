import { z } from "zod";
import { Role, SettingStatus, SchemeScopeLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { canAdminister, isSuperAdmin } from "@/lib/auth/branch-access";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { applyApprovedRequest } from "@/lib/settings/changes";

type Context = { params: Promise<{ id: string }> };

const decisionInput = z.strictObject({
  action: z.enum(["APPROVE", "REJECT"]),
  decisionReason: z.string().trim().min(1, "A decision reason is required").max(500),
});

type PatchBody = Parsed<z.infer<typeof decisionInput>, undefined>;

// GET /api/v1/settings/approval/[id] - Read single approval request
export const GET = withAuth<Context>(
  async (_req, auth, ctx) =>
    structureCall("SETTINGS_APPROVAL_GET", async () => {
      const id = (await ctx.params).id;
      const approval = await prisma.settingApproval.findUnique({
        where: { id },
        include: {
          actor: { select: { id: true, name: true, email: true } },
          decider: { select: { id: true, name: true, email: true } },
        },
      });

      if (!approval) return notFound("SettingApproval");

      const superAdmin = await isSuperAdmin(auth.userId);
      const isAdmin = approval.branchId ? await canAdminister(auth.userId, approval.branchId) : superAdmin;
      const isOwner = approval.actorUserId === auth.userId;

      if (!isAdmin && !isOwner) {
        return notFound("SettingApproval");
      }

      const hideDecider = approval.visibility === "HIDDEN_TO_SUBJECT" && !superAdmin;

      return ok({
        approval: {
          id: approval.id,
          settingKey: approval.settingKey,
          targetType: approval.targetType,
          targetId: approval.targetId,
          scope: approval.scope,
          branchId: approval.branchId,
          actor: { id: approval.actor.id, name: approval.actor.name },
          reason: approval.reason,
          status: approval.status,
          decider: hideDecider || !approval.decider ? null : { id: approval.decider.id, name: approval.decider.name },
          decidedAt: approval.decidedAt ? approval.decidedAt.toISOString() : null,
          decisionReason: approval.decisionReason,
          proposedValue: approval.proposedValue,
          createdAt: approval.createdAt.toISOString(),
          updatedAt: approval.updatedAt.toISOString(),
        },
      });
    }),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);

// PATCH /api/v1/settings/approval/[id] - Decide approval request (APPROVE or REJECT with reason)
export const PATCH = withAuth<Context>(
  validate({ body: decisionInput }, async (_req, auth, ctx, { body }: PatchBody) =>
    structureCall("SETTINGS_APPROVAL_DECIDE", async () => {
      const id = (await ctx.params).id;
      const approval = await prisma.settingApproval.findUnique({
        where: { id },
      });

      if (!approval) return notFound("SettingApproval");

      if (approval.status !== SettingStatus.PENDING) {
        return fail("This approval request has already been decided", 409, "CONFLICT");
      }

      // Check authority: must administer the branch, or be superadmin
      const superAdmin = await isSuperAdmin(auth.userId);
      const canAdmin = approval.branchId ? await canAdminister(auth.userId, approval.branchId) : superAdmin;

      if (!canAdmin && !superAdmin) {
        return fail("Only branch administrators or superadmins can decide approvals", 403, "FORBIDDEN");
      }

      // A change to a layout or to the public verification page is decided by a superadmin only (a branch administrator is the one asking).
      if ((approval.targetType === "SETTING" || approval.targetType === "VERIFICATION_CONFIG") && !superAdmin) {
        return fail("Only a superadmin can decide this request", 403, "FORBIDDEN");
      }

      // Teacher / actor cannot approve their own scheme or request
      if (approval.actorUserId === auth.userId && !superAdmin) {
        return fail("Self-approval is not permitted: you cannot decide your own approval request", 403, "FORBIDDEN");
      }

      const now = new Date();
      const newStatus = body.action === "APPROVE" ? SettingStatus.APPROVED : SettingStatus.REJECTED;

      const result = await prisma.$transaction(async (tx) => {
        let createdSchemeId: string | null = null;

        // If target is assessment scheme draft, update draft and create live scheme if approved
        if (approval.targetType === "ASSESSMENT_SCHEME" && approval.targetId) {
          const draft = await tx.assessmentSchemeDraft.findUnique({
            where: { id: approval.targetId },
          });

          if (draft) {
            if (body.action === "APPROVE") {
              const caParts = Array.isArray(draft.caParts)
                ? (draft.caParts as { name: string; maxScore: number; sortOrder: number }[])
                : [];

              const scheme = await tx.assessmentScheme.create({
                data: {
                  branchId: draft.branchId,
                  name: draft.name,
                  totalMax: draft.totalMax,
                  examMax: draft.examMax,
                  components: {
                    create: caParts.map((c, i) => ({
                      name: c.name || `CA ${i + 1}`,
                      maxScore: c.maxScore,
                      sortOrder: c.sortOrder ?? i + 1,
                    })),
                  },
                },
              });

              createdSchemeId = scheme.id;

              await tx.assessmentSchemeScope.create({
                data: {
                  schemeId: scheme.id,
                  level: SchemeScopeLevel.TEACHER_SUBJECT,
                  branchId: draft.branchId,
                  teacherUserId: draft.teacherUserId,
                  subjectId: draft.subjectId,
                  isShared: draft.isSharedWithBranch,
                },
              });

              await tx.assessmentSchemeDraft.update({
                where: { id: draft.id },
                data: {
                  status: SettingStatus.APPROVED,
                  approvedSchemeId: scheme.id,
                  rejectionReason: null,
                },
              });
            } else {
              // REJECT
              await tx.assessmentSchemeDraft.update({
                where: { id: draft.id },
                data: {
                  status: SettingStatus.REJECTED,
                  rejectionReason: body.decisionReason,
                },
              });
            }
          }
        }

        if (body.action === "APPROVE") await applyApprovedRequest(tx, approval);

        const updatedApproval = await tx.settingApproval.update({
          where: { id },
          data: {
            status: newStatus,
            deciderUserId: auth.userId,
            decidedAt: now,
            decisionReason: body.decisionReason,
          },
        });

        await tx.settingAudit.create({
          data: {
            settingKey: approval.settingKey,
            scope: approval.scope,
            branchId: approval.branchId,
            actorUserId: auth.userId,
            action: `APPROVAL_${body.action}`,
            oldValue: { status: approval.status },
            newValue: {
              status: newStatus,
              decisionReason: body.decisionReason,
              createdSchemeId,
            },
          },
        });

        return { updatedApproval, createdSchemeId };
      });

      return ok({
        approval: {
          id: result.updatedApproval.id,
          status: result.updatedApproval.status,
          decidedAt: result.updatedApproval.decidedAt?.toISOString(),
          decisionReason: result.updatedApproval.decisionReason,
          createdSchemeId: result.createdSchemeId,
        },
      });
    }),
  ),
  { roles: [Role.ADMIN] },
);
