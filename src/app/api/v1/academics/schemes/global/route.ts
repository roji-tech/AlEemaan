import { z } from "zod";
import { SchemeScopeLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { validateHierarchicalScheme } from "@/lib/settings/approvals";
import { audit } from "@/lib/academics/structure";

const globalSchemeInput = z.strictObject({
  branchId: z.string().optional(),
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
  isDefault: z.boolean().optional(),
});

type PostBody = Parsed<z.infer<typeof globalSchemeInput>, undefined>;

// GET /api/v1/academics/schemes/global - Superadmin only: list global assessment schemes
export const GET = withAuth(
  async () => {
    const scopes = await prisma.assessmentSchemeScope.findMany({
      where: { level: SchemeScopeLevel.GLOBAL },
      include: {
        scheme: {
          include: {
            components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const schemes = scopes.map((s) => ({
      scopeId: s.id,
      isDefault: s.isDefault,
      scheme: {
        id: s.scheme.id,
        name: s.scheme.name,
        totalMax: Number(s.scheme.totalMax),
        examMax: Number(s.scheme.examMax),
        components: s.scheme.components.map((c) => ({
          id: c.id,
          name: c.name,
          maxScore: Number(c.maxScore),
          sortOrder: c.sortOrder,
        })),
        locked: s.scheme.lockedAt !== null,
        archived: s.scheme.archivedAt !== null,
      },
    }));

    return ok({ schemes });
  },
  { superAdmin: true },
);

// POST /api/v1/academics/schemes/global - Superadmin only: create global assessment scheme
export const POST = withAuth(
  validate({ body: globalSchemeInput }, async (_req, auth, _ctx, { body }: PostBody) => {
    const validation = validateHierarchicalScheme({
      examMax: body.examMax,
      caParts: body.components,
    });

    if (!validation.valid || !validation.normalizedComponents) {
      return fail(validation.error || "Invalid assessment scheme components", 400, "BAD_REQUEST");
    }

    // Determine hosting branch for the scheme
    let hostBranchId = body.branchId;
    if (!hostBranchId) {
      const primaryBranch = await prisma.branch.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!primaryBranch) {
        return fail("No branch exists to host the scheme record", 400, "BAD_REQUEST");
      }
      hostBranchId = primaryBranch.id;
    }

    const isDefault = body.isDefault ?? true;

    // Transaction to create scheme and global scope
    const created = await prisma.$transaction(async (tx) => {
      // If marking as default, unset existing default global scopes
      if (isDefault) {
        await tx.assessmentSchemeScope.updateMany({
          where: { level: SchemeScopeLevel.GLOBAL, isDefault: true },
          data: { isDefault: false },
        });
      }

      const scheme = await tx.assessmentScheme.create({
        data: {
          branchId: hostBranchId,
          hosted: true,
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

      const scope = await tx.assessmentSchemeScope.create({
        data: {
          schemeId: scheme.id,
          level: SchemeScopeLevel.GLOBAL,
          isDefault,
        },
      });

      return { scheme, scope };
    });

    await audit(auth.userId, "GLOBAL_SCHEME_CREATE", "AssessmentScheme", created.scheme.id, {
      name: body.name,
      scopeId: created.scope.id,
      isDefault,
    });

    return ok(
      {
        scheme: {
          id: created.scheme.id,
          name: created.scheme.name,
          totalMax: Number(created.scheme.totalMax),
          examMax: Number(created.scheme.examMax),
          isDefault: created.scope.isDefault,
          components: created.scheme.components.map((c) => ({
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
  { superAdmin: true },
);
