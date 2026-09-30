import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";

const createBranchSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required").max(100),
});

/**
 * GET /api/v1/branches
 * Admin-only. Lists every branch. (401 = not signed in, 403 = signed in but
 * not an admin — the old requireAdmin() returned 401 for both.)
 */
export const GET = withAuth(
  async () => {
    const branches = await prisma.branch.findMany({ orderBy: { createdAt: "asc" } });
    return ok({ branches: branches.map((b) => ({ id: b.id, name: b.name })) });
  },
  { roles: [Role.ADMIN] },
);

/**
 * POST /api/v1/branches
 * Admin-only. Creates a new branch, audit-logged. No PATCH/DELETE yet — see
 * domain-implementation-plan.md §0.5.1.3 for why that's deliberately out of
 * scope for this phase.
 */
export const POST = withAuth(
  async (req, admin) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

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
  { roles: [Role.ADMIN] },
);
