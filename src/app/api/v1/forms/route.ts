import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { FormAudienceKind, FormKind, FormStatus } from "@prisma/client";
import {
  createPracticeSet,
  listPracticeSetsForStaff,
  FormsServiceError,
} from "@/lib/forms/forms-service";
import {
  createQuestionnaire,
  listQuestionnairesForStaff,
} from "@/lib/forms/questionnaires-service";
import {
  createPracticeSetSchema,
  createQuestionnaireSchema,
} from "@/lib/forms/validation";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms
 * Lists practice sets or questionnaires in caller's branch.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req) => {
    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");
    const statusParam = url.searchParams.get("status");
    const kindParam = url.searchParams.get("kind");

    let status: FormStatus | "ALL" | undefined = undefined;
    if (statusParam === "ALL") {
      status = "ALL";
    } else if (statusParam && Object.values(FormStatus).includes(statusParam as FormStatus)) {
      status = statusParam as FormStatus;
    }

    try {
      if (kindParam === FormKind.QUESTIONNAIRE) {
        const questionnaires = await listQuestionnairesForStaff({
          branchId,
          status,
        });
        return ok({ forms: questionnaires });
      }

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
 * Creates a new form (practice set or questionnaire).
 */
export const POST = withAuthGated(
  "staff-write",
  async (req, auth) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const raw = (read.json && typeof read.json === "object" ? read.json : {}) as Record<string, unknown>;

    try {
      if (raw.kind === FormKind.QUESTIONNAIRE) {
        const parsed = createQuestionnaireSchema.safeParse(raw);
        if (!parsed.success) {
          return fail(parsed.error.issues[0]?.message ?? "Invalid questionnaire payload", 400, "VALIDATION");
        }

        const result = await createQuestionnaire({
          branchId: parsed.data.branchId,
          userId: auth.userId,
          title: parsed.data.title,
          instructions: parsed.data.instructions,
          isAnonymous: parsed.data.isAnonymous,
          audienceKind: parsed.data.audienceKind as FormAudienceKind,
          roles: parsed.data.roles,
          classGroupIds: parsed.data.classGroupIds,
          opensAt: parsed.data.opensAt,
          closesAt: parsed.data.closesAt,
          questions: parsed.data.questions,
        });
        return ok(result, {}, 201);
      }

      const parsed = createPracticeSetSchema.safeParse(raw);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid form payload", 400, "VALIDATION");
      }

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

