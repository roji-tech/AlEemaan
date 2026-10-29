import { ok, fail, noStore } from "@/lib/api/envelope";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { readJsonBody } from "@/lib/api/validate";
import { submitQuestionnaireSchema } from "@/lib/forms/validation";
import { submitPublicQuestionnaire } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

type Context = { params: Promise<{ token: string }> };

/**
 * POST /api/v1/forms/public/[token]/submit
 * Public endpoint to submit questionnaire responses.
 */
export async function POST(req: Request, context: Context) {
  if (!(await reserveAttempt(`public-form-submit:${getClientIp(req)}`, 60))) {
    return noStore(fail("Too many submissions. Please wait a few minutes and try again.", 429, "RATE_LIMITED"));
  }

  const { token } = await context.params;

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);

  const parsed = submitQuestionnaireSchema.safeParse(read.json);
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid submission payload", 400, "VALIDATION"));
  }

  try {
    const result = await submitPublicQuestionnaire({
      token,
      answers: parsed.data.answers,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Public submit questionnaire error:", err);
    return noStore(fail("Failed to submit questionnaire", 500));
  }
}
