import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { PromotionError } from "@/lib/promotion/service";
import { executePromotionSchema } from "@/lib/promotion/validation";
import { executePromotion } from "@/lib/promotion/service";
import { readJsonObject } from "@/lib/api/validate";

/**
 * POST /api/v1/academics/promotion/execute
 * Commits a bulk promotion batch, atomically updating source and target enrollments.
 */
export const POST = withAuthGated(
  "administer",
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const body = read.json;

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
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const result = await executePromotion(parsed.data, auth.userId);
      return ok(result, {}, 201);
    } catch (error) {
      if (error instanceof PromotionError) return fail(error.message, error.status, "PROMOTION_REFUSED");
      console.error("[PROMOTION_EXECUTE_ERROR]", error);
      return fail("Unable to execute student promotion", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
