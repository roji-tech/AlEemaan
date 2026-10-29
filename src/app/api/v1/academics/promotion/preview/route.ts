import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { PromotionError } from "@/lib/promotion/service";
import { promotionPreviewQuerySchema } from "@/lib/promotion/validation";
import { previewPromotion } from "@/lib/promotion/service";
import { readJsonObject } from "@/lib/api/validate";

/**
 * GET /api/v1/academics/promotion/preview
 */
export const GET = withAuthGated(
  "administer",
  async (req: NextRequest) => {
    try {
      const url = new URL(req.url);
      const branchId = url.searchParams.get("branchId");
      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const payload = {
        branchId,
        sourceSessionId: url.searchParams.get("sourceSessionId"),
        targetSessionId: url.searchParams.get("targetSessionId"),
        sourceClassGroupId: url.searchParams.get("sourceClassGroupId"),
        passMark: url.searchParams.get("passMark") || undefined,
      };

      const parsed = promotionPreviewQuerySchema.safeParse(payload);
      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid preview query parameters",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const preview = await previewPromotion(parsed.data);
      return ok(preview);
    } catch (error) {
      if (error instanceof PromotionError) return fail(error.message, error.status, "PROMOTION_REFUSED");
      console.error("[PROMOTION_PREVIEW_GET_ERROR]", error);
      return fail("Unable to generate promotion preview", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);

/**
 * POST /api/v1/academics/promotion/preview
 */
export const POST = withAuthGated(
  "administer",
  async (req: NextRequest) => {
    try {
      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const body = read.json;

      const branchId = body?.branchId;
      if (!branchId || typeof branchId !== "string") {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = promotionPreviewQuerySchema.safeParse(body);
      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid preview query parameters",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const preview = await previewPromotion(parsed.data);
      return ok(preview);
    } catch (error) {
      if (error instanceof PromotionError) return fail(error.message, error.status, "PROMOTION_REFUSED");
      console.error("[PROMOTION_PREVIEW_POST_ERROR]", error);
      return fail("Unable to generate promotion preview", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
