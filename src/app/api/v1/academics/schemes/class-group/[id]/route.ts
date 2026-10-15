import { z } from "zod";
import { Role, SchemeScopeLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { validateHierarchicalScheme } from "@/lib/settings/approvals";
import { audit } from "@/lib/academics/structure";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

const classGroupSchemeInput = z.strictObject({
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
});

const classGroupSchemePatch = z
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
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

const classGroupBranchId = async (classGroupId: string) =>
  (await prisma.classGroup.findUnique({ where: { id: classGroupId }, select: { branchId: true } }))?.branchId ?? null;

// GET /api/v1/academics/schemes/class-group/[id] - Read class group's assessment scheme
export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => classGroupBranchId((await ctx.params).id), as: "staff-read", refuse: () => notFound("ClassGroup") },
    async (_req, _auth, ctx, _input, branch) =>
      structureCall("CLASS_GROUP_SCHEME_GET", async () => {
        const classGroupId = (await ctx.params).id;

        // Check scope or direct classGroupId
        const scope = await prisma.assessmentSchemeScope.findFirst({
          where: {
            level: SchemeScopeLevel.CLASS_GROUP,
            branchId: branch.branchId,
            classGroupId,
            scheme: { archivedAt: null },
          },
          include: {
            scheme: {
              include: {
                components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
              },
            },
          },
        });

        const scheme =
          scope?.scheme ??
          (await prisma.assessmentScheme.findFirst({
            where: { branchId: branch.branchId, classGroupId, archivedAt: null },
            include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
          }));

        if (!scheme) return notFound("Scheme");

        return ok({
          scheme: {
            id: scheme.id,
            branchId: scheme.branchId,
            classGroupId: scheme.classGroupId,
            name: scheme.name,
            totalMax: Number(scheme.totalMax),
            examMax: Number(scheme.examMax),
            version: scheme.version,
            locked: scheme.lockedAt !== null,
            archived: scheme.archivedAt !== null,
            components: scheme.components.map((c) => ({
              id: c.id,
              name: c.name,
              maxScore: Number(c.maxScore),
              sortOrder: c.sortOrder,
            })),
          },
        });
      }),
  ),
  { roles: READ_ROLES },
);

// POST /api/v1/academics/schemes/class-group/[id] - Create scheme for class group (administer)
export const POST = withAuth<Context>(
  validate(
    { body: classGroupSchemeInput },
    withBranch<Parsed<z.infer<typeof classGroupSchemeInput>, undefined>, AuthContext, Context>(
      { of: async (_i, _r, ctx) => classGroupBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("ClassGroup") },
      async (_req, auth, ctx, { body }, branch) =>
        structureCall("CLASS_GROUP_SCHEME_CREATE", async () => {
          const classGroupId = (await ctx.params).id;

          const validation = validateHierarchicalScheme({
            examMax: body.examMax,
            caParts: body.components,
          });

          if (!validation.valid || !validation.normalizedComponents) {
            return fail(validation.error || "Invalid assessment scheme components", 400, "BAD_REQUEST");
          }

          const created = await prisma.$transaction(async (tx) => {
            const scheme = await tx.assessmentScheme.create({
              data: {
                branchId: branch.branchId,
                classGroupId,
                name: body.name,
                totalMax: 100,
                examMax: body.examMax,
                components: {
                  create: validation.normalizedComponents!.map((c) => ({
                    name: c.name,
                    maxScore: c.maxScore,
                    sortOrder: c.sortOrder,
                  })),
                },
              },
              include: {
                components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
              },
            });

            await tx.assessmentSchemeScope.create({
              data: {
                schemeId: scheme.id,
                level: SchemeScopeLevel.CLASS_GROUP,
                branchId: branch.branchId,
                classGroupId,
              },
            });

            return scheme;
          });

          await audit(auth.userId, "CLASS_GROUP_SCHEME_CREATE", "AssessmentScheme", created.id, {
            classGroupId,
            name: body.name,
          });

          return ok(
            {
              scheme: {
                id: created.id,
                branchId: created.branchId,
                classGroupId: created.classGroupId,
                name: created.name,
                totalMax: Number(created.totalMax),
                examMax: Number(created.examMax),
                components: created.components.map((c) => ({
                  id: c.id,
                  name: c.name,
                  maxScore: Number(c.maxScore),
                  sortOrder: c.sortOrder,
                })),
              },
            },
            {},
            201,
          );
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);

// PATCH /api/v1/academics/schemes/class-group/[id] - Update scheme for class group (administer)
export const PATCH = withAuth<Context>(
  validate(
    { body: classGroupSchemePatch },
    withBranch<Parsed<z.infer<typeof classGroupSchemePatch>, undefined>, AuthContext, Context>(
      { of: async (_i, _r, ctx) => classGroupBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("ClassGroup") },
      async (_req, auth, ctx, { body }, branch) =>
        structureCall("CLASS_GROUP_SCHEME_UPDATE", async () => {
          const classGroupId = (await ctx.params).id;

          const existing = await prisma.assessmentScheme.findFirst({
            where: { branchId: branch.branchId, classGroupId, archivedAt: null },
            include: { components: true },
          });

          if (!existing) return notFound("Scheme");

          if (existing.lockedAt !== null) {
            return fail(
              "This scheme is locked because results reference it. A change must supersede it as a new version.",
              409,
              "CONFLICT",
            );
          }

          // If components or examMax changed, validate
          const examMax = body.examMax ?? Number(existing.examMax);
          const components = body.components
            ? body.components.map((c) => ({ name: c.name, maxScore: c.maxScore }))
            : existing.components.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) }));

          const validation = validateHierarchicalScheme({
            examMax,
            caParts: components,
          });

          if (!validation.valid || !validation.normalizedComponents) {
            return fail(validation.error || "Invalid assessment scheme components", 400, "BAD_REQUEST");
          }

          const updated = await prisma.$transaction(async (tx) => {
            if (body.components) {
              await tx.assessmentComponent.deleteMany({
                where: { schemeId: existing.id },
              });
              await tx.assessmentComponent.createMany({
                data: validation.normalizedComponents!.map((c) => ({
                  branchId: branch.branchId,
                  schemeId: existing.id,
                  name: c.name,
                  maxScore: c.maxScore,
                  sortOrder: c.sortOrder,
                })),
              });
            }

            return tx.assessmentScheme.update({
              where: { id: existing.id },
              data: {
                name: body.name ?? existing.name,
                examMax,
              },
              include: {
                components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
              },
            });
          });

          await audit(auth.userId, "CLASS_GROUP_SCHEME_UPDATE", "AssessmentScheme", updated.id, {
            classGroupId,
            name: updated.name,
          });

          return ok({
            scheme: {
              id: updated.id,
              branchId: updated.branchId,
              classGroupId: updated.classGroupId,
              name: updated.name,
              totalMax: Number(updated.totalMax),
              examMax: Number(updated.examMax),
              components: updated.components.map((c) => ({
                id: c.id,
                name: c.name,
                maxScore: Number(c.maxScore),
                sortOrder: c.sortOrder,
              })),
            },
          });
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
