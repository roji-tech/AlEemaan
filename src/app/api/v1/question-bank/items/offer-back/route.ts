import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema } from "@/lib/question-bank/validation";
import { offerBackItem } from "@/lib/question-bank/items-service";
import { BANK_STAFF_ROLES, failure } from "@/lib/question-bank/items-http";
import { offerBackSchema } from "@/lib/lms/validation";

const OfferBackBody = offerBackSchema.extend({
  branchId: idSchema,
});

/**
 * POST /api/v1/question-bank/items/offer-back
 * Offers an assessment/quiz question back to the Question Bank as a new item.
 * (Design Rule 8.3: A copy that differs from its source can be offered as a new bank item, never an overwrite).
 * Enters the review queue as PENDING; triggers silent similarity overlap check.
 */
export const POST = withAuthGated(
  "staff-read",
  async (req, auth) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = OfferBackBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid offer-back payload", 400, "VALIDATION");
    }

    const { branchId, quizId, quizQuestionId, subjectLabel, topic, difficulty } = parsed.data;

    const result = await offerBackItem({
      userId: auth.userId,
      branchId,
      quizId,
      quizQuestionId,
      subjectLabel,
      topic,
      difficulty,
    });

    if (!result.ok) return failure(result);
    return ok({ item: result.item }, {}, 201);
  },
  { roles: BANK_STAFF_ROLES },
);
