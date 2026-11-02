import { ok, fail, noStore } from "@/lib/api/envelope";
import { sanitizePathParams } from "@/lib/api/ids";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { readJsonBody } from "@/lib/api/validate";
import { submitQuestionnaireSchema } from "@/lib/forms/validation";
import { submitPublicQuestionnaire } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";
import { ALREADY_ANSWERED_HERE, answeredHere, markAnsweredHere } from "@/lib/forms/public-answered";

type Context = { params: Promise<{ token: string }> };

/**
 * POST /api/v1/forms/public/[token]/submit
 * Public endpoint to submit questionnaire responses. Once an answer is stored, this browser is marked as having answered (a cookie holding no identity), and a second answer from it is refused.
 */
export async function POST(req: Request, context: Context) {
  if (!(await reserveAttempt(`public-form-submit:${getClientIp(req)}`, 60))) {
    return noStore(fail("Too many submissions. Please wait a few minutes and try again.", 429, "RATE_LIMITED"));
  }

  // No sign-in, so no withAuth: see the GET route.
  const { token } = sanitizePathParams(await context.params);

  // This browser answered already (a courtesy check, not a guarantee: see public-answered.ts). Asked before anything is read or stored.
  if (answeredHere(req, token)) return noStore(fail(ALREADY_ANSWERED_HERE, 409, "ALREADY_SUBMITTED"));

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
    return noStore(markAnsweredHere(ok(result), token));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Public submit questionnaire error:", err);
    return noStore(fail("Failed to submit questionnaire", 500));
  }
}
