import { ok, fail, noStore } from "@/lib/api/envelope";
import { sanitizePathParams } from "@/lib/api/ids";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { getPublicQuestionnaireByToken } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

type Context = { params: Promise<{ token: string }> };

/**
 * GET /api/v1/forms/public/[token]
 * Public endpoint to retrieve questionnaire questions and instructions without sign-in.
 */
export async function GET(req: Request, context: Context) {
  if (!(await reserveAttempt(`public-form:${getClientIp(req)}`, 120))) {
    return noStore(fail("Too many requests. Please wait a few minutes and try again.", 429, "RATE_LIMITED"));
  }

  // No sign-in, so no withAuth: an unusable token (a NUL byte, a control character, an absurd length) is replaced here, and the lookup answers as for any token that does not exist.
  const { token } = sanitizePathParams(await context.params);

  try {
    const questionnaire = await getPublicQuestionnaireByToken(token);
    return noStore(ok({ questionnaire }));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Get public questionnaire error:", err);
    return noStore(fail("Failed to load questionnaire", 500));
  }
}
