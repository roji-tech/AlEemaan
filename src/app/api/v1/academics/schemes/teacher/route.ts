import { z } from "zod";
import { Role, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { validateHierarchicalScheme } from "@/lib/settings/approvals";
import { audit } from "@/lib/academics/structure";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";

const teacherSchemeQuery = z.object({
  branchId: z.string().min(1, "branchId is required"),
  subjectId: z.string().optional(),
});

const teacherSchemeInput = z.strictObject({
  branchId: z.string().min(1, "branchId is required"),
  subjectId: z.string().min(1, "subjectId is required"),
  name: z.string().trim().min(1, "Name is required").max(60, "Use at most 60 characters"),
  examMax: z.number({ error: "Exam max is required" }),
  components: z
    .array(
      z.strictObject({
        name: z.string().optional(),
        maxScore: z.number({ error: "Max score is required" }),
      }),
    )
    .min(1, "At least one CA component is required"),
  reason: z.string().trim().min(1, "Reason is required").max(500),
  isSharedWithBranch: z.boolean().optional(),
  submitForApproval: z.boolean().optional(),
});

type Query = Parsed<undefined, z.infer<typeof teacherSchemeQuery>>;
type PostBody = Parsed<z.infer<typeof teacherSchemeInput>, undefined>;

// GET /api/v1/academics/schemes/teacher?branchId=&subjectId=
// Lists drafts/schemes created by teacher or shared with branch
export const GET = withAuth(
  validate(
    { query: teacherSchemeQuery },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "staff-read" }, async (_req, auth, _ctx, { query }) =>
      structureCall("TEACHER_SCHEMES_LIST", async () => {
        const drafts = await prisma.assessmentSchemeDraft.findMany({
          where: {
            branchId: query.branchId,
            ...(query.subjectId ? { subjectId: query.subjectId } : {}),
            OR: [{ teacherUserId: auth.userId }, { isSharedWithBranch: true }],
          },
          include: {
            subject: { select: { id: true, name: true, code: true } },
            teacher: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
        });

        return ok({
          drafts: drafts.map((d) => ({
            id: d.id,
            branchId: d.branchId,
            subjectId: d.subjectId,
            subjectName: d.subject.name,
            teacherUserId: d.teacherUserId,
            teacherName: d.teacher.name,
            name: d.name,
            totalMax: Number(d.totalMax),
            examMax: Number(d.examMax),
            components: Array.isArray(d.caParts) ? d.caParts : [],
            reason: d.reason,
            status: d.status,
            rejectionReason: d.rejectionReason,
            isSharedWithBranch: d.isSharedWithBranch,
            approvalId: d.approvalId,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
          })),
        });
      }),
    ),
  ),
  { roles: READ_ROLES },
);

// POST /api/v1/academics/schemes/teacher
// Creates a teacher scheme draft, optionally submitting for approval
export const POST = withAuth(
  validate(
    { body: teacherSchemeInput },
    withBranch<PostBody, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "staff-write", where: "body" },
      async (_req, auth, _ctx, { body }, branch) =>
        structureCall("TEACHER_SCHEME_CREATE", async () => {
          // Verify subject belongs to branch
          const subject = await prisma.subject.findFirst({
            where: { id: body.subjectId, branchId: branch.branchId },
          });
          if (!subject) {
            return fail("Subject not found in this branch", 404, "NOT_FOUND");
          }

          const validation = validateHierarchicalScheme({
            examMax: body.examMax,
            caParts: body.components,
          });

          if (!validation.valid || !validation.normalizedComponents) {
            return fail(validation.error || "Invalid assessment scheme components", 400, "BAD_REQUEST");
          }

          const submit = body.submitForApproval ?? false;
          const status = submit ? SettingStatus.PENDING : SettingStatus.DRAFT;

          const created = await prisma.$transaction(async (tx) => {
            const draft = await tx.assessmentSchemeDraft.create({
              data: {
                branchId: branch.branchId,
                teacherUserId: auth.userId,
                subjectId: body.subjectId,
                name: body.name,
                examMax: body.examMax,
                totalMax: 100,
                caParts: validation.normalizedComponents!,
                reason: body.reason,
                status,
                isSharedWithBranch: body.isSharedWithBranch ?? false,
              },
            });

            if (submit) {
              const approval = await tx.settingApproval.create({
                data: {
                  settingKey: `teacher_scheme:${draft.id}`,
                  targetType: "ASSESSMENT_SCHEME",
                  targetId: draft.id,
                  scope: "BRANCH",
                  branchId: branch.branchId,
                  actorUserId: auth.userId,
                  reason: body.reason,
                  status: SettingStatus.PENDING,
                  proposedValue: {
                    name: body.name,
                    subjectId: body.subjectId,
                    examMax: body.examMax,
                    components: validation.normalizedComponents,
                  },
                },
              });

              await tx.assessmentSchemeDraft.update({
                where: { id: draft.id },
                data: { approvalId: approval.id },
              });

              return { draft, approvalId: approval.id };
            }

            return { draft, approvalId: null };
          });

          await audit(auth.userId, "TEACHER_SCHEME_CREATE", "AssessmentSchemeDraft", created.draft.id, {
            branchId: branch.branchId,
            subjectId: body.subjectId,
            name: body.name,
            submitted: submit,
          });

          return ok(
            {
              draft: {
                id: created.draft.id,
                branchId: created.draft.branchId,
                subjectId: created.draft.subjectId,
                name: created.draft.name,
                totalMax: Number(created.draft.totalMax),
                examMax: Number(created.draft.examMax),
                components: created.draft.caParts,
                reason: created.draft.reason,
                status: created.draft.status,
                isSharedWithBranch: created.draft.isSharedWithBranch,
                approvalId: created.approvalId,
              },
            },
            {},
            201,
          );
        }),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
