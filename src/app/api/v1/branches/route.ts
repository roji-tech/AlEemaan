import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { scopeOrForbidden } from "@/lib/members/http";
import { readJsonBody } from "@/lib/api/validate";

const createBranchSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required").max(100),
});

/**
 * GET /api/v1/branches
 * Administrators only: every branch for a superadmin, the caller's own branches for a branch administrator. (401 = not signed in, 403 = signed in but
 * not an admin — the old requireAdmin() returned 401 for both.)
 */
export const GET = withAuth(
  async (_req, auth) => {
    // A superadmin sees every branch; a branch administrator only the ones they administer (the branch pickers on the Users pages).
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const branches = await prisma.branch.findMany({
      where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
      orderBy: { createdAt: "asc" },
    });
    return ok({ branches: branches.map((b) => ({ id: b.id, name: b.name })) });
  },
  { roles: [Role.ADMIN] },
);

/**
 * POST /api/v1/branches
 * Superadmin only. Creates a new branch, audit-logged. No PATCH/DELETE yet — see
 * domain-implementation-plan.md §0.5.1.3 for why that's deliberately out of
 * scope for this phase.
 */
export const POST = withAuth(
  async (req, admin) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const body = read.json;

    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid payload", 400, "VALIDATION");
    }

    try {
      const branch = await prisma.$transaction(async (tx) => {
        const created = await tx.branch.create({ data: { name: parsed.data.name } });

        await tx.auditLog.create({
          data: {
            actorUserId: admin.userId,
            action: "BRANCH_CREATED",
            targetType: "Branch",
            targetId: created.id,
            afterValue: { name: created.name },
          },
        });

        return created;
      });

      return ok({ branch: { id: branch.id, name: branch.name } }, {}, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return fail("A branch with this name already exists", 409, "DUPLICATE_NAME");
      }
      console.error("[BRANCH_CREATE_ERROR]", error);
      return fail("An unexpected error occurred. Please try again.", 500, "INTERNAL");
    }
  },
  { superAdmin: true },
);
