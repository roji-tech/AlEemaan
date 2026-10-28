import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import {
  getPracticeSetForStaff,
  updatePracticeSet,
  FormsServiceError,
} from "@/lib/forms/forms-service";
import { updatePracticeSetSchema } from "@/lib/forms/validation";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms/[id]
 * Staff gets practice set details and complete questions.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      const form = await getPracticeSetForStaff({
        formId: id,
        branchId,
      });
      return ok({ form });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Get form error:", err);
      return fail("Failed to load form", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);

/**
 * PATCH /api/v1/forms/[id]
 * Staff updates practice set fields, dates, or publishing status.
 */
export const PATCH = withAuthGated(
  "staff-write",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = updatePracticeSetSchema.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid form update payload", 400, "VALIDATION");
    }

    const url = new URL(req.url);
    const branchId = parsed.data.branchId || url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      const result = await updatePracticeSet({
        formId: id,
        branchId,
        userId: auth.userId,
        title: parsed.data.title,
        instructions: parsed.data.instructions,
        status: parsed.data.status,
        opensAt: parsed.data.opensAt,
        closesAt: parsed.data.closesAt,
        maxDurationMinutes: parsed.data.maxDurationMinutes,
        classGroupIds: parsed.data.classGroupIds,
      });
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Update form error:", err);
      return fail("Failed to update form", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
