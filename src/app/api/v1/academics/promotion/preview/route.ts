import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { promotionPreviewQuerySchema } from "@/lib/promotion/validation";
import { previewPromotion } from "@/lib/promotion/service";

/**
 * GET /api/v1/academics/promotion/preview
 */
export const GET = withAuth(
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
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        );
      }

      const preview = await previewPromotion(parsed.data);
      return ok(preview);
    } catch (error) {
      console.error("[PROMOTION_PREVIEW_GET_ERROR]", error);
      return fail("Unable to generate promotion preview", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] }
);

/**
 * POST /api/v1/academics/promotion/preview
 */
export const POST = withAuth(
  async (req: NextRequest) => {
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

      const parsed = promotionPreviewQuerySchema.safeParse(body);
      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid preview query parameters",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        );
      }

      const preview = await previewPromotion(parsed.data);
      return ok(preview);
    } catch (error) {
      console.error("[PROMOTION_PREVIEW_POST_ERROR]", error);
      return fail("Unable to generate promotion preview", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] }
);
