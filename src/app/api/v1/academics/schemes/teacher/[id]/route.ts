import { z } from "zod";
import { Role, SettingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { validateHierarchicalScheme } from "@/lib/settings/approvals";
import { audit } from "@/lib/academics/structure";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

const patchDraftInput = z
  .strictObject({
    name: z.string().trim().min(1).max(60).optional(),
    examMax: z.number().optional(),
    components: z
      .array(
        z.strictObject({
          name: z.string().optional(),
          maxScore: z.number(),
        }),
      )
      .optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    isSharedWithBranch: z.boolean().optional(),
    submitForApproval: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

// GET /api/v1/academics/schemes/teacher/[id] - Read specific teacher scheme draft
export const GET = withAuth<Context>(
  async (_req, auth, ctx) =>
    structureCall("TEACHER_SCHEME_GET", async () => {
      const id = (await ctx.params).id;
      const draft = await prisma.assessmentSchemeDraft.findUnique({
        where: { id },
        include: {
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, name: true } },
        },
      });

      if (!draft) return notFound("TeacherSchemeDraft");

      // Verify caller is either the owner, or an admin/staff with access if shared
      if (draft.teacherUserId !== auth.userId && !draft.isSharedWithBranch) {
        const adminMembership = await prisma.membership.findFirst({
          where: { userId: auth.userId, branchId: draft.branchId, role: Role.ADMIN },
        });
        if (!adminMembership && !(await isSuperAdmin(auth.userId))) {
          return notFound("TeacherSchemeDraft");
        }
      }

      return ok({
        draft: {
          id: draft.id,
          branchId: draft.branchId,
          subjectId: draft.subjectId,
          subjectName: draft.subject.name,
          teacherUserId: draft.teacherUserId,
          teacherName: draft.teacher.name,
          name: draft.name,
          totalMax: Number(draft.totalMax),
          examMax: Number(draft.examMax),
          components: Array.isArray(draft.caParts) ? draft.caParts : [],
          reason: draft.reason,
          status: draft.status,
          rejectionReason: draft.rejectionReason,
          isSharedWithBranch: draft.isSharedWithBranch,
          approvalId: draft.approvalId,
          createdAt: draft.createdAt.toISOString(),
          updatedAt: draft.updatedAt.toISOString(),
        },
      });
    }),
  { roles: READ_ROLES },
);

// PATCH /api/v1/academics/schemes/teacher/[id] - Edit draft or submit for approval
export const PATCH = withAuth<Context>(
  validate({ body: patchDraftInput }, async (_req, auth, ctx, { body }: Parsed<z.infer<typeof patchDraftInput>, undefined>) =>
    structureCall("TEACHER_SCHEME_PATCH", async () => {
      const id = (await ctx.params).id;
      const draft = await prisma.assessmentSchemeDraft.findUnique({
        where: { id },
      });

      if (!draft) return notFound("TeacherSchemeDraft");

      if (draft.teacherUserId !== auth.userId && !(await isSuperAdmin(auth.userId))) {
        return fail("Only the teacher who created this draft can edit it", 403, "FORBIDDEN");
      }

      if (draft.status === SettingStatus.APPROVED) {
        return fail("An approved scheme cannot be edited directly. Create a new draft.", 409, "CONFLICT");
      }

      // Validate components if either components or examMax changed
      let normalizedComponents = draft.caParts;
      const examMax = body.examMax ?? Number(draft.examMax);

      if (body.components || body.examMax) {
        const componentsToValidate = body.components
          ? body.components.map((c) => ({ name: c.name, maxScore: c.maxScore }))
          : (draft.caParts as { name: string; maxScore: number }[]);

        const validation = validateHierarchicalScheme({
          examMax,
          caParts: componentsToValidate,
        });

        if (!validation.valid || !validation.normalizedComponents) {
          return fail(validation.error || "Invalid assessment scheme components", 400, "BAD_REQUEST");
        }
        normalizedComponents = validation.normalizedComponents;
      }

      const submit = body.submitForApproval;
      const newStatus = submit ? SettingStatus.PENDING : draft.status === SettingStatus.REJECTED ? SettingStatus.DRAFT : draft.status;

      const updated = await prisma.$transaction(async (tx) => {
        let approvalId = draft.approvalId;

        if (submit) {
          const approval = await tx.settingApproval.create({
            data: {
              settingKey: `teacher_scheme:${draft.id}`,
              targetType: "ASSESSMENT_SCHEME",
              targetId: draft.id,
              scope: "BRANCH",
              branchId: draft.branchId,
              actorUserId: auth.userId,
              reason: body.reason ?? draft.reason,
              status: SettingStatus.PENDING,
              proposedValue: {
                name: body.name ?? draft.name,
                subjectId: draft.subjectId,
                examMax,
                components: normalizedComponents,
              },
            },
          });
          approvalId = approval.id;
        }

        return tx.assessmentSchemeDraft.update({
          where: { id },
          data: {
            name: body.name ?? draft.name,
            examMax,
            caParts: normalizedComponents as Prisma.InputJsonValue,
            reason: body.reason ?? draft.reason,
            isSharedWithBranch: body.isSharedWithBranch ?? draft.isSharedWithBranch,
            status: newStatus,
            approvalId,
            ...(submit ? { rejectionReason: null } : {}),
          },
        });
      });

      await audit(auth.userId, "TEACHER_SCHEME_PATCH", "AssessmentSchemeDraft", updated.id, {
        branchId: updated.branchId,
        submitted: Boolean(submit),
        status: updated.status,
      });

      return ok({
        draft: {
          id: updated.id,
          branchId: updated.branchId,
          subjectId: updated.subjectId,
          name: updated.name,
          totalMax: Number(updated.totalMax),
          examMax: Number(updated.examMax),
          components: updated.caParts,
          reason: updated.reason,
          status: updated.status,
          isSharedWithBranch: updated.isSharedWithBranch,
          approvalId: updated.approvalId,
        },
      });
    }),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
