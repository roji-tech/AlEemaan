import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { executePromotionSchema } from "@/lib/promotion/validation";
import { executePromotion } from "@/lib/promotion/service";

/**
 * POST /api/v1/academics/promotion/execute
 * Commits a bulk promotion batch, atomically updating source and target enrollments.
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return fail("Invalid JSON payload", 400, "INVALID_BODY");
      }

      const branchId = body?.branchId;
      if (!branchId || typeof branchId !== "string") {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = executePromotionSchema.safeParse(body);
      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid promotion execution payload",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        );
      }

      const result = await executePromotion(parsed.data, auth.userId);
      return ok(result, {}, 201);
    } catch (error) {
      console.error("[PROMOTION_EXECUTE_ERROR]", error);
      return fail("Unable to execute student promotion", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] }
);
