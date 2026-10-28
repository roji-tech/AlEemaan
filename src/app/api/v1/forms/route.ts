import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { FormStatus } from "@prisma/client";
import {
  createPracticeSet,
  listPracticeSetsForStaff,
  FormsServiceError,
} from "@/lib/forms/forms-service";
import { createPracticeSetSchema } from "@/lib/forms/validation";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms
 * Lists practice sets and forms in caller's branch.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req) => {
    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");
    const statusParam = url.searchParams.get("status");

    let status: FormStatus | "ALL" | undefined = undefined;
    if (statusParam === "ALL") {
      status = "ALL";
    } else if (statusParam && Object.values(FormStatus).includes(statusParam as FormStatus)) {
      status = statusParam as FormStatus;
    }

    try {
      const forms = await listPracticeSetsForStaff({
        branchId,
        status,
      });
      return ok({ forms });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("List forms error:", err);
      return fail("Failed to list forms", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);

/**
 * POST /api/v1/forms
 * Creates a new practice set (ungraded form).
 */
export const POST = withAuthGated(
  "staff-write",
  async (req, auth) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = createPracticeSetSchema.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid form payload", 400, "VALIDATION");
    }

    try {
      const result = await createPracticeSet({
        branchId: parsed.data.branchId,
        userId: auth.userId,
        title: parsed.data.title,
        instructions: parsed.data.instructions,
        opensAt: parsed.data.opensAt,
        closesAt: parsed.data.closesAt,
        maxDurationMinutes: parsed.data.maxDurationMinutes,
        classGroupIds: parsed.data.classGroupIds,
        questions: parsed.data.questions,
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Create form error:", err);
      return fail("Failed to create form", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
